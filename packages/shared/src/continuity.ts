import { z } from 'zod';
import { candidateDraftSchema } from './ai';
import { openLoopStatusSchema } from './workflow';

export const moderationReadScopes = [
  'channel:moderate',
  'moderator:read:unban_requests',
] as const;
export const moderationEventTypes = [
  'channel.ban',
  'channel.unban_request.create',
  'channel.unban_request.resolve',
] as const;
export const continuitySettingsSchema = z.strictObject({
  moderationImportsEnabled: z.boolean(),
  promiseConfirmationsEnabled: z.boolean(),
  publicSummaryAiEnabled: z.boolean(),
  microphoneEnabled: z.boolean(),
  missingModerationScopes: z.array(z.string()),
  chatReady: z.boolean(),
  aiConfigured: z.boolean(),
});
export const continuitySettingSchema = z.strictObject({
  feature: z.enum([
    'moderationImportsEnabled',
    'promiseConfirmationsEnabled',
    'publicSummaryAiEnabled',
    'microphoneEnabled',
  ]),
  enabled: z.boolean(),
});
export const summaryDraftRequestSchema = z.strictObject({
  sourceIds: z
    .array(z.uuid())
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const summaryDraftSchema = z.strictObject({
  title: z.string().min(1).max(180),
  body: z.string().min(1).max(6000),
  chatSummary: z.string().min(1).max(360),
  sourceIds: z.array(z.uuid()).min(1).max(10),
});
export const microphoneCaptureSchema = z.strictObject({
  id: z.uuid(),
  transcript: z.string().nullable(),
  drafts: z.array(candidateDraftSchema).nullable(),
  decisions: z.record(
    z.string(),
    z.strictObject({
      status: z.enum(['confirmed', 'dismissed']),
      openLoopId: z.uuid().nullable(),
    }),
  ),
  expiresAt: z.iso.datetime(),
  model: z.string(),
});
export const microphoneReviewSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('confirm'),
    wording: z.string().trim().min(1).max(2000),
  }),
  z.strictObject({
    action: z.literal('dismiss'),
    reason: z.string().trim().min(1).max(1000),
  }),
]);
export const briefContextSchema = z.strictObject({
  since: z.iso.datetime(),
  basis: z.enum(['previous_stream_end', 'recent_seven_days']),
  recentChanges: z.array(
    z.strictObject({
      id: z.uuid(),
      wording: z.string(),
      status: openLoopStatusSchema,
      updatedAt: z.iso.datetime(),
    }),
  ),
  community: z.array(
    z.strictObject({
      id: z.uuid(),
      title: z.string(),
      body: z.string(),
      publishedAt: z.iso.datetime(),
    }),
  ),
  truncated: z.boolean(),
});
export type ContinuitySettings = z.infer<typeof continuitySettingsSchema>;
export type MicrophoneCapture = z.infer<typeof microphoneCaptureSchema>;
