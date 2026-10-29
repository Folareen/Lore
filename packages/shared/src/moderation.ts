import { z } from 'zod';
import { caseSummarySchema } from './cases';

export const repairStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);
export type RepairStatus = z.infer<typeof repairStatusSchema>;
export const repairTransitions: Record<RepairStatus, readonly RepairStatus[]> =
  {
    pending: ['in_progress', 'completed', 'cancelled'],
    in_progress: ['pending', 'completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };
export const flagStatusSchema = z.enum(['open', 'confirmed', 'dismissed']);
export const handoffTaskStatusSchema = z.enum([
  'pending',
  'acknowledged',
  'resolved',
]);
export const handoffTaskTransitions: Record<
  z.infer<typeof handoffTaskStatusSchema>,
  readonly z.infer<typeof handoffTaskStatusSchema>[]
> = {
  pending: ['pending', 'acknowledged', 'resolved'],
  acknowledged: ['acknowledged', 'resolved'],
  resolved: [],
};
export const consistencyTransitions: Record<
  z.infer<typeof flagStatusSchema>,
  readonly z.infer<typeof flagStatusSchema>[]
> = { open: ['open', 'confirmed', 'dismissed'], confirmed: [], dismissed: [] };
const requestId = z.uuid();
const expectedVersion = z.number().int().positive();
const note = z.string().trim().min(1).max(2000);
const assigneeId = z.uuid().nullable();
export const createRepairSchema = z.strictObject({
  requestId,
  caseId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['follow_up', 'repair', 're_entry']),
  agreement: note,
  assigneeId,
  dueAt: z.iso.datetime().nullable(),
});
export const updateRepairSchema = z.strictObject({
  expectedVersion,
  status: repairStatusSchema,
  assigneeId,
  note,
  evidenceId: z.uuid().nullable(),
});
export const createFlagSchema = z.strictObject({
  requestId,
  caseId: z.uuid(),
  comparedCaseId: z.uuid().nullable(),
  concern: note,
});
export const reviewFlagSchema = z.strictObject({
  expectedVersion,
  status: flagStatusSchema,
  note,
  severityContext: z.string().trim().max(1000),
  evidenceContext: z.string().trim().max(1000),
});
export const generateHandoffSchema = z.strictObject({ requestId });
export const recordRuleChangeSchema = z.strictObject({
  requestId,
  title: z.string().trim().min(1).max(150),
  previousVersion: z.string().trim().min(1).max(100),
  version: z.string().trim().min(1).max(100),
  ruleText: z.string().trim().min(1).max(2000),
  changeSummary: note,
});
export const ruleChangeSchema = recordRuleChangeSchema
  .omit({ requestId: true })
  .extend({
    id: z.uuid(),
    channelId: z.uuid(),
    actorTwitchUserId: z.string(),
    createdAt: z.iso.datetime(),
  });
export const updateHandoffTaskSchema = z.strictObject({
  expectedVersion,
  status: handoffTaskStatusSchema,
  assigneeId,
  note,
});
export const moderationActivitySchema = z.strictObject({
  id: z.uuid(),
  targetType: z.enum(['repair', 'flag', 'handoff', 'task', 'rule']),
  targetId: z.uuid(),
  caseId: z.uuid().nullable(),
  action: z.string(),
  actorTwitchUserId: z.string(),
  note: z.string().nullable(),
  assigneeId: z.uuid().nullable(),
  occurredAt: z.iso.datetime(),
});
export const repairActionSchema = createRepairSchema
  .omit({ requestId: true })
  .extend({
    id: z.uuid(),
    channelId: z.uuid(),
    version: expectedVersion,
    status: repairStatusSchema,
    completionNote: z.string().nullable(),
    evidenceId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });
export const consistencyFlagSchema = z.strictObject({
  id: z.uuid(),
  channelId: z.uuid(),
  caseId: z.uuid(),
  comparedCaseId: z.uuid().nullable(),
  caseVersion: expectedVersion,
  comparedVersion: expectedVersion.nullable(),
  version: expectedVersion,
  status: flagStatusSchema,
  origin: z.enum(['human', 'documented_outcome_comparison']),
  concern: z.string(),
  reviewNote: z.string().nullable(),
  severityContext: z.string(),
  evidenceContext: z.string(),
  reviewedByTwitchUserId: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const handoffItemSchema = z.strictObject({
  id: z.uuid(),
  channelId: z.uuid(),
  handoffId: z.uuid(),
  caseId: z.uuid(),
  sourceType: z.enum(['case', 'repair', 'flag']),
  sourceId: z.uuid(),
  sourceVersion: expectedVersion,
  title: z.string(),
  assigneeId,
  status: handoffTaskStatusSchema,
  version: expectedVersion,
  note: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export const handoffSchema = z.strictObject({
  id: z.uuid(),
  channelId: z.uuid(),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  summary: z.string(),
  createdByTwitchUserId: z.string(),
  createdAt: z.iso.datetime(),
  recentDecisions: z.array(caseSummarySchema),
  ruleContexts: z.array(
    z.strictObject({
      caseId: z.uuid(),
      title: z.string(),
      version: z.string(),
    }),
  ),
  ruleChanges: z.array(ruleChangeSchema),
  truncated: z.boolean(),
  items: z.array(handoffItemSchema),
});
export const moderationDeskSchema = z.strictObject({
  assignees: z.array(
    z.strictObject({
      id: z.uuid(),
      displayName: z.string(),
      twitchUserId: z.string(),
    }),
  ),
  repairs: z.array(repairActionSchema),
  flags: z.array(consistencyFlagSchema),
  handoffs: z.array(handoffSchema),
  activity: z.array(moderationActivitySchema),
  nextCursors: z.strictObject({
    repairs: z.uuid().nullable(),
    flags: z.uuid().nullable(),
    handoffs: z.uuid().nullable(),
    ruleChanges: z.uuid().nullable(),
    activity: z.uuid().nullable(),
  }),
  activityTruncated: z.boolean(),
  ruleChanges: z.array(ruleChangeSchema),
  ruleChangesTruncated: z.boolean(),
});
export type RepairAction = z.infer<typeof repairActionSchema>;
export type ConsistencyFlag = z.infer<typeof consistencyFlagSchema>;
export type Handoff = z.infer<typeof handoffSchema>;
export type HandoffItem = z.infer<typeof handoffItemSchema>;
export type ModerationDesk = z.infer<typeof moderationDeskSchema>;
