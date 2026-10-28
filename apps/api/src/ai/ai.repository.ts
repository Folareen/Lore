import { expireCandidates } from './candidate-retention';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { AiError, CandidateDraft, ReviewCandidate } from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
import {
  auditEvents,
  aiCandidates,
  aiDailyUsage,
  aiRuns,
  aiRunSources,
  channels,
  chatMessages,
  memberships,
  openLoops,
  sourceEvents,
} from '../database/schema';
import { OpenLoopsRepository } from '../open-loops/open-loops.repository';
import { env } from '../config';
import type { ExtractionSource } from './ai.provider';
type Tx = Parameters<
  Parameters<InfrastructureService['db']['transaction']>[0]
>[0];
type Actor = { id: string; twitchUserId: string };
// Use current retention on every read, including before and after provider calls.
const available = sql`${sourceEvents.payload} IS NOT NULL AND ${sourceEvents.expiresAt} > now() AND ${chatMessages.expiresAt} > now() AND ${chatMessages.occurredAt} + ${channels.chatRetentionDays} * interval '1 day' > now()`;
@Injectable()
export class AiRepository {
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(OpenLoopsRepository) private readonly loops: OpenLoopsRepository,
  ) {}
  private async authorize(
    tx: Tx,
    channelId: string,
    userId: string,
    mutation = false,
    ownerOnly = false,
  ) {
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
      if (ownerOnly)
        throw new ForbiddenException('Only the owner can change AI consent');
    }
    if (mutation && (!channel.connectedAt || channel.disconnectedAt))
      throw new ConflictException('Reconnect the channel first');
    return channel;
  }
  async status(channelId: string, userId: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.authorize(tx, channelId, userId);
      const [usage] = await tx
        .select()
        .from(aiDailyUsage)
        .where(
          and(
            eq(aiDailyUsage.channelId, channelId),
            eq(aiDailyUsage.day, new Date().toISOString().slice(0, 10)),
          ),
        );
      const runs = await tx
        .select({
          id: aiRuns.id,
          status: aiRuns.status,
          attempts: aiRuns.attempts,
          error: aiRuns.error,
          createdAt: aiRuns.createdAt,
        })
        .from(aiRuns)
        .where(eq(aiRuns.channelId, channelId))
        .orderBy(desc(aiRuns.createdAt))
        .limit(10);
      return {
        configured: Boolean(env.GEMINI_API_KEY),
        enabled: channel.aiExtractionEnabled,
        provider: 'gemini' as const,
        model: env.GEMINI_MODEL,
        dailyUsed: usage?.calls || 0,
        dailyLimit: env.AI_DAILY_CALL_LIMIT,
        recentRuns: runs,
      };
    });
  }
  async settings(channelId: string, userId: string, enabled: boolean) {
    await this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.authorize(
        tx,
        channelId,
        userId,
        enabled,
        true,
      );
      if (enabled && !env.GEMINI_API_KEY)
        throw new ConflictException(
          'Configure GEMINI_API_KEY on the API first',
        );
      if (channel.aiExtractionEnabled === enabled) return;
      await tx.insert(auditEvents).values({
        channelId,
        actorId: userId,
        action: enabled ? 'ai.extraction_enabled' : 'ai.extraction_disabled',
        targetId: channelId,
      });
      await tx
        .update(channels)
        .set({
          aiExtractionEnabled: enabled,
          aiGeneration: channel.aiGeneration + 1,
        })
        .where(eq(channels.id, channelId));
      await tx
        .update(aiRuns)
        .set({ status: 'cancelled', error: 'disabled', updatedAt: new Date() })
        .where(
          and(
            eq(aiRuns.channelId, channelId),
            inArray(aiRuns.status, ['queued', 'processing']),
          ),
        );
    });
    return this.status(channelId, userId);
  }
  private sourceQuery(tx: Tx, channelId: string) {
    return tx
      .select({
        id: sourceEvents.id,
        text: chatMessages.text,
        expiresAt:
          sql`LEAST(${sourceEvents.expiresAt}, ${chatMessages.expiresAt}, ${chatMessages.occurredAt} + ${channels.chatRetentionDays} * interval '1 day')`.mapWith(
            sourceEvents.expiresAt,
          ),
      })
      .from(sourceEvents)
      .innerJoin(channels, eq(channels.id, sourceEvents.channelId))
      .innerJoin(
        chatMessages,
        and(
          eq(chatMessages.channelId, channelId),
          eq(chatMessages.sourceEventId, sourceEvents.id),
        ),
      )
      .where(and(eq(sourceEvents.channelId, channelId), available))
      .$dynamic();
  }
  async schedule(channelId: string, userId?: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      let channel;
      if (userId) channel = await this.authorize(tx, channelId, userId, true);
      else
        [channel] = await tx
          .select()
          .from(channels)
          .where(eq(channels.id, channelId))
          .for('update');
      if (
        !channel?.aiExtractionEnabled ||
        !channel.connectedAt ||
        channel.disconnectedAt ||
        !env.GEMINI_API_KEY
      ) {
        if (userId)
          throw new ConflictException(
            'The owner must enable AI extraction first',
          );
        return null;
      }
      const [active] = await tx
        .select()
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.channelId, channelId),
            inArray(aiRuns.status, ['queued', 'processing']),
          ),
        );
      if (active) return active;
      const [recent] = await tx
        .select()
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.channelId, channelId),
            sql`${aiRuns.createdAt} > now() - interval '1 minute'`,
          ),
        )
        .limit(1);
      if (recent && !userId) return null;
      const sources = await this.sourceQuery(tx, channelId)
        .where(
          and(
            eq(sourceEvents.channelId, channelId),
            available,
            isNotNull(sourceEvents.processedAt),
            sql`length(${chatMessages.text}) BETWEEN 1 AND 2000`,
            sql`lower(ltrim(${chatMessages.text})) NOT LIKE '!promise%'`,
            sql`NOT EXISTS (SELECT 1 FROM ai_run_sources s WHERE s.channel_id = ${channelId} AND s.source_event_id = ${sourceEvents.id})`,
          ),
        )
        .orderBy(sourceEvents.occurredAt)
        .limit(20);
      if (!sources.length) {
        if (userId)
          throw new ConflictException('No new retained chat to analyze');
        return null;
      }
      const [run] = await tx
        .insert(aiRuns)
        .values({
          channelId,
          generation: channel.aiGeneration,
          requestedByUserId: userId,
        })
        .returning();
      await tx.insert(aiRunSources).values(
        sources.map((source) => ({
          channelId,
          runId: run.id,
          sourceEventId: source.id,
        })),
      );
      return run;
    });
  }
  async enabledChannels() {
    return this.infrastructure.db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.aiExtractionEnabled, true))
      .limit(100);
  }
  async pending() {
    return this.infrastructure.db
      .select()
      .from(aiRuns)
      .where(inArray(aiRuns.status, ['queued', 'processing']))
      .orderBy(aiRuns.createdAt)
      .limit(100);
  }
  private async runContext(tx: Tx, runId: string, revision: number) {
    const [locator] = await tx
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, runId));
    if (!locator) return null;
    const [channel] = await tx
      .select()
      .from(channels)
      .where(eq(channels.id, locator.channelId))
      .for('update');
    const [run] = await tx
      .select()
      .from(aiRuns)
      .where(
        and(eq(aiRuns.id, runId), eq(aiRuns.channelId, locator.channelId)),
      );
    if (
      !run ||
      run.revision !== revision ||
      !['queued', 'processing'].includes(run.status)
    )
      return null;
    let error: AiError | undefined;
    if (
      !channel?.aiExtractionEnabled ||
      !channel.connectedAt ||
      channel.disconnectedAt ||
      run.generation !== channel.aiGeneration
    )
      error = 'disabled';
    if (
      !error &&
      run.requestedByUserId &&
      run.requestedByUserId !== channel.ownerUserId
    ) {
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.channelId, run.channelId),
            eq(memberships.userId, run.requestedByUserId),
          ),
        );
      if (!member) error = 'disabled';
    }
    const claimed = await tx
      .select()
      .from(aiRunSources)
      .where(
        and(
          eq(aiRunSources.channelId, run.channelId),
          eq(aiRunSources.runId, runId),
        ),
      );
    const sources = claimed.length
      ? await this.sourceQuery(tx, run.channelId).where(
          and(
            eq(sourceEvents.channelId, run.channelId),
            available,
            inArray(
              sourceEvents.id,
              claimed.map((row) => row.sourceEventId),
            ),
          ),
        )
      : [];
    if (!sources.length || sources.length !== claimed.length)
      error ||= 'source_unavailable';
    if (error) {
      await tx
        .update(aiRuns)
        .set({ status: 'cancelled', error, updatedAt: new Date() })
        .where(eq(aiRuns.id, runId));
      return null;
    }
    return { run, sources };
  }
  async begin(runId: string, revision: number) {
    return this.infrastructure.db.transaction(async (tx) => {
      const context = await this.runContext(tx, runId, revision);
      if (!context) return null;
      const [usage] = await tx
        .insert(aiDailyUsage)
        .values({
          channelId: context.run.channelId,
          day: new Date().toISOString().slice(0, 10),
          calls: 1,
        })
        .onConflictDoUpdate({
          target: [aiDailyUsage.channelId, aiDailyUsage.day],
          set: { calls: sql`${aiDailyUsage.calls} + 1` },
          setWhere: lt(aiDailyUsage.calls, env.AI_DAILY_CALL_LIMIT),
        })
        .returning();
      if (!usage) {
        await tx
          .update(aiRuns)
          .set({
            status: 'failed',
            error: 'daily_limit',
            updatedAt: new Date(),
          })
          .where(eq(aiRuns.id, runId));
        return null;
      }
      await tx
        .update(aiRuns)
        .set({
          status: 'processing',
          attempts: context.run.attempts + 1,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(aiRuns.id, runId));
      return context.sources;
    });
  }
  async complete(
    runId: string,
    revision: number,
    original: ExtractionSource[],
    drafts: CandidateDraft[],
  ) {
    await this.infrastructure.db.transaction(async (tx) => {
      const context = await this.runContext(tx, runId, revision);
      if (!context) return;
      if (
        context.sources.some(
          (source) =>
            !original.some(
              (prior) => prior.id === source.id && prior.text === source.text,
            ),
        )
      ) {
        await tx
          .update(aiRuns)
          .set({
            status: 'cancelled',
            error: 'source_unavailable',
            updatedAt: new Date(),
          })
          .where(eq(aiRuns.id, runId));
        return;
      }
      for (const draft of drafts) {
        const source = context.sources.find(
          (item) => item.id === draft.source_record_ids[0],
        );
        if (!source) throw new ConflictException('Source unavailable');
        await tx
          .insert(aiCandidates)
          .values({
            channelId: context.run.channelId,
            runId,
            sourceEventId: source.id,
            kind: draft.task_type,
            draft,
            model: env.GEMINI_MODEL,
            expiresAt: source.expiresAt,
          })
          .onConflictDoNothing();
      }
      await tx
        .update(aiRuns)
        .set({ status: 'completed', error: null, updatedAt: new Date() })
        .where(eq(aiRuns.id, runId));
    });
  }
  async fail(
    runId: string,
    revision: number,
    error: AiError,
    exhausted: boolean,
  ) {
    await this.infrastructure.db
      .update(aiRuns)
      .set({
        error,
        ...(exhausted ? { status: 'failed' as const } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiRuns.id, runId),
          eq(aiRuns.revision, revision),
          inArray(aiRuns.status, ['queued', 'processing']),
        ),
      );
  }
  async retry(channelId: string, userId: string, runId: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.authorize(tx, channelId, userId, true);
      const [run] = await tx
        .select()
        .from(aiRuns)
        .where(and(eq(aiRuns.channelId, channelId), eq(aiRuns.id, runId)));
      if (!run) throw new NotFoundException('Extraction not found');
      if (
        run.status !== 'failed' ||
        !channel.aiExtractionEnabled ||
        !env.GEMINI_API_KEY
      )
        throw new ConflictException('This extraction cannot be retried');
      const [active] = await tx
        .select()
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.channelId, channelId),
            inArray(aiRuns.status, ['queued', 'processing']),
          ),
        );
      if (active)
        throw new ConflictException('Wait for the current extraction');
      const [updated] = await tx
        .update(aiRuns)
        .set({
          revision: run.revision + 1,
          generation: channel.aiGeneration,
          requestedByUserId: userId,
          status: 'queued',
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(aiRuns.id, runId))
        .returning();
      return updated;
    });
  }
  async list(
    channelId: string,
    userId: string,
    status: 'pending' | 'confirmed' | 'dismissed' | 'expired',
    cursor?: string,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, userId);
      await expireCandidates(tx, channelId);
      if (cursor) {
        const [found] = await tx
          .select({ id: aiCandidates.id })
          .from(aiCandidates)
          .where(
            and(
              eq(aiCandidates.channelId, channelId),
              eq(aiCandidates.id, cursor),
            ),
          );
        if (!found) throw new NotFoundException('Candidate cursor not found');
      }
      const rows = await tx
        .select()
        .from(aiCandidates)
        .where(
          and(
            eq(aiCandidates.channelId, channelId),
            eq(aiCandidates.status, status),
            cursor ? lt(aiCandidates.id, cursor) : undefined,
          ),
        )
        .orderBy(desc(aiCandidates.id))
        .limit(51);
      const items = [];
      for (const candidate of rows.slice(0, 50)) {
        const [source] = await this.sourceQuery(tx, channelId).where(
          and(
            eq(sourceEvents.channelId, channelId),
            eq(sourceEvents.id, candidate.sourceEventId),
            available,
          ),
        );
        items.push({
          id: candidate.id,
          channelId,
          status: candidate.status,
          version: candidate.version,
          draft: source ? candidate.draft : null,
          origin: 'live_twitch',
          source: {
            id: candidate.sourceEventId,
            text: source?.text || null,
            available: Boolean(source),
          },
          provider: 'gemini',
          model: candidate.model,
          createdAt: candidate.createdAt,
          expiresAt: candidate.expiresAt,
          reviewedByTwitchUserId: candidate.reviewedByTwitchUserId,
          reviewedAt: candidate.reviewedAt,
          reviewReason: candidate.reviewReason,
          confirmedOpenLoopId: candidate.confirmedOpenLoopId,
        });
      }
      return { items, nextCursor: rows.length > 50 ? rows[49].id : null };
    });
  }
  async confirm(
    channelId: string,
    actor: Actor,
    candidateId: string,
    input: ReviewCandidate,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const [candidate] = await tx
        .select()
        .from(aiCandidates)
        .where(
          and(
            eq(aiCandidates.channelId, channelId),
            eq(aiCandidates.id, candidateId),
          ),
        )
        .for('update');
      if (!candidate) throw new NotFoundException('Candidate not found');
      if (
        candidate.status === 'confirmed' &&
        candidate.reviewRequestId === input.requestId &&
        candidate.reviewedByTwitchUserId === actor.twitchUserId
      ) {
        const [loop] = await tx
          .select()
          .from(openLoops)
          .where(
            and(
              eq(openLoops.channelId, channelId),
              eq(openLoops.id, candidate.confirmedOpenLoopId!),
            ),
          );
        if (
          loop.wording === input.wording &&
          loop.ownerLabel === (input.ownerLabel || null) &&
          loop.dueContext === (input.dueContext || null)
        )
          return { openLoopId: loop.id };
        throw new ConflictException(
          'Review request already used for different wording',
        );
      }
      if (
        candidate.status !== 'pending' ||
        candidate.version !== input.expectedVersion
      )
        throw new ConflictException(
          'This candidate changed. Refresh before reviewing',
        );
      const [source] = await this.sourceQuery(tx, channelId).where(
        and(
          eq(sourceEvents.channelId, channelId),
          eq(sourceEvents.id, candidate.sourceEventId),
          available,
        ),
      );
      if (
        !source ||
        !candidate.draft ||
        candidate.expiresAt <= new Date() ||
        !source.text.includes(candidate.draft.source_quote)
      )
        throw new ConflictException(
          'The original source is no longer available',
        );
      const openLoopId = await this.loops.confirmCandidate(tx, {
        channelId,
        candidateId,
        sourceEventId: source.id,
        excerpt: source.text,
        wording: input.wording,
        ownerLabel: input.ownerLabel,
        dueContext: input.dueContext,
        actorTwitchUserId: actor.twitchUserId,
      });
      await tx
        .update(aiCandidates)
        .set({
          status: 'confirmed',
          version: candidate.version + 1,
          reviewRequestId: input.requestId,
          reviewedByTwitchUserId: actor.twitchUserId,
          reviewedAt: new Date(),
          confirmedOpenLoopId: openLoopId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiCandidates.channelId, channelId),
            eq(aiCandidates.id, candidateId),
          ),
        );
      return { openLoopId };
    });
  }
  async dismiss(
    channelId: string,
    actor: Actor,
    candidateId: string,
    input: { expectedVersion: number; reason: string },
  ) {
    await this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      await expireCandidates(tx, channelId);
      const [candidate] = await tx
        .select()
        .from(aiCandidates)
        .where(
          and(
            eq(aiCandidates.channelId, channelId),
            eq(aiCandidates.id, candidateId),
          ),
        );
      if (!candidate) throw new NotFoundException('Candidate not found');
      if (
        candidate.status !== 'pending' ||
        candidate.version !== input.expectedVersion
      )
        throw new ConflictException(
          'This candidate changed. Refresh before reviewing',
        );
      await tx
        .update(aiCandidates)
        .set({
          status: 'dismissed',
          version: candidate.version + 1,
          reviewedByTwitchUserId: actor.twitchUserId,
          reviewedAt: new Date(),
          reviewReason: input.reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiCandidates.channelId, channelId),
            eq(aiCandidates.id, candidateId),
          ),
        );
    });
  }
}
