import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  sql,
} from 'drizzle-orm';
import {
  caseEmbeddingModel,
  type AiError,
  type CaseRecommendation,
} from '@lore/shared';
import {
  aiDailyUsage,
  caseAiRuns,
  caseEvidence,
  cases,
  channels,
  evidence,
  memberships,
} from '../database/schema';
import { env } from '../config';
import { CasesRepository, type CaseTx } from './cases.repository';
import { CaseFileStorage } from './case-files.service';
type Run = typeof caseAiRuns.$inferSelect;
export function caseContext(record: typeof cases.$inferSelect) {
  return {
    id: record.id,
    title: record.title,
    incident: record.incident,
    appeal: record.appeal,
    incidentAt: record.incidentAt,
    rule: {
      title: record.ruleTitle,
      version: record.ruleVersion,
      text: record.ruleText,
    },
    outcome: record.outcome,
    rationale: record.rationale,
    followUp: record.followUp,
  };
}
export function embeddingText(record: typeof cases.$inferSelect) {
  return JSON.stringify({
    title: record.title,
    incident: record.incident,
    appeal: record.appeal,
    ruleTitle: record.ruleTitle,
    ruleVersion: record.ruleVersion,
    ruleText: record.ruleText,
    outcome: record.outcome,
    rationale: record.rationale,
  }).slice(0, 6000);
}
@Injectable()
export class CaseAiRepository {
  constructor(
    @Inject(CasesRepository) private readonly casesRepo: CasesRepository,
    @Inject(CaseFileStorage) private readonly storage: CaseFileStorage,
  ) {}
  get db() {
    return this.casesRepo.infrastructure.db;
  }
  async settings(channelId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const channel = await this.casesRepo.authorize(tx, channelId, userId);
      const [usage] = await tx
        .select()
        .from(aiDailyUsage)
        .where(
          and(
            eq(aiDailyUsage.channelId, channelId),
            eq(aiDailyUsage.day, new Date().toISOString().slice(0, 10)),
          ),
        );
      return {
        enabled: channel.caseAiEnabled,
        embeddingsConfigured: Boolean(env.GEMINI_API_KEY),
        reasoningConfigured: Boolean(env.GEMINI_API_KEY),
        storageConfigured: this.storage.configured,
        embeddingModel: caseEmbeddingModel,
        reasoningModel: env.GEMINI_MODEL,
        dailyUsed: usage?.calls || 0,
        dailyLimit: env.AI_DAILY_CALL_LIMIT,
      };
    });
  }
  async consent(channelId: string, userId: string, enabled: boolean) {
    await this.db.transaction(async (tx) => {
      const channel = await this.casesRepo.authorize(
        tx,
        channelId,
        userId,
        enabled,
        true,
      );
      if (enabled && !env.GEMINI_API_KEY)
        throw new ConflictException(
          'Configure GEMINI_API_KEY before enabling private case AI',
        );
      if (channel.caseAiEnabled === enabled) return;
      await tx
        .update(channels)
        .set({
          caseAiEnabled: enabled,
          caseAiGeneration: channel.caseAiGeneration + 1,
        })
        .where(eq(channels.id, channelId));
      await tx
        .update(caseAiRuns)
        .set({
          status: 'cancelled',
          error: 'disabled',
          recommendation: null,
          matches: [],
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(caseAiRuns.channelId, channelId),
            inArray(caseAiRuns.status, ['queued', 'processing']),
          ),
        );
      // Consent withdrawal removes vectors and stored AI drafts, including old-generation results.
      if (!enabled) {
        await tx
          .update(cases)
          .set({
            embedding: null,
            embeddingVersion: null,
            embeddingModel: null,
          })
          .where(eq(cases.channelId, channelId));
        await tx
          .update(caseAiRuns)
          .set({ matches: [], recommendation: null })
          .where(eq(caseAiRuns.channelId, channelId));
      }
      await this.casesRepo.audit(
        tx,
        channelId,
        userId,
        enabled ? 'case.ai_enabled' : 'case.ai_disabled',
        channelId,
      );
    });
    return this.settings(channelId, userId);
  }
  async request(channelId: string, userId: string, caseId: string) {
    return this.db.transaction(async (tx) => {
      const channel = await this.casesRepo.authorize(
        tx,
        channelId,
        userId,
        true,
      );
      const target = await this.casesRepo.find(tx, channelId, caseId);
      if (!channel.caseAiEnabled || !env.GEMINI_API_KEY)
        throw new ConflictException(
          'The owner must enable private case AI first',
        );
      const [active] = await tx
        .select()
        .from(caseAiRuns)
        .where(
          and(
            eq(caseAiRuns.channelId, channelId),
            eq(caseAiRuns.caseId, caseId),
            eq(caseAiRuns.kind, 'retrieve'),
            inArray(caseAiRuns.status, ['queued', 'processing']),
          ),
        );
      if (active) return { runId: active.id };
      // One explicit retrieval schedules a bounded indexing batch. Repeated requests can cover a larger history.
      const unindexed = await tx
        .select()
        .from(cases)
        .where(
          and(
            eq(cases.channelId, channelId),
            ne(cases.id, caseId),
            eq(cases.status, 'decided'),
            sql`(${cases.embedding} IS NULL OR ${cases.embeddingVersion} IS DISTINCT FROM ${cases.version} OR ${cases.embeddingModel} IS DISTINCT FROM ${caseEmbeddingModel})`,
          ),
        )
        .orderBy(desc(cases.decidedAt))
        .limit(20);
      for (const record of unindexed) {
        const [prior] = await tx
          .select()
          .from(caseAiRuns)
          .where(
            and(
              eq(caseAiRuns.channelId, channelId),
              eq(caseAiRuns.caseId, record.id),
              eq(caseAiRuns.kind, 'index'),
              eq(caseAiRuns.caseVersion, record.version),
              eq(caseAiRuns.generation, channel.caseAiGeneration),
              inArray(caseAiRuns.status, ['queued', 'processing']),
            ),
          );
        if (!prior)
          await tx.insert(caseAiRuns).values({
            channelId,
            caseId: record.id,
            caseVersion: record.version,
            generation: channel.caseAiGeneration,
            requestedByUserId: userId,
            kind: 'index',
          });
      }
      const [run] = await tx
        .insert(caseAiRuns)
        .values({
          channelId,
          caseId,
          caseVersion: target.version,
          generation: channel.caseAiGeneration,
          requestedByUserId: userId,
          kind: 'retrieve',
        })
        .returning();
      return { runId: run.id };
    });
  }
  async pending() {
    return this.db
      .select()
      .from(caseAiRuns)
      .where(inArray(caseAiRuns.status, ['queued', 'processing']))
      .orderBy(
        sql`CASE WHEN ${caseAiRuns.kind}='index' THEN 0 ELSE 1 END`,
        caseAiRuns.createdAt,
        caseAiRuns.id,
      )
      .limit(100);
  }
  private async context(tx: CaseTx, id: string, revision: number) {
    const [locator] = await tx
      .select()
      .from(caseAiRuns)
      .where(eq(caseAiRuns.id, id));
    if (!locator) return null;
    const [channel] = await tx
      .select()
      .from(channels)
      .where(eq(channels.id, locator.channelId))
      .for('update');
    const [run] = await tx
      .select()
      .from(caseAiRuns)
      .where(
        and(eq(caseAiRuns.channelId, locator.channelId), eq(caseAiRuns.id, id)),
      );
    if (
      !run ||
      run.revision !== revision ||
      !['queued', 'processing'].includes(run.status)
    )
      return null;
    let allowed =
      channel?.caseAiEnabled &&
      channel.connectedAt &&
      !channel.disconnectedAt &&
      channel.caseAiGeneration === run.generation;
    if (allowed && channel.ownerUserId !== run.requestedByUserId) {
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.channelId, run.channelId),
            eq(memberships.userId, run.requestedByUserId),
            eq(memberships.role, 'moderator'),
          ),
        );
      allowed = Boolean(member);
    }
    const record = await this.casesRepo.find(tx, run.channelId, run.caseId);
    if (
      !allowed ||
      record.version !== run.caseVersion ||
      (run.kind === 'index' && record.status !== 'decided')
    ) {
      await tx
        .update(caseAiRuns)
        .set({
          status: 'cancelled',
          error: allowed ? 'source_unavailable' : 'disabled',
          updatedAt: new Date(),
        })
        .where(eq(caseAiRuns.id, id));
      return null;
    }
    return { run, record };
  }
  async begin(id: string, revision: number) {
    return this.db.transaction(async (tx) => {
      const context = await this.context(tx, id, revision);
      if (!context) return null;
      await tx
        .update(caseAiRuns)
        .set({
          status: 'processing',
          attempts: context.run.attempts + 1,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(caseAiRuns.id, id));
      return context;
    });
  }
  async reserveCall(run: Run) {
    return this.db.transaction(async (tx) => {
      const context = await this.context(tx, run.id, run.revision);
      if (!context) return false;
      const [usage] = await tx
        .insert(aiDailyUsage)
        .values({
          channelId: run.channelId,
          day: new Date().toISOString().slice(0, 10),
          calls: 1,
        })
        .onConflictDoUpdate({
          target: [aiDailyUsage.channelId, aiDailyUsage.day],
          set: { calls: sql`${aiDailyUsage.calls}+1` },
          setWhere: lt(aiDailyUsage.calls, env.AI_DAILY_CALL_LIMIT),
        })
        .returning();
      if (!usage) {
        await tx
          .update(caseAiRuns)
          .set({
            status: 'failed',
            error: 'daily_limit',
            updatedAt: new Date(),
          })
          .where(eq(caseAiRuns.id, run.id));
        return false;
      }
      return true;
    });
  }
  async saveIndex(run: Run, embedding: number[]) {
    await this.db.transaction(async (tx) => {
      const context = await this.context(tx, run.id, run.revision);
      if (!context) return;
      await tx
        .update(cases)
        .set({
          embedding,
          embeddingVersion: context.record.version,
          embeddingModel: caseEmbeddingModel,
        })
        .where(
          and(eq(cases.channelId, run.channelId), eq(cases.id, run.caseId)),
        );
      await tx
        .update(caseAiRuns)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(caseAiRuns.id, run.id));
    });
  }
  async rank(run: Run, embedding: number[]) {
    return this.db.transaction(async (tx) => {
      const context = await this.context(tx, run.id, run.revision);
      if (!context) return null;
      // Materializing this scope guarantees channel/private eligibility is applied before vector ranking.
      const ranked = await tx.execute<{
        id: string;
        version: number;
        similarity: number;
      }>(
        sql`WITH eligible AS MATERIALIZED (SELECT id,version,embedding FROM cases WHERE channel_id=${run.channelId} AND id<>${run.caseId} AND status='decided' AND embedding IS NOT NULL AND embedding_version=version AND embedding_model=${caseEmbeddingModel}) SELECT id,version,1-(embedding <=> ${JSON.stringify(embedding)}::vector) AS similarity FROM eligible WHERE 1-(embedding <=> ${JSON.stringify(embedding)}::vector)>=0.35 ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector,id LIMIT 5`,
      );
      const matches = [];
      for (const row of ranked.rows)
        matches.push({
          record: await this.casesRepo.find(tx, run.channelId, row.id),
          similarity: Math.max(-1, Math.min(1, Number(row.similarity))),
        });
      const [eligible] = await tx
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.channelId, run.channelId),
            ne(cases.id, run.caseId),
            eq(cases.status, 'decided'),
          ),
        );
      const [indexed] = await tx
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.channelId, run.channelId),
            ne(cases.id, run.caseId),
            eq(cases.status, 'decided'),
            sql`${cases.embedding} IS NOT NULL AND ${cases.embeddingVersion}=${cases.version} AND ${cases.embeddingModel}=${caseEmbeddingModel}`,
          ),
        );
      const proofs = await tx
        .select({
          label: caseEvidence.label,
          excerpt: evidence.excerpt,
          fileName: caseEvidence.fileName,
        })
        .from(caseEvidence)
        .innerJoin(
          evidence,
          and(
            eq(evidence.channelId, run.channelId),
            eq(evidence.id, caseEvidence.evidenceId),
            eq(evidence.visibility, 'private_moderation'),
          ),
        )
        .where(
          and(
            eq(caseEvidence.channelId, run.channelId),
            eq(caseEvidence.caseId, run.caseId),
            isNull(caseEvidence.removedAt),
            sql`(${caseEvidence.fileState} IS NULL OR ${caseEvidence.fileState}='ready')`,
          ),
        )
        .orderBy(caseEvidence.createdAt)
        .limit(9);
      return {
        ...context,
        matches,
        indexedCount: indexed.n,
        eligibleCount: eligible.n,
        evidence: proofs.slice(0, 8).map((p) => ({
          ...p,
          excerpt: p.excerpt.slice(0, 1000),
          excerptTruncated: p.excerpt.length > 1000,
          fileContentsRead: false,
        })),
        additionalEvidenceOmitted: proofs.length > 8,
      };
    });
  }
  async complete(
    run: Run,
    result: {
      matches: { record: typeof cases.$inferSelect; similarity: number }[];
      indexedCount: number;
      eligibleCount: number;
    },
    recommendation: CaseRecommendation | null,
  ) {
    await this.db.transaction(async (tx) => {
      const context = await this.context(tx, run.id, run.revision);
      if (!context) return;
      for (const match of result.matches) {
        const current = await this.casesRepo.find(
          tx,
          run.channelId,
          match.record.id,
        );
        if (
          current.version !== match.record.version ||
          current.status !== 'decided'
        )
          throw new ConflictException('Precedent changed');
      }
      await tx
        .update(caseAiRuns)
        .set({
          status: 'completed',
          error: null,
          matches: result.matches.map((m) => ({
            caseId: m.record.id,
            version: m.record.version,
            similarity: m.similarity,
          })),
          recommendation,
          indexedCount: result.indexedCount,
          eligibleCount: result.eligibleCount,
          updatedAt: new Date(),
        })
        .where(eq(caseAiRuns.id, run.id));
    });
  }
  async fail(id: string, revision: number, error: AiError, exhausted: boolean) {
    await this.db
      .update(caseAiRuns)
      .set({
        error,
        ...(exhausted ? { status: 'failed' as const } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(caseAiRuns.id, id),
          eq(caseAiRuns.revision, revision),
          inArray(caseAiRuns.status, ['queued', 'processing']),
        ),
      );
  }
  async latest(channelId: string, userId: string, caseId: string) {
    return this.db.transaction(async (tx) => {
      const channel = await this.casesRepo.authorize(tx, channelId, userId);
      const current = await this.casesRepo.find(tx, channelId, caseId);
      const [run] = await tx
        .select()
        .from(caseAiRuns)
        .where(
          and(
            eq(caseAiRuns.channelId, channelId),
            eq(caseAiRuns.caseId, caseId),
            eq(caseAiRuns.kind, 'retrieve'),
          ),
        )
        .orderBy(desc(caseAiRuns.createdAt), desc(caseAiRuns.id))
        .limit(1);
      if (!run) return null;
      let stale =
        current.version !== run.caseVersion ||
        !channel.caseAiEnabled ||
        run.generation !== channel.caseAiGeneration;
      const matches = [];
      for (const match of run.matches) {
        const record = await this.casesRepo.find(tx, channelId, match.caseId);
        if (record.version !== match.version || record.status !== 'decided')
          stale = true;
        matches.push({
          case: {
            id: record.id,
            channelId,
            title: record.title,
            subjectReference: record.subjectReference,
            status: record.status,
            version: record.version,
            origin: record.origin,
            ruleTitle: record.ruleTitle,
            ruleVersion: record.ruleVersion,
            outcome: record.outcome,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          },
          rationale: record.rationale!,
          followUp: record.followUp || '',
          incident: record.incident,
          ruleText: record.ruleText,
          similarity: match.similarity,
        });
      }
      await this.casesRepo.audit(
        tx,
        channelId,
        userId,
        'case.precedents_viewed',
        caseId,
      );
      return {
        id: run.id,
        status: run.status,
        error: run.error,
        caseVersion: run.caseVersion,
        createdAt: run.createdAt,
        indexedCount: run.indexedCount,
        eligibleCount: run.eligibleCount,
        stale,
        matches: stale ? [] : matches,
        recommendation: stale ? null : run.recommendation,
      };
    });
  }
}
