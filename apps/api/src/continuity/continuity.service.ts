import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  catchupScopes,
  moderationReadScopes,
  type continuitySettingSchema,
  type microphoneReviewSchema,
  microphoneCaptureSchema,
} from '@lore/shared';
import type { z } from 'zod';
import { InfrastructureService } from '../infrastructure.service';
import {
  channels,
  oauthConnections,
  aiDailyUsage,
  publicEntries,
  microphoneCaptures,
  sourceEvents,
  auditEvents,
  openLoops,
} from '../database/schema';
import { PublicationsRepository } from '../publications/publications.repository';
import { OpenLoopsRepository } from '../open-loops/open-loops.repository';
import { AiFailure, AiProvider } from '../ai/ai.provider';
import { env } from '../config';
import type { CaseActor, CaseTx } from '../cases/cases.repository';

export function validateMicrophoneWav(data: Buffer) {
  if (
    data.length < 46 ||
    data.length > 960044 ||
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== 'WAVE' ||
    data.toString('ascii', 12, 16) !== 'fmt ' ||
    data.readUInt32LE(16) !== 16 ||
    data.readUInt16LE(20) !== 1 ||
    data.readUInt16LE(22) !== 1 ||
    data.readUInt32LE(24) !== 16000 ||
    data.readUInt32LE(28) !== 32000 ||
    data.readUInt16LE(32) !== 2 ||
    data.readUInt16LE(34) !== 16 ||
    data.toString('ascii', 36, 40) !== 'data' ||
    data.readUInt32LE(40) !== data.length - 44 ||
    data.readUInt32LE(4) !== data.length - 8 ||
    (data.length - 44) % 2
  )
    throw new BadRequestException(
      'Record a mono 16 kHz WAV clip between 1 sample and 30 seconds',
    );
}
@Injectable()
export class ContinuityService {
  constructor(
    @Inject(InfrastructureService)
    readonly infrastructure: InfrastructureService,
    @Inject(PublicationsRepository)
    private readonly publications: PublicationsRepository,
    @Inject(OpenLoopsRepository) private readonly loops: OpenLoopsRepository,
    @Inject(AiProvider) private readonly ai: AiProvider,
  ) {}
  async settings(channelId: string, userId: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const { channel } = await this.publications.authorize(
        tx,
        channelId,
        userId,
      );
      const [connection] = channel.ownerUserId
        ? await tx
            .select()
            .from(oauthConnections)
            .where(eq(oauthConnections.userId, channel.ownerUserId))
        : [];
      const granted =
        connection && !connection.revokedAt ? connection.scopes : [];
      return {
        moderationImportsEnabled: channel.moderationImportsEnabled,
        promiseConfirmationsEnabled: channel.promiseConfirmationsEnabled,
        publicSummaryAiEnabled: channel.publicSummaryAiEnabled,
        microphoneEnabled: channel.microphoneEnabled,
        missingModerationScopes: moderationReadScopes.filter(
          (s) => !granted.includes(s),
        ),
        chatReady:
          catchupScopes.every((s) => granted.includes(s)) &&
          channel.captureRequested,
        aiConfigured: Boolean(env.GEMINI_API_KEY),
      };
    });
  }
  async configure(
    channelId: string,
    actor: CaseActor,
    input: z.infer<typeof continuitySettingSchema>,
  ) {
    await this.infrastructure.db.transaction(async (tx) => {
      const { channel, role } = await this.publications.authorize(
        tx,
        channelId,
        actor.id,
        input.enabled,
      );
      if (role !== 'owner')
        throw new ForbiddenException(
          'Only the owner can change feature consent',
        );
      if (
        input.enabled &&
        ['publicSummaryAiEnabled', 'microphoneEnabled'].includes(
          input.feature,
        ) &&
        !env.GEMINI_API_KEY
      )
        throw new ConflictException('Configure GEMINI_API_KEY first');
      if (
        input.enabled &&
        ['moderationImportsEnabled', 'promiseConfirmationsEnabled'].includes(
          input.feature,
        )
      ) {
        const [connection] = await tx
          .select()
          .from(oauthConnections)
          .where(eq(oauthConnections.userId, actor.id));
        const scopes =
          input.feature === 'moderationImportsEnabled'
            ? moderationReadScopes
            : catchupScopes;
        if (
          !channel.captureRequested ||
          !connection ||
          connection.revokedAt ||
          scopes.some((s) => !connection.scopes.includes(s))
        )
          throw new ConflictException(
            'Start capture and authorize the required Twitch permissions first',
          );
      }
      await tx
        .update(channels)
        .set({
          [input.feature]: input.enabled,
          featuresGeneration: channel.featuresGeneration + 1,
          ...(input.feature === 'moderationImportsEnabled'
            ? { moderationImportsEnabledAt: input.enabled ? new Date() : null }
            : {}),
          ...(input.feature === 'promiseConfirmationsEnabled'
            ? {
                promiseConfirmationsEnabledAt: input.enabled
                  ? new Date()
                  : null,
              }
            : {}),
        })
        .where(eq(channels.id, channelId));
      if (input.feature === 'microphoneEnabled' && !input.enabled) {
        await tx
          .update(microphoneCaptures)
          .set({ transcript: null, drafts: null })
          .where(eq(microphoneCaptures.channelId, channelId));
        await tx
          .update(sourceEvents)
          .set({ payload: null })
          .where(
            and(
              eq(sourceEvents.channelId, channelId),
              eq(sourceEvents.type, 'microphone.transcript'),
            ),
          );
      }
      await tx.insert(auditEvents).values({
        channelId,
        actorId: actor.id,
        targetId: channelId,
        action: `feature.${input.feature}.${input.enabled ? 'enabled' : 'disabled'}`,
      });
    });
    return this.settings(channelId, actor.id);
  }
  private async reserve(tx: CaseTx, channelId: string) {
    const day = new Date().toISOString().slice(0, 10);
    await tx
      .insert(aiDailyUsage)
      .values({ channelId, day, calls: 0 })
      .onConflictDoNothing();
    const [budget] = await tx
      .update(aiDailyUsage)
      .set({ calls: sql`${aiDailyUsage.calls}+1` })
      .where(
        and(
          eq(aiDailyUsage.channelId, channelId),
          eq(aiDailyUsage.day, day),
          sql`${aiDailyUsage.calls}<${env.AI_DAILY_CALL_LIMIT}`,
        ),
      )
      .returning();
    if (!budget)
      throw new ConflictException(
        'The shared daily AI call limit has been reached',
      );
  }
  private async consent(
    tx: CaseTx,
    channelId: string,
    userId: string,
    feature: 'microphoneEnabled' | 'publicSummaryAiEnabled',
    generation?: number,
  ) {
    const { channel } = await this.publications.authorize(
      tx,
      channelId,
      userId,
      true,
    );
    if (
      !channel[feature] ||
      (generation !== undefined && generation !== channel.featuresGeneration)
    )
      throw new ConflictException(
        'Consent or channel context changed; no AI result was saved',
      );
    if (!env.GEMINI_API_KEY)
      throw new ConflictException('Configure GEMINI_API_KEY first');
    return channel;
  }
  async summary(channelId: string, actor: CaseActor, sourceIds: string[]) {
    const snapshot = await this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.consent(
        tx,
        channelId,
        actor.id,
        'publicSummaryAiEnabled',
      );
      const sources = await tx
        .select({
          id: publicEntries.id,
          title: publicEntries.title,
          body: publicEntries.body,
          version: publicEntries.version,
        })
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channelId),
            eq(publicEntries.status, 'published'),
            inArray(publicEntries.id, sourceIds),
          ),
        );
      if (sources.length !== sourceIds.length)
        throw new ConflictException(
          'Choose currently published sources from this channel',
        );
      await this.reserve(tx, channelId);
      return { generation: channel.featuresGeneration, sources };
    });
    let draft;
    try {
      draft = await this.ai.summarize(
        snapshot.sources.map(({ id, title, body }) => ({ id, title, body })),
      );
    } catch (e) {
      throw new ServiceUnavailableException(
        e instanceof AiFailure && e.code === 'invalid_output'
          ? 'Gemini returned an invalid public draft'
          : 'Gemini quota or connection is unavailable',
      );
    }
    await this.infrastructure.db.transaction(async (tx) => {
      await this.consent(
        tx,
        channelId,
        actor.id,
        'publicSummaryAiEnabled',
        snapshot.generation,
      );
      const current = await tx
        .select({ id: publicEntries.id, version: publicEntries.version })
        .from(publicEntries)
        .where(
          and(
            eq(publicEntries.channelId, channelId),
            eq(publicEntries.status, 'published'),
            inArray(publicEntries.id, sourceIds),
          ),
        );
      if (
        current.length !== sourceIds.length ||
        snapshot.sources.some(
          (s) => !current.some((c) => c.id === s.id && c.version === s.version),
        )
      )
        throw new ConflictException(
          'A public source changed; generate a new draft',
        );
    });
    return draft;
  }
  async listen(channelId: string, actor: CaseActor, audio: Buffer) {
    validateMicrophoneWav(audio);
    const captureId = randomUUID(),
      sourceId = `microphone:${captureId}`;
    const snapshot = await this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.consent(
        tx,
        channelId,
        actor.id,
        'microphoneEnabled',
      );
      await this.reserve(tx, channelId);
      return {
        generation: channel.featuresGeneration,
        days: channel.chatRetentionDays,
      };
    });
    let result;
    try {
      result = await this.ai.listen(audio, sourceId);
    } catch {
      throw new ServiceUnavailableException(
        'Microphone transcription is unavailable; check Gemini quota and retry',
      );
    }
    return this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.consent(
        tx,
        channelId,
        actor.id,
        'microphoneEnabled',
        snapshot.generation,
      );
      const expiresAt = new Date(
        Date.now() +
          Math.min(snapshot.days, channel.chatRetentionDays) * 86400000,
      );
      await tx.insert(sourceEvents).values({
        id: sourceId,
        channelId,
        subscriptionId: 'microphone',
        type: 'microphone.transcript',
        occurredAt: new Date(),
        payload: { available: true },
        expiresAt,
        processedAt: new Date(),
        origin: 'manual_import',
      });
      const [capture] = await tx
        .insert(microphoneCaptures)
        .values({
          id: captureId,
          channelId,
          sourceEventId: sourceId,
          transcript: result.transcript,
          drafts: result.suggestions,
          model: env.GEMINI_MODEL,
          expiresAt,
        })
        .returning();
      await tx.insert(auditEvents).values({
        channelId,
        actorId: actor.id,
        action: 'microphone.captured',
        targetId: captureId,
      });
      return this.project(capture);
    });
  }
  private project(row: typeof microphoneCaptures.$inferSelect) {
    return microphoneCaptureSchema.parse({
      id: row.id,
      transcript: row.transcript,
      drafts: row.drafts,
      decisions: row.decisions,
      expiresAt: row.expiresAt.toISOString(),
      model: row.model,
    });
  }
  async voices(channelId: string, actor: CaseActor) {
    return this.infrastructure.db.transaction(async (tx) => {
      const { channel } = await this.publications.authorize(
        tx,
        channelId,
        actor.id,
      );
      if (!channel.microphoneEnabled || channel.disconnectedAt) return [];
      const rows = await tx
        .select()
        .from(microphoneCaptures)
        .where(
          and(
            eq(microphoneCaptures.channelId, channelId),
            sql`${microphoneCaptures.expiresAt}>now()`,
            sql`${microphoneCaptures.createdAt}+${channel.chatRetentionDays}*interval '1 day'>now()`,
          ),
        )
        .orderBy(desc(microphoneCaptures.createdAt))
        .limit(10);
      return rows.map((row) => this.project(row));
    });
  }
  async reviewVoice(
    channelId: string,
    actor: CaseActor,
    id: string,
    index: number,
    input: z.infer<typeof microphoneReviewSchema>,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.consent(
        tx,
        channelId,
        actor.id,
        'microphoneEnabled',
      );
      const [row] = await tx
        .select()
        .from(microphoneCaptures)
        .where(
          and(
            eq(microphoneCaptures.channelId, channelId),
            eq(microphoneCaptures.id, id),
          ),
        )
        .for('update');
      if (!row) throw new NotFoundException('Microphone capture not found');
      const existing = row.decisions[String(index)];
      if (existing) {
        if (
          (input.action === 'confirm' ? 'confirmed' : 'dismissed') !==
          existing.status
        )
          throw new ConflictException(
            'This suggestion has already been reviewed',
          );
        if (input.action === 'confirm' && existing.openLoopId) {
          const [loop] = await tx
            .select({ wording: openLoops.wording })
            .from(openLoops)
            .where(
              and(
                eq(openLoops.channelId, channelId),
                eq(openLoops.id, existing.openLoopId),
              ),
            );
          if (!loop || loop.wording !== input.wording)
            throw new ConflictException(
              'This suggestion was already confirmed with different wording',
            );
        }
        return existing;
      }
      const draft = row.drafts?.[index];
      if (
        !draft ||
        !row.transcript ||
        row.expiresAt <= new Date() ||
        row.createdAt.getTime() + channel.chatRetentionDays * 86400000 <=
          Date.now()
      )
        throw new ConflictException(
          'The microphone source is no longer available',
        );
      const openLoopId =
        input.action === 'confirm'
          ? await this.loops.confirmCandidate(tx, {
              channelId,
              candidateId: `${id}:${index}`,
              sourceEventId: row.sourceEventId,
              excerpt: row.transcript,
              wording: input.wording,
              actorTwitchUserId: actor.twitchUserId,
              origin: 'manual_import',
            })
          : null;
      const decision = {
        status:
          input.action === 'confirm'
            ? ('confirmed' as const)
            : ('dismissed' as const),
        openLoopId,
      };
      await tx
        .update(microphoneCaptures)
        .set({ decisions: { ...row.decisions, [index]: decision } })
        .where(eq(microphoneCaptures.id, id));
      await tx.insert(auditEvents).values({
        channelId,
        actorId: actor.id,
        targetId: id,
        action: `microphone.${decision.status}`,
        details:
          input.action === 'dismiss'
            ? { index, reason: input.reason }
            : { index, openLoopId },
      });
      return decision;
    });
  }
}
