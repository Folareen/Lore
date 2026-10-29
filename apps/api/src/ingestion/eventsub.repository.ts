import { expireCandidates } from '../ai/candidate-retention';
import { purgeChannel } from '../retention/channel-retention';
import { PublicationsRepository } from '../publications/publications.repository';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq, isNull, max, sql } from 'drizzle-orm';
import { captureScopes, twitchEventTypeSchema } from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
import {
  auditEvents,
  channels,
  chatMessages,
  oauthConnections,
  sourceEvents,
  twitchSubscriptions,
} from '../database/schema';
import {
  chatSchema,
  eventSchemas,
  subscriptionSchema,
} from './eventsub.schemas';
import type { z } from 'zod';
import { OpenLoopsRepository } from '../open-loops/open-loops.repository';
type Subscription = z.infer<typeof subscriptionSchema>;
type Transaction = Parameters<
  Parameters<InfrastructureService['db']['transaction']>[0]
>[0];

@Injectable()
export class EventsubRepository {
  constructor(
    @Inject(PublicationsRepository)
    private readonly publications: PublicationsRepository,
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(OpenLoopsRepository)
    private readonly openLoops: OpenLoopsRepository,
  ) {}
  async withReconciliation(operation: () => Promise<void>) {
    await this.infrastructure.db.transaction(async (tx) => {
      const lock = await tx.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(197642881) AS locked`,
      );
      if (lock.rows[0]?.locked) await operation();
    });
  }
  async owner(channelId: string, userId: string) {
    const [channel] = await this.infrastructure.db
      .select()
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.ownerUserId, userId)));
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }
  async missingScopes(userId: string) {
    const [connection] = await this.infrastructure.db
      .select()
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, userId));
    return captureScopes.filter(
      (scope) =>
        !connection ||
        connection.revokedAt ||
        !connection.scopes.includes(scope),
    );
  }
  async requestCapture(channelId: string, userId: string, requested: boolean) {
    await this.infrastructure.db.transaction(async (tx) => {
      const [channel] = await tx
        .select()
        .from(channels)
        .where(
          and(eq(channels.id, channelId), eq(channels.ownerUserId, userId)),
        )
        .for('update');
      if (!channel) throw new NotFoundException('Channel not found');
      if (requested && (!channel.connectedAt || channel.disconnectedAt))
        throw new ConflictException(
          'Connect the channel before starting capture',
        );
      await tx
        .update(channels)
        .set({
          captureRequested: requested,
          ...(!requested
            ? {
                catchupEnabled: false,
                catchupGeneration: channel.catchupGeneration + 1,
              }
            : {}),
          captureStartedAt:
            requested && !channel.captureRequested
              ? new Date()
              : channel.captureStartedAt,
          captureError: null,
          updatedAt: new Date(),
        })
        .where(eq(channels.id, channelId));
      await tx.insert(auditEvents).values({
        channelId,
        actorId: userId,
        action: requested ? 'capture.started' : 'capture.stopped',
        targetId: channelId,
      });
    });
  }
  async status(channelId: string, userId: string, configured: boolean) {
    const channel = await this.owner(channelId, userId);
    const subscriptions = await this.infrastructure.db
      .select({
        type: twitchSubscriptions.type,
        status: twitchSubscriptions.status,
      })
      .from(twitchSubscriptions)
      .where(eq(twitchSubscriptions.channelId, channelId));
    const [totals] = await this.infrastructure.db
      .select({
        pending: count(
          sql`case when ${sourceEvents.processedAt} is null and ${sourceEvents.failedAt} is null then 1 end`,
        ),
        failed: count(sourceEvents.failedAt),
        last: max(sourceEvents.receivedAt),
      })
      .from(sourceEvents)
      .where(eq(sourceEvents.channelId, channelId));
    return {
      configured,
      requested: channel.captureRequested,
      missingScopes: await this.missingScopes(userId),
      error: channel.captureError,
      subscriptions,
      pending: totals.pending,
      failed: totals.failed,
      lastReceivedAt: totals.last ? new Date(totals.last).toISOString() : null,
    };
  }
  async managedChannels() {
    return this.infrastructure.db
      .select()
      .from(channels)
      .where(eq(channels.origin, 'live_twitch'));
  }
  async error(
    channelId: string,
    error: 'authorization_required' | 'provider_unavailable' | null,
  ) {
    await this.infrastructure.db
      .update(channels)
      .set({
        captureError: error,
        ...(error === 'authorization_required'
          ? {
              captureRequested: false,
              catchupEnabled: false,
              catchupGeneration: sql`${channels.catchupGeneration}+1`,
            }
          : {}),
      })
      .where(
        and(eq(channels.id, channelId), eq(channels.captureRequested, true)),
      );
  }
  async saveSubscription(
    channelId: string,
    sub: { id: string; type: string; status: string },
  ) {
    await this.infrastructure.db
      .insert(twitchSubscriptions)
      .values({ id: sub.id, type: sub.type, status: sub.status, channelId })
      .onConflictDoUpdate({
        target: twitchSubscriptions.id,
        set: { status: sub.status, updatedAt: new Date() },
        setWhere: and(
          eq(twitchSubscriptions.channelId, channelId),
          sub.status === 'webhook_callback_verification_pending'
            ? sql`${twitchSubscriptions.status} != 'enabled'`
            : undefined,
        ),
      });
  }
  async removedSubscription(channelId: string, id: string) {
    await this.infrastructure.db
      .update(twitchSubscriptions)
      .set({ status: 'removed', updatedAt: new Date() })
      .where(
        and(
          eq(twitchSubscriptions.channelId, channelId),
          eq(twitchSubscriptions.id, id),
        ),
      );
  }
  async knownSubscriptions(channelId: string) {
    return this.infrastructure.db
      .select()
      .from(twitchSubscriptions)
      .where(eq(twitchSubscriptions.channelId, channelId));
  }
  // Channel lock serializes deletes, deliveries, stop/disconnect and worker writes.
  async receive(
    sub: Subscription,
    deliveryId: string,
    occurredAt: Date,
    kind: string,
    payload?: Record<string, unknown>,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      const [channel] = await tx
        .select()
        .from(channels)
        .where(
          and(
            eq(channels.twitchChannelId, sub.condition.broadcaster_user_id),
            eq(channels.origin, 'live_twitch'),
          ),
        )
        .for('update');
      if (
        !channel ||
        !channel.connectedAt ||
        channel.disconnectedAt ||
        !channel.captureRequested
      )
        return false;
      if (kind === 'webhook_callback_verification') {
        await tx
          .insert(twitchSubscriptions)
          .values({
            id: sub.id,
            channelId: channel.id,
            type: sub.type,
            status: 'enabled',
          })
          .onConflictDoUpdate({
            target: twitchSubscriptions.id,
            set: { status: 'enabled', updatedAt: new Date() },
            setWhere: eq(twitchSubscriptions.channelId, channel.id),
          });
        return true;
      }
      const [known] = await tx
        .select()
        .from(twitchSubscriptions)
        .where(
          and(
            eq(twitchSubscriptions.id, sub.id),
            eq(twitchSubscriptions.channelId, channel.id),
            eq(twitchSubscriptions.type, sub.type),
          ),
        );
      if (!known || known.status !== 'enabled') return false;
      if (kind === 'revocation') {
        await tx
          .update(twitchSubscriptions)
          .set({ status: sub.status, updatedAt: new Date() })
          .where(eq(twitchSubscriptions.id, sub.id));
        await tx
          .update(channels)
          .set({
            captureRequested: false,
            catchupEnabled: false,
            catchupGeneration: sql`${channels.catchupGeneration}+1`,
            captureError:
              sub.status === 'authorization_revoked'
                ? 'authorization_required'
                : 'provider_unavailable',
          })
          .where(eq(channels.id, channel.id));
        return true;
      }
      if (
        !payload ||
        (channel.captureStartedAt && occurredAt < channel.captureStartedAt)
      )
        return false;
      const deleted =
        sub.type === 'channel.chat.message' &&
        (await this.isDeleted(
          tx,
          channel.id,
          chatSchema.parse(payload),
          occurredAt,
        ));
      const [saved] = await tx
        .insert(sourceEvents)
        .values({
          id: deliveryId,
          channelId: channel.id,
          subscriptionId: sub.id,
          type: sub.type,
          occurredAt,
          payload: deleted ? null : payload,
          expiresAt: new Date(
            occurredAt.getTime() +
              (sub.type === 'channel.chat.message'
                ? channel.chatRetentionDays
                : 8) *
                86400_000,
          ),
        })
        .onConflictDoNothing()
        .returning({ id: sourceEvents.id });
      if (
        saved &&
        [
          'channel.chat.message_delete',
          'channel.chat.clear',
          'channel.chat.clear_user_messages',
        ].includes(sub.type)
      )
        await this.scrub(tx, channel.id, sub.type, payload, occurredAt);
      return true;
    });
  }
  private async isDeleted(
    tx: Transaction,
    channelId: string,
    message: z.infer<typeof chatSchema>,
    occurredAt: Date,
  ) {
    const tombstones = await tx
      .select({ id: sourceEvents.id })
      .from(sourceEvents)
      .where(
        and(
          eq(sourceEvents.channelId, channelId),
          sql`${sourceEvents.type} IN ('channel.chat.message_delete', 'channel.chat.clear', 'channel.chat.clear_user_messages')`,
          sql`(
      (${sourceEvents.type} = 'channel.chat.message_delete' AND ${sourceEvents.payload}->>'message_id' = ${message.message_id}) OR
      (${sourceEvents.occurredAt} >= ${occurredAt} AND (${sourceEvents.type} = 'channel.chat.clear' OR (${sourceEvents.type} = 'channel.chat.clear_user_messages' AND ${sourceEvents.payload}->>'target_user_id' = ${message.chatter_user_id})))
    )`,
        ),
      )
      .limit(1);
    return tombstones.length > 0;
  }
  private async scrub(
    tx: Transaction,
    channelId: string,
    type: string,
    payload: Record<string, unknown>,
    occurredAt: Date,
  ) {
    const rawFilter =
      type === 'channel.chat.message_delete'
        ? sql`${sourceEvents.payload}->>'message_id' = ${payload.message_id}`
        : and(
            sql`${sourceEvents.occurredAt} <= ${occurredAt}`,
            type === 'channel.chat.clear_user_messages'
              ? sql`${sourceEvents.payload}->>'chatter_user_id' = ${payload.target_user_id}`
              : undefined,
          );
    await tx
      .update(sourceEvents)
      .set({ payload: null })
      .where(
        and(
          eq(sourceEvents.channelId, channelId),
          eq(sourceEvents.type, 'channel.chat.message'),
          rawFilter,
        ),
      );
    await tx
      .delete(chatMessages)
      .where(
        and(
          eq(chatMessages.channelId, channelId),
          type === 'channel.chat.message_delete'
            ? eq(chatMessages.messageId, String(payload.message_id))
            : and(
                sql`${chatMessages.occurredAt} <= ${occurredAt}`,
                type === 'channel.chat.clear_user_messages'
                  ? eq(chatMessages.chatterId, String(payload.target_user_id))
                  : undefined,
              ),
        ),
      );
    await expireCandidates(tx, channelId);
  }

  async pending() {
    return this.infrastructure.db
      .select({ id: sourceEvents.id })
      .from(sourceEvents)
      .where(
        and(isNull(sourceEvents.processedAt), isNull(sourceEvents.failedAt)),
      )
      .orderBy(sourceEvents.receivedAt)
      .limit(200);
  }
  async fail(id: string) {
    await this.infrastructure.db
      .update(sourceEvents)
      .set({ failedAt: new Date() })
      .where(and(eq(sourceEvents.id, id), isNull(sourceEvents.processedAt)));
  }
  async process(id: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const [locator] = await tx
        .select({ channelId: sourceEvents.channelId })
        .from(sourceEvents)
        .where(eq(sourceEvents.id, id));
      if (!locator) return;
      const [channel] = await tx
        .select()
        .from(channels)
        .where(eq(channels.id, locator.channelId))
        .for('update');
      const [event] = await tx
        .select()
        .from(sourceEvents)
        .where(
          and(eq(sourceEvents.channelId, channel.id), eq(sourceEvents.id, id)),
        )
        .for('update');
      if (!event || event.processedAt) return false;
      let catchupQueued = false;
      if (
        event.payload &&
        channel.captureRequested &&
        !channel.disconnectedAt &&
        (!channel.captureStartedAt ||
          event.receivedAt >= channel.captureStartedAt) &&
        event.expiresAt > new Date() &&
        (event.type !== 'channel.chat.message' ||
          event.occurredAt.getTime() + channel.chatRetentionDays * 86400_000 >
            Date.now())
      ) {
        const type = twitchEventTypeSchema.parse(event.type);
        const schema = eventSchemas[type];
        schema.parse(event.payload);
        if (type === 'channel.chat.message') {
          const message = chatSchema.parse(event.payload);
          if (await this.isDeleted(tx, channel.id, message, event.occurredAt))
            await tx
              .update(sourceEvents)
              .set({ payload: null })
              .where(
                and(
                  eq(sourceEvents.channelId, channel.id),
                  eq(sourceEvents.id, id),
                ),
              );
          else {
            await tx
              .insert(chatMessages)
              .values({
                channelId: channel.id,
                sourceEventId: id,
                messageId: message.message_id,
                chatterId: message.chatter_user_id,
                text: message.message.text,
                badges: message.badges,
                occurredAt: event.occurredAt,
                expiresAt: event.expiresAt,
              })
              .onConflictDoNothing();
            catchupQueued = Boolean(
              await this.publications.recordCommand(
                tx,
                channel,
                message,
                event.occurredAt,
              ),
            );
            await this.openLoops.captureCommand(
              tx,
              channel.id,
              event.id,
              message,
            );
          }
        }
      }
      await tx
        .update(sourceEvents)
        .set({ processedAt: new Date(), failedAt: null })
        .where(
          and(eq(sourceEvents.channelId, channel.id), eq(sourceEvents.id, id)),
        );
      return catchupQueued;
    });
  }
  async purge() {
    const rows = await this.infrastructure.db
      .select({ id: channels.id })
      .from(channels)
      .orderBy(channels.id);
    for (const row of rows)
      await this.infrastructure.db.transaction(async (tx) => {
        await tx
          .select({ id: channels.id })
          .from(channels)
          .where(eq(channels.id, row.id))
          .for('update');
        await purgeChannel(tx, row.id);
      });
    // Expired authentication material should not wait for a future login to be removed.
    await this.infrastructure.db.execute(
      sql`DELETE FROM oauth_states WHERE expires_at<=now()`,
    );
    await this.infrastructure.db.execute(
      sql`DELETE FROM sessions WHERE expires_at<=now()`,
    );
  }
}
