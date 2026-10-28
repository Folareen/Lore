import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import {
  canTransitionOpenLoop,
  type CreateOpenLoop,
  type OpenLoopStatus,
  type TransitionOpenLoop,
} from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
import {
  channels,
  evidence,
  memberships,
  openLoopHistory,
  openLoops,
  sourceEvents,
} from '../database/schema';
import { parsePromiseCommand } from './promise-command';
import type { chatSchema } from '../ingestion/eventsub.schemas';
import type { z } from 'zod';
type Transaction = Parameters<
  Parameters<InfrastructureService['db']['transaction']>[0]
>[0];
type Actor = { id: string; twitchUserId: string };
const projection = {
  id: openLoops.id,
  channelId: openLoops.channelId,
  wording: openLoops.wording,
  ownerLabel: openLoops.ownerLabel,
  dueContext: openLoops.dueContext,
  status: openLoops.status,
  version: openLoops.version,
  origin: openLoops.origin,
  captureMethod: openLoops.captureMethod,
  createdAt: openLoops.createdAt,
  updatedAt: openLoops.updatedAt,
  source: {
    excerpt: evidence.excerpt,
    originalAvailable: sql<
      boolean | null
    >`CASE WHEN ${evidence.sourceEventId} IS NULL THEN NULL ELSE ${sourceEvents.payload} IS NOT NULL END`,
  },
};
const activeStatuses: OpenLoopStatus[] = [
  'confirmed',
  'in_progress',
  'postponed',
];
@Injectable()
export class OpenLoopsRepository {
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}
  private async authorize(
    tx: Transaction,
    channelId: string,
    userId: string,
    mutation: boolean,
  ) {
    // Lock membership changes and disconnect against every human mutation/read transaction.
    const [channel] = await tx
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .for('update');
    if (!channel) throw new NotFoundException('Channel not found');
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
    }
    if (mutation && (!channel.connectedAt || channel.disconnectedAt))
      throw new ConflictException(
        'Reconnect the channel before changing open loops',
      );
  }
  private query(tx: Transaction, channelId: string) {
    return tx
      .select(projection)
      .from(openLoops)
      .innerJoin(
        evidence,
        and(
          eq(evidence.channelId, channelId),
          eq(evidence.id, openLoops.evidenceId),
          eq(evidence.visibility, 'team'),
        ),
      )
      .leftJoin(
        sourceEvents,
        and(
          eq(sourceEvents.channelId, channelId),
          eq(sourceEvents.id, evidence.sourceEventId),
        ),
      )
      .where(eq(openLoops.channelId, channelId))
      .$dynamic();
  }
  async list(
    channelId: string,
    userId: string,
    options: { status?: OpenLoopStatus; cursor?: string },
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, userId, false);
      let cursor;
      if (options.cursor) {
        [cursor] = await tx
          .select({ id: openLoops.id, createdAt: openLoops.createdAt })
          .from(openLoops)
          .where(
            and(
              eq(openLoops.channelId, channelId),
              eq(openLoops.id, options.cursor),
            ),
          );
        if (!cursor) throw new NotFoundException('Open-loop cursor not found');
      }
      const rows = await this.query(tx, channelId)
        .where(
          and(
            eq(openLoops.channelId, channelId),
            options.status ? eq(openLoops.status, options.status) : undefined,
            cursor
              ? or(
                  lt(openLoops.createdAt, cursor.createdAt),
                  and(
                    eq(openLoops.createdAt, cursor.createdAt),
                    lt(openLoops.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(openLoops.createdAt), desc(openLoops.id))
        .limit(51);
      return {
        items: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? rows[49].id : null,
      };
    });
  }
  async get(channelId: string, userId: string, loopId: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, userId, false);
      const [record] = await this.query(tx, channelId).where(
        and(eq(openLoops.channelId, channelId), eq(openLoops.id, loopId)),
      );
      if (!record) throw new NotFoundException('Open loop not found');
      return record;
    });
  }
  async history(channelId: string, userId: string, loopId: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, userId, false);
      const [loop] = await tx
        .select({ id: openLoops.id })
        .from(openLoops)
        .where(
          and(eq(openLoops.channelId, channelId), eq(openLoops.id, loopId)),
        );
      if (!loop) throw new NotFoundException('Open loop not found');
      return tx
        .select({
          version: openLoopHistory.version,
          fromStatus: openLoopHistory.fromStatus,
          toStatus: openLoopHistory.toStatus,
          reason: openLoopHistory.reason,
          actorTwitchUserId: openLoopHistory.actorTwitchUserId,
          occurredAt: openLoopHistory.occurredAt,
        })
        .from(openLoopHistory)
        .where(
          and(
            eq(openLoopHistory.channelId, channelId),
            eq(openLoopHistory.openLoopId, loopId),
          ),
        )
        .orderBy(asc(openLoopHistory.version));
    });
  }
  async create(channelId: string, actor: Actor, input: CreateOpenLoop) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const [existing] = await tx
        .select()
        .from(openLoops)
        .where(
          and(
            eq(openLoops.channelId, channelId),
            eq(openLoops.captureMethod, 'dashboard'),
            eq(openLoops.captureKey, input.requestId),
          ),
        );
      if (
        existing &&
        (existing.wording !== input.wording ||
          existing.ownerLabel !== (input.ownerLabel || null) ||
          existing.dueContext !== (input.dueContext || null))
      )
        throw new ConflictException(
          'Capture request already used for different wording',
        );
      const id =
        existing?.id ||
        (await this.insert(tx, {
          channelId,
          wording: input.wording,
          ownerLabel: input.ownerLabel,
          dueContext: input.dueContext,
          captureMethod: 'dashboard',
          captureKey: input.requestId,
          origin: 'manual_import',
          excerpt: input.wording,
          actorTwitchUserId: actor.twitchUserId,
        }));
      const [record] = await this.query(tx, channelId).where(
        and(eq(openLoops.channelId, channelId), eq(openLoops.id, id)),
      );
      return record;
    });
  }
  private async insert(
    tx: Transaction,
    input: {
      channelId: string;
      wording: string;
      ownerLabel?: string;
      dueContext?: string;
      captureMethod: 'dashboard' | 'chat_command' | 'ai_review';
      captureKey: string;
      origin: 'manual_import' | 'live_twitch';
      excerpt: string;
      actorTwitchUserId: string;
      sourceEventId?: string;
    },
  ) {
    const [proof] = await tx
      .insert(evidence)
      .values({
        channelId: input.channelId,
        excerpt: input.excerpt,
        sourceEventId: input.sourceEventId,
        origin: input.origin,
      })
      .returning();
    const [loop] = await tx
      .insert(openLoops)
      .values({
        channelId: input.channelId,
        wording: input.wording,
        ownerLabel: input.ownerLabel,
        dueContext: input.dueContext,
        status: 'confirmed',
        origin: input.origin,
        captureMethod: input.captureMethod,
        captureKey: input.captureKey,
        evidenceId: proof.id,
      })
      .returning();
    await tx.insert(openLoopHistory).values({
      channelId: input.channelId,
      openLoopId: loop.id,
      version: 1,
      toStatus: 'confirmed',
      actorTwitchUserId: input.actorTwitchUserId,
    });
    return loop.id;
  }
  // Caller holds the channel lock and has checked current membership and source availability.
  async confirmCandidate(
    tx: Transaction,
    input: {
      channelId: string;
      candidateId: string;
      sourceEventId: string;
      excerpt: string;
      wording: string;
      ownerLabel?: string;
      dueContext?: string;
      actorTwitchUserId: string;
    },
  ) {
    return this.insert(tx, {
      ...input,
      captureMethod: 'ai_review',
      captureKey: input.candidateId,
      origin: 'live_twitch',
    });
  }
  // Called only inside ingestion's channel-locked transaction after signature, consent and deletion checks.
  async captureCommand(
    tx: Transaction,
    channelId: string,
    sourceEventId: string,
    message: z.infer<typeof chatSchema>,
  ) {
    const wording = parsePromiseCommand(message);
    if (!wording) return;
    const [existing] = await tx
      .select({ id: openLoops.id })
      .from(openLoops)
      .where(
        and(
          eq(openLoops.channelId, channelId),
          eq(openLoops.captureMethod, 'chat_command'),
          eq(openLoops.captureKey, message.message_id),
        ),
      );
    if (existing) return;
    await this.insert(tx, {
      channelId,
      wording,
      sourceEventId,
      captureMethod: 'chat_command',
      captureKey: message.message_id,
      origin: 'live_twitch',
      excerpt: message.message.text,
      actorTwitchUserId: message.chatter_user_id,
    });
  }
  async transition(
    channelId: string,
    actor: Actor,
    loopId: string,
    input: TransitionOpenLoop,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const [loop] = await tx
        .select()
        .from(openLoops)
        .where(
          and(eq(openLoops.channelId, channelId), eq(openLoops.id, loopId)),
        )
        .for('update');
      if (!loop) throw new NotFoundException('Open loop not found');
      if (loop.version !== input.expectedVersion)
        throw new ConflictException(
          'This open loop changed. Refresh before trying again',
        );
      if (!canTransitionOpenLoop(loop.status, input.status))
        throw new ConflictException('This status change is not allowed');
      const version = loop.version + 1;
      await tx
        .update(openLoops)
        .set({
          status: input.status,
          version,
          lastReason: input.reason || null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(openLoops.channelId, channelId), eq(openLoops.id, loopId)),
        );
      await tx.insert(openLoopHistory).values({
        channelId,
        openLoopId: loopId,
        version,
        fromStatus: loop.status,
        toStatus: input.status,
        reason: input.reason,
        actorTwitchUserId: actor.twitchUserId,
      });
      const [record] = await this.query(tx, channelId).where(
        and(eq(openLoops.channelId, channelId), eq(openLoops.id, loopId)),
      );
      return record;
    });
  }
  async brief(channelId: string, userId: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, userId, false);
      const filter = and(
        eq(openLoops.channelId, channelId),
        inArray(openLoops.status, activeStatuses),
      );
      const [total] = await tx
        .select({ value: count() })
        .from(openLoops)
        .where(filter);
      const items = await this.query(tx, channelId)
        .where(filter)
        .orderBy(
          sql`CASE WHEN ${openLoops.status} = 'in_progress' THEN 0 WHEN ${openLoops.status} = 'confirmed' THEN 1 ELSE 2 END`,
          desc(isNotNull(openLoops.dueContext)),
          asc(openLoops.createdAt),
          asc(openLoops.id),
        )
        .limit(20);
      return {
        channelId,
        generatedAt: new Date().toISOString(),
        activeCount: total.value,
        items,
        method: 'saved_open_loops' as const,
      };
    });
  }
}
