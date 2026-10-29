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
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  repairTransitions,
  handoffTaskTransitions,
  consistencyTransitions,
  type createRepairSchema,
  type updateRepairSchema,
  type createFlagSchema,
  type recordRuleChangeSchema,
  type reviewFlagSchema,
  type updateHandoffTaskSchema,
} from '@lore/shared';
import {
  CasesRepository,
  caseSummaryProjection,
  fingerprint,
  type CaseActor,
  type CaseTx,
} from '../cases/cases.repository';
import {
  cases,
  caseEvidence,
  users,
  memberships,
  repairActions,
  consistencyFlags,
  handoffs,
  handoffItems,
  moderationActivity,
  ruleChanges,
} from '../database/schema';

export const deskQuerySchema = z.strictObject({
  caseId: z.uuid().optional(),
  repairCursor: z.uuid().optional(),
  flagCursor: z.uuid().optional(),
  handoffCursor: z.uuid().optional(),
  ruleCursor: z.uuid().optional(),
  activityCursor: z.uuid().optional(),
});
type DeskQuery = z.infer<typeof deskQuerySchema>;
@Injectable()
export class ModerationRepository {
  constructor(
    @Inject(CasesRepository) private readonly casesRepo: CasesRepository,
  ) {}
  private get db() {
    return this.casesRepo.infrastructure.db;
  }
  private async assignee(tx: CaseTx, channelId: string, userId: string | null) {
    if (userId) await this.casesRepo.authorize(tx, channelId, userId);
  }
  private async log(
    tx: CaseTx,
    channelId: string,
    actor: CaseActor,
    targetType: typeof moderationActivity.$inferInsert.targetType,
    targetId: string,
    caseId: string | null,
    action: string,
    note: string | null,
    assigneeId: string | null = null,
  ) {
    await tx.insert(moderationActivity).values({
      channelId,
      caseId,
      targetType,
      targetId,
      action,
      actorTwitchUserId: actor.twitchUserId,
      occurredAt: new Date(),
      note,
      assigneeId,
    });
    await this.casesRepo.audit(
      tx,
      channelId,
      actor.id,
      `moderation.${action}`,
      targetId,
    );
  }
  private ruleProjection(row: typeof ruleChanges.$inferSelect) {
    return {
      id: row.id,
      channelId: row.channelId,
      title: row.title,
      previousVersion: row.previousVersion,
      version: row.version,
      ruleText: row.ruleText,
      changeSummary: row.changeSummary,
      actorTwitchUserId: row.actorTwitchUserId,
      createdAt: row.createdAt,
    };
  }
  async recordRuleChange(
    channelId: string,
    actor: CaseActor,
    input: z.infer<typeof recordRuleChangeSchema>,
  ) {
    return this.db.transaction(async (tx) => {
      await this.casesRepo.authorize(tx, channelId, actor.id, true);
      if (input.previousVersion === input.version)
        throw new ConflictException(
          'Use a different version for the rule change',
        );
      const hash = fingerprint({ actor: actor.id, ...input });
      const [existing] = await tx
        .select()
        .from(ruleChanges)
        .where(
          and(
            eq(ruleChanges.channelId, channelId),
            eq(ruleChanges.requestId, input.requestId),
          ),
        );
      if (existing) {
        if (existing.inputFingerprint !== hash)
          throw new ConflictException('Request ID was already used');
        return this.ruleProjection(existing);
      }
      const [row] = await tx
        .insert(ruleChanges)
        .values({
          ...input,
          channelId,
          inputFingerprint: hash,
          actorTwitchUserId: actor.twitchUserId,
          createdAt: new Date(),
        })
        .returning();
      await this.log(
        tx,
        channelId,
        actor,
        'rule',
        row.id,
        null,
        'rule_change_recorded',
        input.changeSummary,
      );
      return this.ruleProjection(row);
    });
  }
  async desk(channelId: string, actor: CaseActor, query: DeskQuery) {
    return this.db.transaction(async (tx) => {
      const channel = await this.casesRepo.authorize(tx, channelId, actor.id);
      if (query.caseId) await this.casesRepo.find(tx, channelId, query.caseId);
      const members = await tx
        .select({
          id: users.id,
          displayName: users.displayName,
          twitchUserId: users.twitchUserId,
        })
        .from(users)
        .leftJoin(
          memberships,
          and(
            eq(memberships.userId, users.id),
            eq(memberships.channelId, channelId),
            eq(memberships.role, 'moderator'),
          ),
        )
        .where(
          or(
            eq(users.id, channel.ownerUserId!),
            sql`${memberships.userId} IS NOT NULL`,
          ),
        )
        .orderBy(asc(users.displayName));
      const repairCursor = query.repairCursor
        ? await this.findRepair(tx, channelId, query.repairCursor)
        : null;
      const flagCursor = query.flagCursor
        ? await this.findFlag(tx, channelId, query.flagCursor)
        : null;
      const handoffCursor = query.handoffCursor
        ? await this.findHandoff(tx, channelId, query.handoffCursor)
        : null;
      const repairs = await tx
        .select()
        .from(repairActions)
        .where(
          and(
            eq(repairActions.channelId, channelId),
            query.caseId ? eq(repairActions.caseId, query.caseId) : undefined,
            repairCursor
              ? or(
                  lt(repairActions.createdAt, repairCursor.createdAt),
                  and(
                    eq(repairActions.createdAt, repairCursor.createdAt),
                    lt(repairActions.id, repairCursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(repairActions.createdAt), desc(repairActions.id))
        .limit(51);
      const flags = await tx
        .select()
        .from(consistencyFlags)
        .where(
          and(
            eq(consistencyFlags.channelId, channelId),
            query.caseId
              ? or(
                  eq(consistencyFlags.caseId, query.caseId),
                  eq(consistencyFlags.comparedCaseId, query.caseId),
                )
              : undefined,
            flagCursor
              ? or(
                  lt(consistencyFlags.createdAt, flagCursor.createdAt),
                  and(
                    eq(consistencyFlags.createdAt, flagCursor.createdAt),
                    lt(consistencyFlags.id, flagCursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(consistencyFlags.createdAt), desc(consistencyFlags.id))
        .limit(51);
      const rows = await tx
        .select()
        .from(handoffs)
        .where(
          and(
            eq(handoffs.channelId, channelId),
            handoffCursor
              ? or(
                  lt(handoffs.createdAt, handoffCursor.createdAt),
                  and(
                    eq(handoffs.createdAt, handoffCursor.createdAt),
                    lt(handoffs.id, handoffCursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(handoffs.createdAt), desc(handoffs.id))
        .limit(11);
      const bundles = [];
      for (const row of rows.slice(0, 10))
        bundles.push({
          ...this.handoffProjection(row),
          items: await tx
            .select()
            .from(handoffItems)
            .where(
              and(
                eq(handoffItems.channelId, channelId),
                eq(handoffItems.handoffId, row.id),
              ),
            )
            .orderBy(asc(handoffItems.id)),
        });
      const [activityCursor] = query.activityCursor
        ? await tx
            .select()
            .from(moderationActivity)
            .where(
              and(
                eq(moderationActivity.channelId, channelId),
                eq(moderationActivity.id, query.activityCursor),
              ),
            )
        : [];
      if (query.activityCursor && !activityCursor)
        throw new NotFoundException('History cursor unavailable');
      const [ruleCursor] = query.ruleCursor
        ? await tx
            .select()
            .from(ruleChanges)
            .where(
              and(
                eq(ruleChanges.channelId, channelId),
                eq(ruleChanges.id, query.ruleCursor),
              ),
            )
        : [];
      if (query.ruleCursor && !ruleCursor)
        throw new NotFoundException('Rule cursor unavailable');
      const activity = await tx
        .select({
          id: moderationActivity.id,
          caseId: moderationActivity.caseId,
          targetType: moderationActivity.targetType,
          targetId: moderationActivity.targetId,
          action: moderationActivity.action,
          actorTwitchUserId: moderationActivity.actorTwitchUserId,
          note: moderationActivity.note,
          assigneeId: moderationActivity.assigneeId,
          occurredAt: moderationActivity.occurredAt,
        })
        .from(moderationActivity)
        .where(
          and(
            eq(moderationActivity.channelId, channelId),
            activityCursor
              ? or(
                  lt(moderationActivity.occurredAt, activityCursor.occurredAt),
                  and(
                    eq(
                      moderationActivity.occurredAt,
                      activityCursor.occurredAt,
                    ),
                    lt(moderationActivity.id, activityCursor.id),
                  ),
                )
              : undefined,
            query.caseId
              ? eq(moderationActivity.caseId, query.caseId)
              : undefined,
          ),
        )
        .orderBy(
          desc(moderationActivity.occurredAt),
          desc(moderationActivity.id),
        )
        .limit(101);
      await this.casesRepo.audit(
        tx,
        channelId,
        actor.id,
        'moderation.viewed',
        query.caseId ?? channelId,
      );
      const changes = await tx
        .select()
        .from(ruleChanges)
        .where(
          and(
            eq(ruleChanges.channelId, channelId),
            ruleCursor
              ? or(
                  lt(ruleChanges.createdAt, ruleCursor.createdAt),
                  and(
                    eq(ruleChanges.createdAt, ruleCursor.createdAt),
                    lt(ruleChanges.id, ruleCursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(ruleChanges.createdAt), desc(ruleChanges.id))
        .limit(51);
      return {
        ruleChanges: changes.slice(0, 50).map((r) => this.ruleProjection(r)),
        ruleChangesTruncated: changes.length > 50,
        assignees: members,
        repairs: repairs.slice(0, 50).map((r) => this.repairProjection(r)),
        flags: flags.slice(0, 50).map((r) => this.flagProjection(r)),
        handoffs: bundles,
        activity: activity.slice(0, 100),
        activityTruncated: activity.length > 100,
        nextCursors: {
          repairs: repairs.length > 50 ? repairs[49].id : null,
          flags: flags.length > 50 ? flags[49].id : null,
          handoffs: rows.length > 10 ? rows[9].id : null,
          ruleChanges: changes.length > 50 ? changes[49].id : null,
          activity: activity.length > 100 ? activity[99].id : null,
        },
      };
    });
  }
  private repairProjection(row: typeof repairActions.$inferSelect) {
    return {
      id: row.id,
      channelId: row.channelId,
      caseId: row.caseId,
      title: row.title,
      kind: row.kind,
      agreement: row.agreement,
      assigneeId: row.assigneeId,
      dueAt: row.dueAt,
      status: row.status,
      version: row.version,
      completionNote: row.completionNote,
      evidenceId: row.evidenceId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private flagProjection(row: typeof consistencyFlags.$inferSelect) {
    return {
      id: row.id,
      channelId: row.channelId,
      caseId: row.caseId,
      comparedCaseId: row.comparedCaseId,
      caseVersion: row.caseVersion,
      comparedVersion: row.comparedVersion,
      version: row.version,
      status: row.status,
      origin: row.origin,
      concern: row.concern,
      reviewNote: row.reviewNote,
      severityContext: row.severityContext,
      evidenceContext: row.evidenceContext,
      reviewedByTwitchUserId: row.reviewedByTwitchUserId,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private handoffProjection(row: typeof handoffs.$inferSelect) {
    return {
      id: row.id,
      channelId: row.channelId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      summary: row.summary,
      createdByTwitchUserId: row.createdByTwitchUserId,
      createdAt: row.createdAt,
      recentDecisions: row.recentDecisions,
      ruleContexts: row.ruleContexts,
      ruleChanges: row.ruleChanges,
      truncated: row.truncated,
    };
  }
  private async findRepair(tx: CaseTx, channelId: string, id: string) {
    const [r] = await tx
      .select()
      .from(repairActions)
      .where(
        and(eq(repairActions.channelId, channelId), eq(repairActions.id, id)),
      );
    if (!r) throw new NotFoundException('Repair action not found');
    return r;
  }
  private async findFlag(tx: CaseTx, channelId: string, id: string) {
    const [r] = await tx
      .select()
      .from(consistencyFlags)
      .where(
        and(
          eq(consistencyFlags.channelId, channelId),
          eq(consistencyFlags.id, id),
        ),
      );
    if (!r) throw new NotFoundException('Consistency flag not found');
    return r;
  }
  private async findHandoff(tx: CaseTx, channelId: string, id: string) {
    const [r] = await tx
      .select()
      .from(handoffs)
      .where(and(eq(handoffs.channelId, channelId), eq(handoffs.id, id)));
    if (!r) throw new NotFoundException('Handoff not found');
    return r;
  }
  async createRepair(
    channelId: string,
    actor: CaseActor,
    input: z.infer<typeof createRepairSchema>,
  ) {
    return this.db.transaction(async (tx) => {
      await this.casesRepo.authorize(tx, channelId, actor.id, true);
      const hash = fingerprint({ actor: actor.id, ...input });
      const [existing] = await tx
        .select()
        .from(repairActions)
        .where(
          and(
            eq(repairActions.channelId, channelId),
            eq(repairActions.requestId, input.requestId),
          ),
        );
      if (existing) {
        if (existing.inputFingerprint !== hash)
          throw new ConflictException('Request ID was already used');
        return this.repairProjection(existing);
      }
      const record = await this.casesRepo.find(tx, channelId, input.caseId);
      if (record.status !== 'decided')
        throw new ConflictException(
          'Record a human case decision before agreeing repair actions',
        );
      await this.assignee(tx, channelId, input.assigneeId);
      const [row] = await tx
        .insert(repairActions)
        .values({
          ...input,
          channelId,
          inputFingerprint: hash,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      await this.log(
        tx,
        channelId,
        actor,
        'repair',
        row.id,
        row.caseId,
        'repair_created',
        input.agreement,
        input.assigneeId,
      );
      return this.repairProjection(row);
    });
  }
  async updateRepair(
    channelId: string,
    actor: CaseActor,
    id: string,
    input: z.infer<typeof updateRepairSchema>,
  ) {
    return this.db.transaction(async (tx) => {
      await this.casesRepo.authorize(tx, channelId, actor.id, true);
      const row = await this.findRepair(tx, channelId, id);
      if (
        row.version !== input.expectedVersion ||
        ['completed', 'cancelled'].includes(row.status)
      )
        throw new ConflictException(
          'Action changed or is final. Refresh before trying again',
        );
      if (
        row.status !== input.status &&
        !repairTransitions[row.status].includes(input.status)
      )
        throw new ConflictException('Invalid repair transition');
      await this.assignee(tx, channelId, input.assigneeId);
      if (input.evidenceId) {
        const [proof] = await tx
          .select({ id: caseEvidence.id })
          .from(caseEvidence)
          .where(
            and(
              eq(caseEvidence.channelId, channelId),
              eq(caseEvidence.caseId, row.caseId),
              eq(caseEvidence.id, input.evidenceId),
              isNull(caseEvidence.removedAt),
              or(
                isNull(caseEvidence.fileState),
                eq(caseEvidence.fileState, 'ready'),
              ),
            ),
          );
        if (!proof)
          throw new NotFoundException(
            'Available evidence from this case is required',
          );
        if (input.status !== 'completed')
          throw new ConflictException(
            'Completion evidence is only attached when completing an action',
          );
      }
      const [updated] = await tx
        .update(repairActions)
        .set({
          status: input.status,
          assigneeId: input.assigneeId,
          evidenceId: input.evidenceId,
          completionNote: ['completed', 'cancelled'].includes(input.status)
            ? input.note
            : null,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(repairActions.id, row.id))
        .returning();
      await this.log(
        tx,
        channelId,
        actor,
        'repair',
        row.id,
        row.caseId,
        `repair_${input.status}`,
        input.note,
        input.assigneeId,
      );
      return this.repairProjection(updated);
    });
  }
  async createFlag(
    channelId: string,
    actor: CaseActor,
    input: z.infer<typeof createFlagSchema>,
  ) {
    return this.db.transaction(async (tx) => {
      await this.casesRepo.authorize(tx, channelId, actor.id, true);
      const hash = fingerprint({ actor: actor.id, ...input });
      const [existing] = await tx
        .select()
        .from(consistencyFlags)
        .where(
          and(
            eq(consistencyFlags.channelId, channelId),
            eq(consistencyFlags.requestId, input.requestId),
          ),
        );
      if (existing) {
        if (existing.inputFingerprint !== hash)
          throw new ConflictException('Request ID was already used');
        return this.flagProjection(existing);
      }
      const record = await this.casesRepo.find(tx, channelId, input.caseId);
      if (input.comparedCaseId === record.id)
        throw new ConflictException('Compare two different cases');
      const prior = input.comparedCaseId
        ? await this.casesRepo.find(tx, channelId, input.comparedCaseId)
        : null;
      const [row] = await tx
        .insert(consistencyFlags)
        .values({
          ...input,
          channelId,
          inputFingerprint: hash,
          caseVersion: record.version,
          comparedVersion: prior?.version ?? null,
          origin: 'human',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      await this.log(
        tx,
        channelId,
        actor,
        'flag',
        row.id,
        row.caseId,
        'flag_created',
        input.concern,
      );
      return this.flagProjection(row);
    });
  }
  async scan(channelId: string, actor: CaseActor) {
    return this.db.transaction(async (tx) => {
      await this.casesRepo.authorize(tx, channelId, actor.id, true);
      const prior = alias(cases, 'prior');
      const key = sql<string>`${cases.id}::text || ':' || ${cases.version} || ':' || ${prior.id}::text || ':' || ${prior.version}`;
      const pairs = await tx
        .select({
          caseId: cases.id,
          caseVersion: cases.version,
          comparedCaseId: prior.id,
          comparedVersion: prior.version,
          comparisonKey: key,
          ruleTitle: cases.ruleTitle,
          ruleVersion: cases.ruleVersion,
        })
        .from(cases)
        .innerJoin(
          prior,
          and(
            eq(prior.channelId, channelId),
            eq(prior.status, 'decided'),
            lt(prior.id, cases.id),
            eq(prior.ruleTitle, cases.ruleTitle),
            eq(prior.ruleVersion, cases.ruleVersion),
            eq(prior.ruleText, cases.ruleText),
            ne(prior.outcome, cases.outcome),
          ),
        )
        .where(
          and(
            eq(cases.channelId, channelId),
            eq(cases.status, 'decided'),
            sql`NOT EXISTS (SELECT 1 FROM ${consistencyFlags} WHERE ${consistencyFlags.channelId}=${channelId} AND ${consistencyFlags.comparisonKey}=${key})`,
          ),
        )
        .orderBy(desc(cases.decidedAt), asc(cases.id), asc(prior.id))
        .limit(21);
      for (const pair of pairs.slice(0, 20)) {
        const { ruleTitle, ruleVersion, ...refs } = pair;
        const concern = `Different recorded outcomes under ${ruleTitle} (version ${ruleVersion}). Compare severity, context and evidence before judging consistency; different outcomes can be justified.`;
        const [row] = await tx
          .insert(consistencyFlags)
          .values({
            ...refs,
            channelId,
            requestId: randomUUID(),
            inputFingerprint: fingerprint(refs),
            origin: 'documented_outcome_comparison',
            createdAt: new Date(),
            updatedAt: new Date(),
            concern,
          })
          .returning();
        await this.log(
          tx,
          channelId,
          actor,
          'flag',
          row.id,
          row.caseId,
          'flag_comparison_created',
          null,
        );
      }
      return { created: pairs.slice(0, 20).length, hasMore: pairs.length > 20 };
    });
  }
  async review(
    channelId: string,
    actor: CaseActor,
    id: string,
    input: z.infer<typeof reviewFlagSchema>,
  ) {
    return this.db.transaction(async (tx) => {
      await this.casesRepo.authorize(tx, channelId, actor.id, true);
      const row = await this.findFlag(tx, channelId, id);
      if (
        row.version !== input.expectedVersion ||
        !consistencyTransitions[row.status].includes(input.status)
      )
        throw new ConflictException(
          'Review changed or is final. Refresh before trying again',
        );
      const [updated] = await tx
        .update(consistencyFlags)
        .set({
          status: input.status,
          reviewNote: input.note,
          severityContext: input.severityContext,
          evidenceContext: input.evidenceContext,
          reviewedByTwitchUserId: actor.twitchUserId,
          reviewedAt: new Date(),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(consistencyFlags.id, id))
        .returning();
      await this.log(
        tx,
        channelId,
        actor,
        'flag',
        row.id,
        row.caseId,
        `flag_${input.status === 'open' ? 'annotated' : input.status}`,
        `${input.note}\nSeverity/context: ${input.severityContext}\nEvidence: ${input.evidenceContext}`,
      );
      return this.flagProjection(updated);
    });
  }
  async generate(channelId: string, actor: CaseActor, requestId: string) {
    return this.db.transaction(async (tx) => {
      const channel = await this.casesRepo.authorize(
        tx,
        channelId,
        actor.id,
        true,
      );
      const hash = fingerprint({ actor: actor.id, requestId });
      const [existing] = await tx
        .select()
        .from(handoffs)
        .where(
          and(
            eq(handoffs.channelId, channelId),
            eq(handoffs.requestId, requestId),
          ),
        );
      if (existing) {
        if (existing.inputFingerprint !== hash)
          throw new ConflictException('Request ID was already used');
        return { id: existing.id };
      }
      const [last] = await tx
        .select()
        .from(handoffs)
        .where(eq(handoffs.channelId, channelId))
        .orderBy(desc(handoffs.periodEnd))
        .limit(1);
      const end = new Date(),
        start = last?.periodEnd ?? new Date(end.getTime() - 86400000);
      const unresolved = await tx
        .select()
        .from(cases)
        .where(and(eq(cases.channelId, channelId), ne(cases.status, 'decided')))
        .orderBy(asc(cases.createdAt), asc(cases.id))
        .limit(101);
      const repairs = await tx
        .select()
        .from(repairActions)
        .where(
          and(
            eq(repairActions.channelId, channelId),
            or(
              eq(repairActions.status, 'pending'),
              eq(repairActions.status, 'in_progress'),
            ),
          ),
        )
        .orderBy(asc(repairActions.createdAt), asc(repairActions.id))
        .limit(101);
      const flags = await tx
        .select()
        .from(consistencyFlags)
        .where(
          and(
            eq(consistencyFlags.channelId, channelId),
            eq(consistencyFlags.status, 'open'),
          ),
        )
        .orderBy(asc(consistencyFlags.createdAt), asc(consistencyFlags.id))
        .limit(101);
      const recent = await tx
        .select(caseSummaryProjection)
        .from(cases)
        .where(
          and(
            eq(cases.channelId, channelId),
            eq(cases.status, 'decided'),
            gt(cases.decidedAt, start),
          ),
        )
        .orderBy(desc(cases.decidedAt), desc(cases.id))
        .limit(51);
      const contexts = await tx
        .select({
          caseId: cases.id,
          title: cases.ruleTitle,
          version: cases.ruleVersion,
        })
        .from(cases)
        .where(and(eq(cases.channelId, channelId), gt(cases.updatedAt, start)))
        .orderBy(desc(cases.updatedAt), desc(cases.id))
        .limit(51);
      const changes = await tx
        .select()
        .from(ruleChanges)
        .where(
          and(
            eq(ruleChanges.channelId, channelId),
            gt(ruleChanges.createdAt, start),
          ),
        )
        .orderBy(desc(ruleChanges.createdAt), desc(ruleChanges.id))
        .limit(51);
      const truncated =
        changes.length > 50 ||
        unresolved.length > 100 ||
        repairs.length > 100 ||
        flags.length > 100 ||
        recent.length > 50 ||
        contexts.length > 50;
      const [row] = await tx
        .insert(handoffs)
        .values({
          channelId,
          requestId,
          inputFingerprint: hash,
          periodStart: start,
          periodEnd: end,
          createdAt: end,
          createdByTwitchUserId: actor.twitchUserId,
          summary: `${Math.min(100, unresolved.length)} unresolved cases, ${Math.min(100, flags.length)} open consistency reviews and ${Math.min(100, repairs.length)} pending actions. ${Math.min(50, recent.length)} recent decisions.`,
          recentDecisions: recent.slice(0, 50).map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
          ruleContexts: contexts.slice(0, 50),
          ruleChanges: changes.slice(0, 50).map((r) => ({
            ...this.ruleProjection(r),
            createdAt: r.createdAt.toISOString(),
          })),
          truncated,
        })
        .returning();
      const tasks = [
        ...unresolved.slice(0, 100).map((r) => ({
          caseId: r.id,
          sourceType: 'case' as const,
          sourceId: r.id,
          sourceVersion: r.version,
          title: r.title,
          assigneeId: null,
        })),
        ...repairs.slice(0, 100).map((r) => ({
          caseId: r.caseId,
          sourceType: 'repair' as const,
          sourceId: r.id,
          sourceVersion: r.version,
          title: r.title,
          assigneeId: r.assigneeId,
        })),
        ...flags.slice(0, 100).map((r) => ({
          caseId: r.caseId,
          sourceType: 'flag' as const,
          sourceId: r.id,
          sourceVersion: r.version,
          title: 'Review consistency concern',
          assigneeId: null,
        })),
      ];
      if (tasks.length) {
        const previousRows = await tx
          .selectDistinctOn([handoffItems.sourceType, handoffItems.sourceId], {
            item: handoffItems,
          })
          .from(handoffItems)
          .innerJoin(
            handoffs,
            and(
              eq(handoffs.channelId, channelId),
              eq(handoffs.id, handoffItems.handoffId),
            ),
          )
          .where(
            and(
              eq(handoffItems.channelId, channelId),
              inArray(
                handoffItems.sourceId,
                tasks.map((t) => t.sourceId),
              ),
            ),
          )
          .orderBy(
            asc(handoffItems.sourceType),
            asc(handoffItems.sourceId),
            desc(handoffs.periodEnd),
            desc(handoffs.id),
          );
        const previousItems = new Map(
          previousRows.map(({ item }) => [
            `${item.sourceType}:${item.sourceId}`,
            item,
          ]),
        );
        const activeMembers = await tx
          .select({ id: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.channelId, channelId),
              eq(memberships.role, 'moderator'),
            ),
          );
        const eligibleAssignees = new Set([
          channel.ownerUserId,
          ...activeMembers.map((m) => m.id),
        ]);
        // A new shift starts pending. Carry responsibility and context, never imply acknowledgment by the next shift.
        await tx.insert(handoffItems).values(
          tasks.map((task) => {
            const previous = previousItems.get(
              `${task.sourceType}:${task.sourceId}`,
            );
            const sourceReassigned =
              task.sourceType === 'repair' &&
              previous?.sourceVersion !== task.sourceVersion;
            const assignee = sourceReassigned
              ? task.assigneeId
              : previous
                ? previous.assigneeId
                : task.assigneeId;
            return {
              ...task,
              assigneeId:
                assignee && eligibleAssignees.has(assignee) ? assignee : null,
              note: previous?.note ?? null,
              channelId,
              handoffId: row.id,
            };
          }),
        );
      }
      await this.log(
        tx,
        channelId,
        actor,
        'handoff',
        row.id,
        null,
        'handoff_generated',
        null,
      );
      return { id: row.id };
    });
  }
  async task(
    channelId: string,
    actor: CaseActor,
    handoffId: string,
    id: string,
    input: z.infer<typeof updateHandoffTaskSchema>,
  ) {
    return this.db.transaction(async (tx) => {
      await this.casesRepo.authorize(tx, channelId, actor.id, true);
      await this.findHandoff(tx, channelId, handoffId);
      const [row] = await tx
        .select()
        .from(handoffItems)
        .where(
          and(
            eq(handoffItems.channelId, channelId),
            eq(handoffItems.handoffId, handoffId),
            eq(handoffItems.id, id),
          ),
        );
      if (!row) throw new NotFoundException('Handoff task not found');
      if (
        row.version !== input.expectedVersion ||
        !handoffTaskTransitions[row.status].includes(input.status)
      )
        throw new ConflictException(
          'Task changed or transition is unavailable. Refresh before trying again',
        );
      await this.assignee(tx, channelId, input.assigneeId);
      const [updated] = await tx
        .update(handoffItems)
        .set({
          status: input.status,
          assigneeId: input.assigneeId,
          note: input.note,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(handoffItems.id, id))
        .returning();
      await this.log(
        tx,
        channelId,
        actor,
        'task',
        id,
        row.caseId,
        `task_${input.status}`,
        input.note,
        input.assigneeId,
      );
      return updated;
    });
  }
}
