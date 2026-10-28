import { z } from 'zod';
import { recordOriginSchema } from './workflow';

export const candidateKindSchema = z.enum([
  'commitment',
  'unanswered_question',
  'announcement',
]);
const draftShape = {
  task_type: candidateKindSchema,
  summary: z.string().min(1).max(500),
  source_record_ids: z.array(z.string().min(1).max(500)).length(1),
  source_quote: z.string().min(1).max(2000),
  evidence_gaps: z.array(z.string().min(1).max(200)).max(5),
  uncertainties: z.array(z.string().min(1).max(200)).max(5),
  suggested_next_step: z.string().min(1).max(300),
};
// Providers receive a portable schema; the stricter boundary below requires true.
export const candidateWireSchema = z.strictObject({
  ...draftShape,
  requires_human_approval: z.boolean(),
});
export const candidateDraftSchema = z.strictObject({
  ...draftShape,
  requires_human_approval: z.literal(true),
});
export const extractionOutputSchema = z.strictObject({
  suggestions: z.array(candidateDraftSchema).max(10),
});
export const extractionWireSchema = z.strictObject({
  suggestions: z.array(candidateWireSchema).max(10),
});
export const candidateStatusSchema = z.enum([
  'pending',
  'confirmed',
  'dismissed',
  'expired',
]);
export const aiErrorSchema = z.enum([
  'provider_unavailable',
  'invalid_output',
  'source_unavailable',
  'daily_limit',
  'disabled',
]);
export const aiJobSchema = z.strictObject({
  runId: z.uuid(),
  revision: z.number().int().nonnegative(),
});
export const candidateResponseSchema = z.strictObject({
  id: z.uuid(),
  channelId: z.uuid(),
  status: candidateStatusSchema,
  version: z.number().int().positive(),
  draft: candidateDraftSchema.nullable(),
  origin: recordOriginSchema,
  source: z.strictObject({
    id: z.string(),
    text: z.string().nullable(),
    available: z.boolean(),
  }),
  provider: z.literal('gemini'),
  model: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  reviewedByTwitchUserId: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  reviewReason: z.string().nullable(),
  confirmedOpenLoopId: z.uuid().nullable(),
});
export const candidatePageSchema = z.strictObject({
  items: z.array(candidateResponseSchema),
  nextCursor: z.uuid().nullable(),
});
export const reviewCandidateSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  requestId: z.uuid(),
  wording: z.string().trim().min(1).max(2000),
  ownerLabel: z.string().trim().min(1).max(100).optional(),
  dueContext: z.string().trim().min(1).max(200).optional(),
});
export const dismissCandidateSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
});
export const extractionRunSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']),
  attempts: z.number().int(),
  error: aiErrorSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export const aiStatusSchema = z.strictObject({
  configured: z.boolean(),
  enabled: z.boolean(),
  provider: z.literal('gemini'),
  model: z.string(),
  dailyUsed: z.number().int().nonnegative(),
  dailyLimit: z.number().int().positive(),
  recentRuns: z.array(extractionRunSchema),
});
export type CandidateDraft = z.infer<typeof candidateDraftSchema>;
export type Candidate = z.infer<typeof candidateResponseSchema>;
export type CandidatePage = z.infer<typeof candidatePageSchema>;
export type ReviewCandidate = z.infer<typeof reviewCandidateSchema>;
export type AiStatus = z.infer<typeof aiStatusSchema>;
export type AiError = z.infer<typeof aiErrorSchema>;
export type ExtractionRun = z.infer<typeof extractionRunSchema>;
export const candidateKindLabels = {
  commitment: 'Possible commitment',
  unanswered_question: 'Unanswered question',
  announcement: 'Pending announcement',
} as const;
