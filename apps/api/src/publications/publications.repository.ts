import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import {
  catchupScopes,
  publicationTransitions,
  type createPublicationSchema,
  type editPublicationSchema,
  type publicationActionSchema,
  type PublicEntry,
  type PublicationFields,
} from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
import {
  channels,
  memberships,
  publicEntries,
  publicEntrySources,
  publicationHistory,
  auditEvents,
  openLoops,
  oauthConnections,
  catchupReplies,
  chatMessages,
} from '../database/schema';
import {
  fingerprint,
  type CaseTx,
  type CaseActor,
} from '../cases/cases.repository';
import type { chatSchema } from '../ingestion/eventsub.schemas';
import { env } from '../config';
type Entry = typeof publicEntries.$inferSelect;
export const publicationQuerySchema = z.strictObject({
  status: z.enum(['draft', 'published', 'unpublished']).optional(),
  cursor: z.uuid().optional(),
});
export const publicQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  kind: z
    .enum(['milestone', 'reference', 'story', 'commitment', 'summary'])
    .optional(),
  cursor: z.uuid().optional(),
});
@Injectable()
export class PublicationsRepository {
  constructor(
    @Inject(InfrastructureService)
    readonly infrastructure: InfrastructureService,
  ) {}
  async authorize(
    tx: CaseTx,
    channelId: string,
    userId: string,
    connected = false,
  ) {
    const [channel] = await tx
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .for('update');
    if (!channel) throw new NotFoundException('Channel not found');
    let role: 'owner' | 'moderator' | 'team' = 'owner';
    if (channel.ownerUserId !== userId) {
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.channelId, channelId),
            eq(memberships.userId, userId),
          ),
        );
      if (!member || !channel.connectedAt || channel.disconnectedAt)
        throw new NotFoundException('Channel not found');
      role = member.role;
    }
    if (connected && (!channel.connectedAt || channel.disconnectedAt))
      throw new ConflictException('Reconnect the channel first');
    return { channel, role };
  }
  private async find(tx: CaseTx, channelId: string, id: string) {
    const [entry] = await tx
      .select()
      .from(publicEntries)
      .where(
        and(
          eq(publicEntries.channelId, channelId),
          eq(publicEntries.id, id),
          ne(publicEntries.status, 'deleted'),
        ),
      );
    if (!entry) throw new NotFoundException('Community entry not found');
    return entry;
  }
  private async managed(tx: CaseTx, r: Entry) {
    const refs = await tx
      .select({ id: publicEntrySources.sourceId })
      .from(publicEntrySources)
      .where(
        and(
          eq(publicEntrySources.channelId, r.channelId),
          eq(publicEntrySources.entryId, r.id),
        ),
      )
      .orderBy(asc(publicEntrySources.sourceId));
    return {
      id: r.id,
      channelId: r.channelId,
      kind: r.kind,
      title: r.title,
      body: r.body,
      chatSummary: r.chatSummary,
      promiseId: r.promiseId,
      sourceIds: refs.map((s) => s.id),
      status: r.status,
      version: r.version,
      approvedByTwitchUserId: r.approvedByTwitchUserId,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
  private async history(
    tx: CaseTx,
    r: Entry,
    actor: CaseActor,
    action: string,
    reason: string | null,
  ) {
    await tx.insert(publicationHistory).values({
      channelId: r.channelId,
      entryId: r.id,
      version: r.version,
      action,
      actorTwitchUserId: actor.twitchUserId,
      reason,
      occurredAt: new Date(),
    });
    await tx.insert(auditEvents).values({
      channelId: r.channelId,
      actorId: actor.id,
      action: `publication.${action}`,
      targetId: r.id,
    });
  }
  private async validateSources(
    tx: CaseTx,
    channelId: string,
    fields: PublicationFields,
    id?: string,
  ) {
    if (fields.sourceIds.includes(id ?? ''))
      throw new ConflictException('An entry cannot cite itself');
    if (fields.sourceIds.length) {
      const rows = await tx
        .select({ id: publicEntries.id })
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channelId),
            eq(publicEntries.status, 'published'),
            inArray(publicEntries.id, fields.sourceIds),
          ),
        );
      if (rows.length !== fields.sourceIds.length)
        throw new NotFoundException(
          'Choose currently published sources from this channel',
        );
    }
    if (fields.promiseId) {
      const [promise] = await tx
        .select({ id: openLoops.id })
        .from(openLoops)
        .where(
          and(
            eq(openLoops.channelId, channelId),
            eq(openLoops.id, fields.promiseId),
            ne(openLoops.status, 'candidate'),
          ),
        );
      if (!promise)
        throw new NotFoundException('Confirmed channel promise not found');
    }
  }
  private async replaceSources(tx: CaseTx, r: Entry, sourceIds: string[]) {
    await tx
      .delete(publicEntrySources)
      .where(
        and(
          eq(publicEntrySources.channelId, r.channelId),
          eq(publicEntrySources.entryId, r.id),
        ),
      );
    if (sourceIds.length)
      await tx.insert(publicEntrySources).values(
        sourceIds.map((sourceId) => ({
          channelId: r.channelId,
          entryId: r.id,
          sourceId,
        })),
      );
  }
  private async invalidate(
    tx: CaseTx,
    channelId: string,
    id: string,
    actor: CaseActor,
  ) {
    const affected = await tx.execute<{ id: string }>(
      sql`WITH RECURSIVE affected(id) AS (SELECT ${id}::uuid UNION SELECT s.entry_id FROM public_entry_sources s JOIN affected a ON s.source_id=a.id WHERE s.channel_id=${channelId}) SELECT e.id FROM public_entries e JOIN affected a ON a.id=e.id WHERE e.channel_id=${channelId} AND e.id<>${id} AND e.status='published'`,
    );
    if (!affected.rows.length) return;
    const rows = await tx
      .update(publicEntries)
      .set({
        status: 'unpublished',
        approvedByTwitchUserId: null,
        publishedAt: null,
        version: sql`${publicEntries.version}+1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(publicEntries.channelId, channelId),
          inArray(
            publicEntries.id,
            affected.rows.map((r) => r.id),
          ),
        ),
      )
      .returning();
    for (const row of rows)
      await this.history(
        tx,
        row,
        actor,
        'source_withdrawn',
        'A published source changed or was withdrawn. Review before republishing.',
      );
  }
  async list(
    channelId: string,
    actor: CaseActor,
    query: z.infer<typeof publicationQuerySchema>,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id);
      const cursor = query.cursor
        ? await this.find(tx, channelId, query.cursor)
        : null;
      const rows = await tx
        .select()
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channelId),
            ne(publicEntries.status, 'deleted'),
            query.status ? eq(publicEntries.status, query.status) : undefined,
            cursor
              ? or(
                  lt(publicEntries.createdAt, cursor.createdAt),
                  and(
                    eq(publicEntries.createdAt, cursor.createdAt),
                    lt(publicEntries.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(publicEntries.createdAt), desc(publicEntries.id))
        .limit(51);
      return {
        items: await Promise.all(
          rows.slice(0, 50).map((r) => this.managed(tx, r)),
        ),
        nextCursor: rows.length > 50 ? rows[49].id : null,
      };
    });
  }
  async get(channelId: string, actor: CaseActor, id: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id);
      const r = await this.find(tx, channelId, id);
      const history = await tx
        .select({
          id: publicationHistory.id,
          version: publicationHistory.version,
          action: publicationHistory.action,
          actorTwitchUserId: publicationHistory.actorTwitchUserId,
          reason: publicationHistory.reason,
          occurredAt: publicationHistory.occurredAt,
        })
        .from(publicationHistory)
        .where(
          and(
            eq(publicationHistory.channelId, channelId),
            eq(publicationHistory.entryId, id),
          ),
        )
        .orderBy(asc(publicationHistory.version));
      return { entry: await this.managed(tx, r), history };
    });
  }
  async create(
    channelId: string,
    actor: CaseActor,
    input: z.infer<typeof createPublicationSchema>,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const hash = fingerprint({ actor: actor.id, ...input });
      const [prior] = await tx
        .select()
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channelId),
            eq(publicEntries.requestId, input.requestId),
          ),
        );
      if (prior) {
        if (prior.inputFingerprint !== hash || prior.status === 'deleted')
          throw new ConflictException('Request ID was already used');
        return this.managed(tx, prior);
      }
      await this.validateSources(tx, channelId, input);
      const [row] = await tx
        .insert(publicEntries)
        .values({
          channelId,
          requestId: input.requestId,
          inputFingerprint: hash,
          title: input.title,
          body: input.body,
          kind: input.kind,
          chatSummary: input.chatSummary,
          promiseId: input.promiseId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      await this.replaceSources(tx, row, input.sourceIds);
      await this.history(tx, row, actor, 'draft_created', null);
      return this.managed(tx, row);
    });
  }
  async edit(
    channelId: string,
    actor: CaseActor,
    id: string,
    input: z.infer<typeof editPublicationSchema>,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      const { role } = await this.authorize(tx, channelId, actor.id, true);
      const row = await this.find(tx, channelId, id);
      if (row.version !== input.expectedVersion)
        throw new ConflictException('Entry changed. Refresh before editing');
      if (row.status === 'published' && role === 'team')
        throw new NotFoundException('Owner or moderator review required');
      await this.invalidate(tx, channelId, id, actor);
      await this.validateSources(tx, channelId, input, id);
      const [updated] = await tx
        .update(publicEntries)
        .set({
          kind: input.kind,
          title: input.title,
          body: input.body,
          chatSummary: input.chatSummary,
          promiseId: input.promiseId,
          status: 'draft',
          approvedByTwitchUserId: null,
          publishedAt: null,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(eq(publicEntries.channelId, channelId), eq(publicEntries.id, id)),
        )
        .returning();
      await this.replaceSources(tx, updated, input.sourceIds);
      await this.history(tx, updated, actor, 'edited_to_draft', null);
      return this.managed(tx, updated);
    });
  }
  async action(
    channelId: string,
    actor: CaseActor,
    id: string,
    input: z.infer<typeof publicationActionSchema>,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      const { role } = await this.authorize(
        tx,
        channelId,
        actor.id,
        input.action === 'publish',
      );
      const row = await this.find(tx, channelId, id);
      if (row.version !== input.expectedVersion)
        throw new ConflictException('Entry changed. Refresh before reviewing');
      if (!publicationTransitions[row.status].includes(input.action))
        throw new ConflictException('Publication transition is unavailable');
      if (
        role === 'team' &&
        (input.action !== 'delete' || row.status !== 'draft')
      )
        throw new NotFoundException('Owner or moderator review required');
      if (input.action === 'publish') {
        if (row.status === 'published')
          throw new ConflictException('Entry is already published');
        const draft = await this.managed(tx, row);
        await this.validateSources(tx, channelId, draft, id);
      } else await this.invalidate(tx, channelId, id, actor);
      const [updated] = await tx
        .update(publicEntries)
        .set({
          status:
            input.action === 'publish'
              ? 'published'
              : input.action === 'delete'
                ? 'deleted'
                : 'unpublished',
          version: row.version + 1,
          approvedByTwitchUserId:
            input.action === 'publish' ? actor.twitchUserId : null,
          publishedAt: input.action === 'publish' ? new Date() : null,
          updatedAt: new Date(),
          ...(input.action === 'delete'
            ? { title: '', body: '', chatSummary: '', promiseId: null }
            : {}),
        })
        .where(
          and(eq(publicEntries.channelId, channelId), eq(publicEntries.id, id)),
        )
        .returning();
      if (input.action === 'delete')
        await tx
          .delete(publicEntrySources)
          .where(
            and(
              eq(publicEntrySources.channelId, channelId),
              or(
                eq(publicEntrySources.entryId, id),
                eq(publicEntrySources.sourceId, id),
              ),
            ),
          );
      await this.history(tx, updated, actor, input.action, input.reason);
      return this.managed(tx, updated);
    });
  }
  private async publicChannel(tx: CaseTx, slug: string) {
    const [channel] = await tx
      .select({
        id: channels.id,
        slug: channels.slug,
        displayName: channels.displayName,
      })
      .from(channels)
      .where(
        and(
          eq(channels.slug, slug),
          isNull(channels.disconnectedAt),
          sql`${channels.connectedAt} IS NOT NULL`,
          sql`EXISTS(SELECT 1 FROM ${publicEntries} WHERE ${publicEntries.channelId}=${channels.id} AND ${publicEntries.status}='published')`,
        ),
      )
      .for('share');
    if (!channel)
      throw new NotFoundException('Community Lore is not available');
    return channel;
  }
  private async project(
    tx: CaseTx,
    channelId: string,
    rows: Entry[],
  ): Promise<PublicEntry[]> {
    const refs = rows.length
      ? await tx
          .select({
            entryId: publicEntrySources.entryId,
            id: publicEntries.id,
            title: publicEntries.title,
          })
          .from(publicEntrySources)
          .innerJoin(
            publicEntries,
            and(
              eq(publicEntries.channelId, channelId),
              eq(publicEntries.id, publicEntrySources.sourceId),
              eq(publicEntries.status, 'published'),
            ),
          )
          .where(
            and(
              eq(publicEntrySources.channelId, channelId),
              inArray(
                publicEntrySources.entryId,
                rows.map((r) => r.id),
              ),
            ),
          )
          .orderBy(asc(publicEntries.id))
      : [];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      chatSummary: r.chatSummary,
      publishedAt: r.publishedAt!.toISOString(),
      sources: refs
        .filter((s) => s.entryId === r.id)
        .map((s) => ({ id: s.id, title: s.title })),
    }));
  }
  async feed(slug: string, query: z.infer<typeof publicQuerySchema>) {
    return this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.publicChannel(tx, slug);
      const [cursor] = query.cursor
        ? await tx
            .select()
            .from(publicEntries)
            .where(
              and(
                eq(publicEntries.channelId, channel.id),
                eq(publicEntries.id, query.cursor),
                eq(publicEntries.status, 'published'),
              ),
            )
        : [];
      if (query.cursor && !cursor)
        throw new NotFoundException('Public cursor unavailable');
      const search = query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : null;
      const rows = await tx
        .select()
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channel.id),
            eq(publicEntries.status, 'published'),
            query.kind ? eq(publicEntries.kind, query.kind) : undefined,
            search
              ? or(
                  sql`${publicEntries.title} ILIKE ${search}`,
                  sql`${publicEntries.body} ILIKE ${search}`,
                )
              : undefined,
            cursor
              ? or(
                  lt(publicEntries.publishedAt, cursor.publishedAt!),
                  and(
                    eq(publicEntries.publishedAt, cursor.publishedAt!),
                    lt(publicEntries.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(publicEntries.publishedAt), desc(publicEntries.id))
        .limit(51);
      return {
        channel: { slug: channel.slug, displayName: channel.displayName },
        items: await this.project(tx, channel.id, rows.slice(0, 50)),
        nextCursor: rows.length > 50 ? rows[49].id : null,
      };
    });
  }
  async publicGet(slug: string, id: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.publicChannel(tx, slug);
      const [r] = await tx
        .select()
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channel.id),
            eq(publicEntries.status, 'published'),
            eq(publicEntries.id, id),
          ),
        );
      if (!r) throw new NotFoundException('Public entry unavailable');
      return {
        channel: { slug: channel.slug, displayName: channel.displayName },
        entry: (await this.project(tx, channel.id, [r]))[0],
      };
    });
  }
  async catchup(slug: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.publicChannel(tx, slug);
      const [summary] = await tx
        .select()
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channel.id),
            eq(publicEntries.status, 'published'),
            eq(publicEntries.kind, 'summary'),
          ),
        )
        .orderBy(desc(publicEntries.publishedAt), desc(publicEntries.id))
        .limit(1);
      const recent = await tx
        .select()
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channel.id),
            eq(publicEntries.status, 'published'),
            ne(publicEntries.kind, 'summary'),
          ),
        )
        .orderBy(desc(publicEntries.publishedAt), desc(publicEntries.id))
        .limit(10);
      return {
        channel: { slug: channel.slug, displayName: channel.displayName },
        summary: summary
          ? (await this.project(tx, channel.id, [summary]))[0]
          : null,
        recent: await this.project(tx, channel.id, recent),
      };
    });
  }
  async settings(channelId: string, actor: CaseActor, enabled?: boolean) {
    return this.infrastructure.db.transaction(async (tx) => {
      const { channel, role } = await this.authorize(
        tx,
        channelId,
        actor.id,
        enabled === true,
      );
      if (role !== 'owner')
        throw new NotFoundException('Owner access required');
      const [connection] = await tx
        .select()
        .from(oauthConnections)
        .where(eq(oauthConnections.userId, actor.id));
      const missingScopes = catchupScopes.filter(
        (s) =>
          !connection || connection.revokedAt || !connection.scopes.includes(s),
      );
      const configured = Boolean(
        env.TWITCH_CLIENT_ID &&
        env.TWITCH_EVENTSUB_CALLBACK_URL &&
        env.TWITCH_EVENTSUB_SECRET,
      );
      if (
        enabled === true &&
        (!configured || missingScopes.length || !channel.captureRequested)
      )
        throw new ConflictException(
          'Configure Twitch, authorize chat sending and start live capture first',
        );
      if (enabled !== undefined) {
        await tx
          .update(channels)
          .set({
            catchupEnabled: enabled,
            catchupEnabledAt: enabled ? new Date() : null,
            catchupGeneration: channel.catchupGeneration + 1,
            updatedAt: new Date(),
          })
          .where(eq(channels.id, channelId));
        await tx.insert(auditEvents).values({
          channelId,
          actorId: actor.id,
          targetId: channelId,
          action: enabled ? 'catchup.enabled' : 'catchup.disabled',
        });
      }
      const recent = await tx
        .select({
          id: catchupReplies.id,
          status: catchupReplies.status,
          createdAt: catchupReplies.createdAt,
        })
        .from(catchupReplies)
        .where(
          and(
            eq(catchupReplies.channelId, channelId),
            eq(catchupReplies.kind, 'catchup'),
          ),
        )
        .orderBy(desc(catchupReplies.createdAt))
        .limit(10);
      return {
        enabled: enabled ?? channel.catchupEnabled,
        captureEnabled: channel.captureRequested,
        configured,
        missingScopes: [...missingScopes],
        recent,
      };
    });
  }
  async recordCommand(
    tx: CaseTx,
    channel: typeof channels.$inferSelect,
    message: z.infer<typeof chatSchema>,
    occurredAt: Date,
  ) {
    if (
      !channel.catchupEnabled ||
      !channel.catchupEnabledAt ||
      occurredAt < channel.catchupEnabledAt ||
      Date.now() - occurredAt.getTime() > 90000 ||
      !/^!catchup\s*$/i.test(message.message.text.trim()) ||
      (message.source_broadcaster_user_id &&
        message.source_broadcaster_user_id !== channel.twitchChannelId)
    )
      return;
    const [existing] = await tx
      .select({ id: catchupReplies.id })
      .from(catchupReplies)
      .where(
        and(
          eq(catchupReplies.channelId, channel.id),
          eq(catchupReplies.messageId, message.message_id),
        ),
      );
    if (existing) return;
    if (
      channel.lastCatchupAt &&
      Date.now() - channel.lastCatchupAt.getTime() < 60000
    )
      return;
    await tx
      .insert(catchupReplies)
      .values({
        channelId: channel.id,
        messageId: message.message_id,
        generation: channel.catchupGeneration,
        expiresAt: new Date(occurredAt.getTime() + 90000),
      })
      .onConflictDoNothing();
    await tx
      .update(channels)
      .set({ lastCatchupAt: new Date() })
      .where(eq(channels.id, channel.id));
    return true;
  }
  async recordPromiseConfirmation(
    tx: CaseTx,
    channel: typeof channels.$inferSelect,
    message: z.infer<typeof chatSchema>,
    occurredAt: Date,
    openLoopId: string,
  ) {
    if (
      !channel.promiseConfirmationsEnabled ||
      !channel.promiseConfirmationsEnabledAt ||
      occurredAt < channel.promiseConfirmationsEnabledAt ||
      Date.now() - occurredAt.getTime() > 90000 ||
      (channel.lastPromiseConfirmationAt &&
        Date.now() - channel.lastPromiseConfirmationAt.getTime() < 15000)
    )
      return false;
    const [saved] = await tx
      .insert(catchupReplies)
      .values({
        channelId: channel.id,
        messageId: message.message_id,
        kind: 'promise',
        openLoopId,
        generation: channel.featuresGeneration,
        expiresAt: new Date(occurredAt.getTime() + 90000),
      })
      .onConflictDoNothing()
      .returning({ id: catchupReplies.id });
    if (!saved) return false;
    await tx
      .update(channels)
      .set({ lastPromiseConfirmationAt: new Date() })
      .where(eq(channels.id, channel.id));
    return true;
  }
  async cancelQueuedReply(id: string) {
    await this.infrastructure.db
      .update(catchupReplies)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(
        and(eq(catchupReplies.id, id), eq(catchupReplies.status, 'queued')),
      );
  }
  async pendingReplies() {
    return this.infrastructure.db
      .select({ id: catchupReplies.id })
      .from(catchupReplies)
      .where(eq(catchupReplies.status, 'queued'))
      .orderBy(asc(catchupReplies.createdAt))
      .limit(100);
  }
  async claimReply(id: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const [locator] = await tx
        .select()
        .from(catchupReplies)
        .where(eq(catchupReplies.id, id));
      if (!locator) return null;
      const [channel] = await tx
        .select()
        .from(channels)
        .where(eq(channels.id, locator.channelId))
        .for('update');
      const [row] = await tx
        .select()
        .from(catchupReplies)
        .where(eq(catchupReplies.id, id))
        .for('update');
      if (row.status !== 'queued') return null;
      const [connection] = channel.ownerUserId
        ? await tx
            .select()
            .from(oauthConnections)
            .where(eq(oauthConnections.userId, channel.ownerUserId))
        : [];
      if (
        (row.kind === 'promise'
          ? !channel.promiseConfirmationsEnabled ||
            channel.featuresGeneration !== row.generation
          : !channel.catchupEnabled ||
            channel.catchupGeneration !== row.generation) ||
        !channel.captureRequested ||
        channel.disconnectedAt ||
        !connection ||
        connection.revokedAt ||
        catchupScopes.some((s) => !connection.scopes.includes(s)) ||
        row.expiresAt <= new Date()
      ) {
        await tx
          .update(catchupReplies)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(catchupReplies.id, id));
        return null;
      }
      const [command] = await tx
        .select({ id: chatMessages.messageId })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.channelId, channel.id),
            eq(chatMessages.messageId, row.messageId),
            sql`${chatMessages.expiresAt}>now()`,
          ),
        );
      if (!command) {
        await tx
          .update(catchupReplies)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(catchupReplies.id, id));
        return null;
      }
      if (row.kind === 'promise') {
        const [loop] = row.openLoopId
          ? await tx
              .select({ id: openLoops.id })
              .from(openLoops)
              .where(
                and(
                  eq(openLoops.channelId, channel.id),
                  eq(openLoops.id, row.openLoopId),
                  eq(openLoops.captureMethod, 'chat_command'),
                  eq(openLoops.captureKey, row.messageId),
                ),
              )
          : [];
        if (!loop) {
          await tx
            .update(catchupReplies)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(catchupReplies.id, id));
          return null;
        }
        await tx
          .update(catchupReplies)
          .set({ status: 'attempted', updatedAt: new Date() })
          .where(eq(catchupReplies.id, id));
        return {
          broadcasterId: channel.twitchChannelId!,
          message:
            'Promise saved in Lore. The team can review it in the next-stream brief.',
        };
      }
      const [summary] = await tx
        .select()
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channel.id),
            eq(publicEntries.status, 'published'),
            eq(publicEntries.kind, 'summary'),
          ),
        )
        .orderBy(desc(publicEntries.publishedAt), desc(publicEntries.id))
        .limit(1);
      await tx
        .update(catchupReplies)
        .set({ status: 'attempted', updatedAt: new Date() })
        .where(eq(catchupReplies.id, id));
      const url = `${env.APP_ORIGIN}/c/${encodeURIComponent(channel.slug)}/catch-up`;
      const text = summary
        ? `Catch up: ${summary.chatSummary.replace(/[\r\n\t]+/g, ' ').trim()}`
        : 'No catch-up summary has been approved yet.';
      const message =
        summary && Array.from(`${text} ${url}`).length <= 500
          ? `${text} ${url}`
          : text;
      return { broadcasterId: channel.twitchChannelId!, message };
    });
  }
  async finishReply(
    id: string,
    status: 'sent' | 'dropped' | 'failed' | 'uncertain',
  ) {
    await this.infrastructure.db
      .update(catchupReplies)
      .set({ status, updatedAt: new Date() })
      .where(
        and(eq(catchupReplies.id, id), eq(catchupReplies.status, 'attempted')),
      );
  }
  async recoverReplies() {
    await this.infrastructure.db
      .update(catchupReplies)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(catchupReplies.status, 'queued'),
          lt(catchupReplies.expiresAt, new Date()),
        ),
      );
    await this.infrastructure.db
      .update(catchupReplies)
      .set({ status: 'uncertain', updatedAt: new Date() })
      .where(
        and(
          eq(catchupReplies.status, 'attempted'),
          lt(catchupReplies.updatedAt, new Date(Date.now() - 30000)),
        ),
      );
    await this.infrastructure.db
      .delete(catchupReplies)
      .where(
        lt(catchupReplies.createdAt, new Date(Date.now() - 30 * 86400000)),
      );
  }
}
