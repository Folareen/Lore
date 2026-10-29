import { z } from 'zod';
import { recordOriginSchema } from './workflow';
export const caseStatusSchema = z.enum(['open', 'reviewing', 'decided']);
export type CaseStatus = z.infer<typeof caseStatusSchema>;
export const caseTransitions: Record<CaseStatus, readonly CaseStatus[]> = {
  open: ['reviewing', 'decided'],
  reviewing: ['decided'],
  decided: [],
};
export const caseOutcomeSchema = z.enum([
  'uphold',
  'overturn',
  'modify',
  'no_action',
]);
const fields = {
  title: z.string().trim().min(1).max(200),
  subjectReference: z.string().trim().min(1).max(150),
  incident: z.string().trim().min(1).max(4000),
  appeal: z.string().trim().max(4000),
  incidentAt: z.iso.datetime().nullable(),
  ruleTitle: z.string().trim().min(1).max(150),
  ruleVersion: z.string().trim().min(1).max(100),
  ruleText: z.string().trim().min(1).max(2000),
};
export const createCaseSchema = z.strictObject({
  ...fields,
  requestId: z.uuid(),
});
export const updateCaseSchema = z.strictObject({
  ...fields,
  expectedVersion: z.number().int().positive(),
  status: z.enum(['open', 'reviewing']),
});
export const decideCaseSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  requestId: z.uuid(),
  outcome: caseOutcomeSchema,
  rationale: z.string().trim().min(1).max(3000),
  followUp: z.string().trim().max(1000),
  aiRunId: z.uuid().nullable().default(null),
  aiDisposition: z
    .enum(['accepted', 'modified', 'rejected'])
    .nullable()
    .default(null),
});
export const addCaseEvidenceSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  requestId: z.uuid(),
  label: z.string().trim().min(1).max(150),
  excerpt: z.string().trim().min(1).max(4000),
  sourceEventId: z.string().min(1).max(500).optional(),
  occurredAt: z.iso.datetime().nullable(),
});
export const removeCaseEvidenceSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
});
export const caseSummarySchema = z.strictObject({
  id: z.uuid(),
  channelId: z.uuid(),
  title: fields.title,
  subjectReference: fields.subjectReference,
  status: caseStatusSchema,
  version: z.number().int().positive(),
  origin: recordOriginSchema,
  ruleTitle: fields.ruleTitle,
  ruleVersion: fields.ruleVersion,
  outcome: caseOutcomeSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const caseEvidenceSchema = z.strictObject({
  id: z.uuid(),
  label: z.string(),
  excerpt: z.string().nullable(),
  origin: recordOriginSchema,
  sourceEventId: z.string().nullable(),
  originalAvailable: z.boolean().nullable(),
  occurredAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  removed: z.boolean(),
  file: z
    .strictObject({
      name: z.string(),
      contentType: z.string(),
      size: z.number().int(),
      available: z.boolean(),
    })
    .nullable(),
});
export const caseHistorySchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().positive(),
  action: z.enum([
    'created',
    'updated',
    'evidence_added',
    'evidence_removed',
    'decided',
  ]),
  actorTwitchUserId: z.string(),
  reason: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});
export const caseDetailSchema = caseSummarySchema.extend({
  incident: fields.incident,
  appeal: fields.appeal,
  incidentAt: fields.incidentAt,
  ruleText: fields.ruleText,
  rationale: z.string().nullable(),
  followUp: z.string().nullable(),
  decidedByTwitchUserId: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  aiRunId: z.uuid().nullable(),
  aiDisposition: z.enum(['accepted', 'modified', 'rejected']).nullable(),
  evidence: z.array(caseEvidenceSchema),
  history: z.array(caseHistorySchema),
});
export const casePageSchema = z.strictObject({
  items: z.array(caseSummarySchema),
  nextCursor: z.uuid().nullable(),
});
export const caseRecommendationSchema = z.strictObject({
  task_type: z.literal('case_review'),
  proposed_action: caseOutcomeSchema,
  summary: z.string().min(1).max(1500),
  source_record_ids: z.array(z.uuid()).min(1).max(6),
  comparisons: z
    .array(
      z.strictObject({
        case_id: z.uuid(),
        similarities: z.string().min(1).max(700),
        differences: z.string().min(1).max(700),
      }),
    )
    .max(5),
  evidence_gaps: z.array(z.string().min(1).max(300)).max(8),
  uncertainties: z.array(z.string().min(1).max(300)).max(8),
  requires_human_approval: z.literal(true),
  suggested_next_step: z.string().min(1).max(500),
});
export const caseAiRunSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']),
  error: z
    .enum([
      'provider_unavailable',
      'invalid_output',
      'daily_limit',
      'source_unavailable',
      'disabled',
    ])
    .nullable(),
  caseVersion: z.number().int(),
  createdAt: z.iso.datetime(),
  indexedCount: z.number().int(),
  eligibleCount: z.number().int(),
  stale: z.boolean(),
  matches: z.array(
    z.strictObject({
      case: caseSummarySchema,
      rationale: z.string(),
      followUp: z.string(),
      incident: z.string(),
      ruleText: z.string(),
      similarity: z.number().min(-1).max(1),
    }),
  ),
  recommendation: caseRecommendationSchema.nullable(),
});
export const caseAiSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  embeddingsConfigured: z.boolean(),
  reasoningConfigured: z.boolean(),
  storageConfigured: z.boolean(),
  embeddingModel: z.string(),
  reasoningModel: z.string(),
  dailyUsed: z.number().int(),
  dailyLimit: z.number().int(),
});
export const caseAiJobSchema = z.strictObject({
  runId: z.uuid(),
  revision: z.number().int().nonnegative(),
});
export type CreateCase = z.infer<typeof createCaseSchema>;
export type UpdateCase = z.infer<typeof updateCaseSchema>;
export type DecideCase = z.infer<typeof decideCaseSchema>;
export type AddCaseEvidence = z.infer<typeof addCaseEvidenceSchema>;
export type CaseSummary = z.infer<typeof caseSummarySchema>;
export type CaseDetail = z.infer<typeof caseDetailSchema>;
export type CaseEvidence = z.infer<typeof caseEvidenceSchema>;
export type CaseRecommendation = z.infer<typeof caseRecommendationSchema>;
export type CaseAiRun = z.infer<typeof caseAiRunSchema>;
export const caseOutcomeLabels = {
  uphold: 'Uphold',
  overturn: 'Overturn',
  modify: 'Modify',
  no_action: 'No action',
} as const;

export const caseEmbeddingModel = 'gemini-embedding-2';
export const caseEmbeddingDimensions = 768;
