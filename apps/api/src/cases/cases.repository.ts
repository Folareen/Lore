import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import {
  caseTransitions,
  type AddCaseEvidence,
  type CreateCase,
  type DecideCase,
  type UpdateCase,
} from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
import {
  auditEvents,
  caseAiRuns,
  caseEvidence,
  caseHistory,
  cases,
  channels,
  evidence,
  memberships,
  sourceEvents,
  chatMessages,
} from '../database/schema';
export type CaseTx = Parameters<
  Parameters<InfrastructureService['db']['transaction']>[0]
>[0];
export type CaseActor = { id: string; twitchUserId: string };
export const caseSummaryProjection = {
  id: cases.id,
  channelId: cases.channelId,
  title: cases.title,
  subjectReference: cases.subjectReference,
  status: cases.status,
  version: cases.version,
  origin: cases.origin,
  ruleTitle: cases.ruleTitle,
  ruleVersion: cases.ruleVersion,
  outcome: cases.outcome,
  createdAt: cases.createdAt,
  updatedAt: cases.updatedAt,
};
export function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
@Injectable()
export class CasesRepository {
  constructor(
    @Inject(InfrastructureService)
    readonly infrastructure: InfrastructureService,
  ) {}
  async authorize(
    tx: CaseTx,
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
            eq(memberships.role, 'moderator'),
          ),
        );
      if (
        ownerOnly ||
        !member ||
        !channel.connectedAt ||
        channel.disconnectedAt
      )
        throw new NotFoundException('Moderation access required');
    }
    if (mutation && (!channel.connectedAt || channel.disconnectedAt))
      throw new ConflictException('Reconnect the channel first');
    return channel;
  }
  async find(tx: CaseTx, channelId: string, id: string) {
    const [record] = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.channelId, channelId), eq(cases.id, id)));
    if (!record) throw new NotFoundException('Case not found');
    return record;
  }
  assertEditable(record: typeof cases.$inferSelect, version: number) {
    if (record.status === 'decided')
      throw new ConflictException(
        'This decision is final. Create a new case for a later review',
      );
    if (record.version !== version)
      throw new ConflictException(
        'This case changed. Refresh before trying again',
      );
  }
  async audit(
    tx: CaseTx,
    channelId: string,
    userId: string,
    action: string,
    targetId: string,
  ) {
    await tx
      .insert(auditEvents)
      .values({ channelId, actorId: userId, action, targetId });
  }
  async history(
    tx: CaseTx,
    record: typeof cases.$inferSelect,
    actor: CaseActor,
    action: typeof caseHistory.$inferInsert.action,
    reason?: string,
  ) {
    await tx.insert(caseHistory).values({
      channelId: record.channelId,
      caseId: record.id,
      version: record.version,
      action,
      actorTwitchUserId: actor.twitchUserId,
      reason,
    });
  }
  private async bump(
    tx: CaseTx,
    record: typeof cases.$inferSelect,
    actor: CaseActor,
    action: 'evidence_added' | 'evidence_removed',
    reason?: string,
  ) {
    const [updated] = await tx
      .update(cases)
      .set({
        version: record.version + 1,
        embedding: null,
        embeddingVersion: null,
        embeddingModel: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(cases.channelId, record.channelId), eq(cases.id, record.id)),
      )
      .returning();
    await this.history(tx, updated, actor, action, reason);
  }
  async list(
    channelId: string,
    userId: string,
    options: { status?: typeof cases.$inferSelect.status; cursor?: string },
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, userId);
      const cursor = options.cursor
        ? await this.find(tx, channelId, options.cursor)
        : null;
      const rows = await tx
        .select(caseSummaryProjection)
        .from(cases)
        .where(
          and(
            eq(cases.channelId, channelId),
            options.status ? eq(cases.status, options.status) : undefined,
            cursor
              ? or(
                  lt(cases.createdAt, cursor.createdAt),
                  and(
                    eq(cases.createdAt, cursor.createdAt),
                    lt(cases.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(cases.createdAt), desc(cases.id))
        .limit(51);
      await this.audit(tx, channelId, userId, 'case.list_viewed', channelId);
      return {
        items: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? rows[49].id : null,
      };
    });
  }
  async get(channelId: string, userId: string, id: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.authorize(tx, channelId, userId);
      const record = await this.find(tx, channelId, id);
      const rows = await tx
        .select({
          link: caseEvidence,
          proof: evidence,
          originalAvailable: sql<
            boolean | null
          >`CASE WHEN ${evidence.sourceEventId} IS NULL THEN NULL ELSE ${sourceEvents.payload} IS NOT NULL AND ${sourceEvents.expiresAt} > now() AND ${sourceEvents.occurredAt} + ${channel.chatRetentionDays} * interval '1 day' > now() END`,
        })
        .from(caseEvidence)
        .innerJoin(
          evidence,
          and(
            eq(evidence.channelId, channelId),
            eq(evidence.id, caseEvidence.evidenceId),
            eq(evidence.visibility, 'private_moderation'),
          ),
        )
        .leftJoin(
          sourceEvents,
          and(
            eq(sourceEvents.channelId, channelId),
            eq(sourceEvents.id, evidence.sourceEventId),
          ),
        )
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.caseId, id),
          ),
        )
        .orderBy(asc(caseEvidence.createdAt));
      const history = await tx
        .select({
          id: caseHistory.id,
          version: caseHistory.version,
          action: caseHistory.action,
          actorTwitchUserId: caseHistory.actorTwitchUserId,
          reason: caseHistory.reason,
          occurredAt: caseHistory.occurredAt,
        })
        .from(caseHistory)
        .where(
          and(eq(caseHistory.channelId, channelId), eq(caseHistory.caseId, id)),
        )
        .orderBy(asc(caseHistory.version));
      await this.audit(tx, channelId, userId, 'case.viewed', id);
      return {
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
        incident: record.incident,
        appeal: record.appeal,
        incidentAt: record.incidentAt,
        ruleText: record.ruleText,
        rationale: record.rationale,
        followUp: record.followUp,
        decidedByTwitchUserId: record.decidedByTwitchUserId,
        decidedAt: record.decidedAt,
        aiRunId: record.aiRunId,
        aiDisposition: record.aiDisposition,
        history,
        evidence: rows.map(({ link, proof, originalAvailable }) => ({
          id: link.id,
          label: link.label,
          excerpt: link.removedAt ? null : proof.excerpt,
          origin: proof.origin,
          sourceEventId: link.removedAt ? null : proof.sourceEventId,
          originalAvailable: link.removedAt ? false : originalAvailable,
          occurredAt: link.occurredAt,
          createdAt: link.createdAt,
          removed: Boolean(link.removedAt),
          file: link.fileName
            ? {
                name: link.fileName,
                contentType: link.contentType!,
                size: link.byteLength!,
                available: !link.removedAt && link.fileState === 'ready',
              }
            : null,
        })),
      };
    });
  }
  async create(channelId: string, actor: CaseActor, input: CreateCase) {
    const id = await this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const hash = fingerprint({ actor: actor.id, input });
      const [existing] = await tx
        .select()
        .from(cases)
        .where(
          and(
            eq(cases.channelId, channelId),
            eq(cases.requestId, input.requestId),
          ),
        );
      if (existing) {
        if (existing.requestFingerprint !== hash)
          throw new ConflictException(
            'Case request already used for different content',
          );
        return existing.id;
      }
      const [record] = await tx
        .insert(cases)
        .values({
          ...input,
          channelId,
          incidentAt: input.incidentAt ? new Date(input.incidentAt) : null,
          requestFingerprint: hash,
          createdByTwitchUserId: actor.twitchUserId,
        })
        .returning();
      await this.history(tx, record, actor, 'created');
      return record.id;
    });
    return this.get(channelId, actor.id, id);
  }
  async update(
    channelId: string,
    actor: CaseActor,
    id: string,
    input: UpdateCase,
  ) {
    await this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const record = await this.find(tx, channelId, id);
      this.assertEditable(record, input.expectedVersion);
      if (
        input.status !== record.status &&
        !caseTransitions[record.status].includes(input.status)
      )
        throw new ConflictException('This status change is not allowed');
      const { expectedVersion, ...fields } = input;
      const [updated] = await tx
        .update(cases)
        .set({
          ...fields,
          incidentAt: input.incidentAt ? new Date(input.incidentAt) : null,
          version: expectedVersion + 1,
          embedding: null,
          embeddingVersion: null,
          embeddingModel: null,
          updatedAt: new Date(),
        })
        .where(and(eq(cases.channelId, channelId), eq(cases.id, id)))
        .returning();
      await this.history(tx, updated, actor, 'updated');
    });
    return this.get(channelId, actor.id, id);
  }
  async decide(
    channelId: string,
    actor: CaseActor,
    id: string,
    input: DecideCase,
  ) {
    await this.infrastructure.db.transaction(async (tx) => {
      const channel = await this.authorize(tx, channelId, actor.id, true);
      const record = await this.find(tx, channelId, id);
      if (
        record.status === 'decided' &&
        record.decisionRequestId === input.requestId &&
        record.decidedByTwitchUserId === actor.twitchUserId &&
        record.outcome === input.outcome &&
        record.rationale === input.rationale &&
        record.followUp === input.followUp &&
        record.aiRunId === input.aiRunId &&
        record.aiDisposition === input.aiDisposition
      )
        return;
      this.assertEditable(record, input.expectedVersion);
      if (Boolean(input.aiRunId) !== Boolean(input.aiDisposition))
        throw new ConflictException('Choose how this AI draft was reviewed');
      if (input.aiRunId) {
        const [run] = await tx
          .select()
          .from(caseAiRuns)
          .where(
            and(
              eq(caseAiRuns.channelId, channelId),
              eq(caseAiRuns.caseId, id),
              eq(caseAiRuns.id, input.aiRunId),
              eq(caseAiRuns.caseVersion, record.version),
              eq(caseAiRuns.status, 'completed'),
            ),
          );
        if (
          !run?.recommendation ||
          !channel.caseAiEnabled ||
          run.generation !== channel.caseAiGeneration
        )
          throw new ConflictException('The AI draft is no longer current');
        if (
          input.aiDisposition === 'accepted' &&
          input.outcome !== run.recommendation.proposed_action
        )
          throw new ConflictException(
            'Mark an altered outcome as modified or rejected',
          );
      }
      const [updated] = await tx
        .update(cases)
        .set({
          status: 'decided',
          aiRunId: input.aiRunId,
          aiDisposition: input.aiDisposition,
          outcome: input.outcome,
          rationale: input.rationale,
          followUp: input.followUp,
          decisionRequestId: input.requestId,
          decidedByTwitchUserId: actor.twitchUserId,
          decidedAt: new Date(),
          version: record.version + 1,
          embedding: null,
          embeddingVersion: null,
          embeddingModel: null,
          updatedAt: new Date(),
        })
        .where(and(eq(cases.channelId, channelId), eq(cases.id, id)))
        .returning();
      await this.history(tx, updated, actor, 'decided', input.rationale);
    });
    return this.get(channelId, actor.id, id);
  }
  private async capacity(tx: CaseTx, channelId: string, caseId: string) {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(caseEvidence)
      .where(
        and(
          eq(caseEvidence.channelId, channelId),
          eq(caseEvidence.caseId, caseId),
          isNull(caseEvidence.removedAt),
        ),
      );
    if (row.count >= 50)
      throw new ConflictException('A case can retain up to 50 evidence items');
  }
  async addEvidence(
    channelId: string,
    actor: CaseActor,
    id: string,
    input: AddCaseEvidence,
  ) {
    await this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const record = await this.find(tx, channelId, id);
      const hash = fingerprint({ actor: actor.id, ...input });
      const [existing] = await tx
        .select()
        .from(caseEvidence)
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.requestId, input.requestId),
          ),
        );
      if (existing) {
        if (
          existing.inputFingerprint !== hash ||
          existing.caseId !== id ||
          existing.removedAt
        )
          throw new ConflictException('Evidence request already used');
        return;
      }
      this.assertEditable(record, input.expectedVersion);
      await this.capacity(tx, channelId, id);
      let excerpt = input.excerpt;
      if (input.sourceEventId) {
        const [source] = await tx
          .select({ text: chatMessages.text })
          .from(sourceEvents)
          .innerJoin(
            chatMessages,
            and(
              eq(chatMessages.channelId, channelId),
              eq(chatMessages.sourceEventId, sourceEvents.id),
            ),
          )
          .innerJoin(channels, eq(channels.id, sourceEvents.channelId))
          .where(
            and(
              eq(sourceEvents.channelId, channelId),
              eq(sourceEvents.id, input.sourceEventId),
              sql`${sourceEvents.payload} IS NOT NULL AND ${sourceEvents.expiresAt} > now() AND ${chatMessages.expiresAt} > now() AND ${chatMessages.occurredAt} + ${channels.chatRetentionDays} * interval '1 day' > now()`,
            ),
          );
        if (!source || !source.text.includes(excerpt))
          throw new ConflictException('The cited chat excerpt is unavailable');
        excerpt = source.text; // Retain the full message as context, never just a model's summary.
      }
      const [proof] = await tx
        .insert(evidence)
        .values({
          channelId,
          excerpt,
          sourceEventId: input.sourceEventId,
          origin: input.sourceEventId ? 'live_twitch' : 'manual_import',
          visibility: 'private_moderation',
        })
        .returning();
      await tx.insert(caseEvidence).values({
        channelId,
        caseId: id,
        evidenceId: proof.id,
        requestId: input.requestId,
        inputFingerprint: hash,
        label: input.label,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
      });
      await this.bump(tx, record, actor, 'evidence_added');
    });
    return this.get(channelId, actor.id, id);
  }
  async removeEvidence(
    channelId: string,
    actor: CaseActor,
    id: string,
    evidenceId: string,
    input: { expectedVersion: number; reason: string },
  ) {
    await this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const record = await this.find(tx, channelId, id);
      this.assertEditable(record, input.expectedVersion);
      const [link] = await tx
        .select()
        .from(caseEvidence)
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.caseId, id),
            eq(caseEvidence.id, evidenceId),
            isNull(caseEvidence.removedAt),
          ),
        );
      if (!link) throw new NotFoundException('Evidence not found');
      await tx
        .update(caseEvidence)
        .set({
          removedAt: new Date(),
          fileState: link.fileState ? 'removed' : null,
        })
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.id, evidenceId),
          ),
        );
      await tx
        .update(evidence)
        .set({ excerpt: '', sourceEventId: null })
        .where(
          and(
            eq(evidence.channelId, channelId),
            eq(evidence.id, link.evidenceId),
            eq(evidence.visibility, 'private_moderation'),
          ),
        );
      await this.bump(tx, record, actor, 'evidence_removed', input.reason);
    });
    return this.get(channelId, actor.id, id);
  }
  async reserveFile(
    channelId: string,
    actor: CaseActor,
    id: string,
    input: { expectedVersion: number; requestId: string; label: string },
    file: { name: string; type: string; size: number; checksum: string },
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const record = await this.find(tx, channelId, id);
      const hash = fingerprint({ actor: actor.id, id, input, file });
      const [existing] = await tx
        .select()
        .from(caseEvidence)
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.requestId, input.requestId),
          ),
        );
      if (existing) {
        if (existing.inputFingerprint !== hash || existing.removedAt)
          throw new ConflictException('Upload request already used');
        return existing;
      }
      this.assertEditable(record, input.expectedVersion);
      await this.capacity(tx, channelId, id);
      const [proof] = await tx
        .insert(evidence)
        .values({
          channelId,
          excerpt: input.label,
          origin: 'manual_import',
          visibility: 'private_moderation',
        })
        .returning();
      const fileId = randomUUID();
      const [link] = await tx
        .insert(caseEvidence)
        .values({
          id: fileId,
          channelId,
          caseId: id,
          evidenceId: proof.id,
          requestId: input.requestId,
          inputFingerprint: hash,
          label: input.label,
          storageKey: `channels/${channelId}/cases/${id}/${fileId}`,
          fileName: file.name,
          contentType: file.type,
          byteLength: file.size,
          checksum: file.checksum,
          fileState: 'pending',
          uploadExpiresAt: new Date(Date.now() + 15 * 60_000),
        })
        .returning();
      return link;
    });
  }
  async finishFile(
    channelId: string,
    actor: CaseActor,
    id: string,
    fileId: string,
    version: number,
  ) {
    await this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, actor.id, true);
      const record = await this.find(tx, channelId, id);
      const [link] = await tx
        .select()
        .from(caseEvidence)
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.caseId, id),
            eq(caseEvidence.id, fileId),
          ),
        );
      if (
        !link ||
        link.removedAt ||
        !link.uploadExpiresAt ||
        link.uploadExpiresAt <= new Date()
      )
        throw new ConflictException('Upload expired. Refresh and try again');
      if (link.fileState === 'ready') return;
      this.assertEditable(record, version);
      await tx
        .update(caseEvidence)
        .set({ fileState: 'ready' })
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.id, fileId),
          ),
        );
      await this.bump(tx, record, actor, 'evidence_added');
    });
    return this.get(channelId, actor.id, id);
  }
  async abandonFile(channelId: string, fileId: string) {
    await this.infrastructure.db.transaction(async (tx) => {
      await tx
        .select()
        .from(channels)
        .where(eq(channels.id, channelId))
        .for('update');
      const [link] = await tx
        .update(caseEvidence)
        .set({ removedAt: new Date(), fileState: 'removed' })
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.id, fileId),
            eq(caseEvidence.fileState, 'pending'),
          ),
        )
        .returning();
      if (link)
        await tx
          .update(evidence)
          .set({ excerpt: '' })
          .where(
            and(
              eq(evidence.channelId, channelId),
              eq(evidence.id, link.evidenceId),
            ),
          );
    });
  }
  async file(channelId: string, userId: string, id: string, fileId: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      await this.authorize(tx, channelId, userId);
      await this.find(tx, channelId, id);
      const [link] = await tx
        .select()
        .from(caseEvidence)
        .where(
          and(
            eq(caseEvidence.channelId, channelId),
            eq(caseEvidence.caseId, id),
            eq(caseEvidence.id, fileId),
            eq(caseEvidence.fileState, 'ready'),
            isNull(caseEvidence.removedAt),
          ),
        );
      if (!link?.storageKey) throw new NotFoundException('File unavailable');
      await this.audit(tx, channelId, userId, 'case.evidence_download', fileId);
      return link;
    });
  }
}
