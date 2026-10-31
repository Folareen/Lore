import { z } from 'zod';
import { briefContextSchema } from './continuity';
import { openLoopStatusSchema, recordOriginSchema } from './workflow';

export const createOpenLoopSchema = z.strictObject({
  wording: z.string().trim().min(1).max(2000),
  ownerLabel: z.string().trim().min(1).max(100).optional(),
  dueContext: z.string().trim().min(1).max(200).optional(),
  requestId: z.uuid(),
});
export const transitionOpenLoopSchema = z
  .strictObject({
    status: openLoopStatusSchema,
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (['fulfilled', 'cancelled'].includes(value.status) && !value.reason)
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Explain the completion or cancellation',
      });
  });
export const openLoopResponseSchema = z.strictObject({
  id: z.uuid(),
  channelId: z.uuid(),
  wording: z.string(),
  ownerLabel: z.string().nullable(),
  dueContext: z.string().nullable(),
  status: openLoopStatusSchema,
  version: z.number().int().positive(),
  origin: recordOriginSchema,
  captureMethod: z.enum(['dashboard', 'chat_command', 'ai_review']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  source: z.strictObject({
    excerpt: z.string(),
    originalAvailable: z.boolean().nullable(),
  }),
});
export const openLoopHistorySchema = z.strictObject({
  version: z.number().int(),
  fromStatus: openLoopStatusSchema.nullable(),
  toStatus: openLoopStatusSchema,
  reason: z.string().nullable(),
  actorTwitchUserId: z.string(),
  occurredAt: z.iso.datetime(),
});
export const openLoopPageSchema = z.strictObject({
  items: z.array(openLoopResponseSchema),
  nextCursor: z.uuid().nullable(),
});
export const streamBriefSchema = z.strictObject({
  channelId: z.uuid(),
  generatedAt: z.iso.datetime(),
  activeCount: z.number().int().nonnegative(),
  items: z.array(openLoopResponseSchema),
  method: z.literal('saved_open_loops'),
  context: briefContextSchema.optional(),
});
export const openLoopLabels = {
  candidate: 'Needs review',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  fulfilled: 'Fulfilled',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
} as const;
export type CreateOpenLoop = z.infer<typeof createOpenLoopSchema>;
export type TransitionOpenLoop = z.infer<typeof transitionOpenLoopSchema>;
export type OpenLoop = z.infer<typeof openLoopResponseSchema>;
export type OpenLoopHistory = z.infer<typeof openLoopHistorySchema>;
export type StreamBrief = z.infer<typeof streamBriefSchema>;
export type OpenLoopPage = z.infer<typeof openLoopPageSchema>;
