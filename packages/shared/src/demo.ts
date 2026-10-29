import { z } from 'zod';
import {
  sessionResponseSchema,
  channelResponseSchema,
  membershipResponseSchema,
} from './management';
import { openLoopResponseSchema } from './open-loops';
import { candidateResponseSchema } from './ai';
import { caseDetailSchema } from './cases';
import { managedPublicationSchema } from './publications';
import { moderationDeskSchema } from './moderation';
import { overlaySettingsSchema } from './overlay';
export const demoModerationSchema = moderationDeskSchema.pick({
  repairs: true,
  flags: true,
  handoffs: true,
  activity: true,
  ruleChanges: true,
});
export const demoDatasetSchema = z.strictObject({
  version: z.literal(1),
  label: z.literal('Demo fixture'),
  session: sessionResponseSchema.extend({
    csrfToken: z.literal('preview-only'),
  }),
  channels: z.array(channelResponseSchema).min(1).max(5),
  people: z.array(membershipResponseSchema).max(20),
  loops: z
    .array(openLoopResponseSchema.extend({ origin: z.literal('demo_fixture') }))
    .max(100),
  candidates: z
    .array(
      candidateResponseSchema.extend({ origin: z.literal('demo_fixture') }),
    )
    .max(100),
  cases: z
    .array(caseDetailSchema.extend({ origin: z.literal('demo_fixture') }))
    .max(100),
  publications: z.array(managedPublicationSchema).max(100),
  moderation: demoModerationSchema,
  overlays: z.record(z.uuid(), overlaySettingsSchema),
});
export type DemoDataset = z.infer<typeof demoDatasetSchema>;
export * from './demo/people';
export * from './demo/open-loops';
export * from './demo/candidates';
export * from './demo/cases';
export * from './demo/publications';
