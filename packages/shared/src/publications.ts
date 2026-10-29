import { z } from 'zod';
export const publicationKindSchema = z.enum([
  'milestone',
  'reference',
  'story',
  'commitment',
  'summary',
]);
export const publicationStatusSchema = z.enum([
  'draft',
  'published',
  'unpublished',
  'deleted',
]);
export const publicationTransitions: Record<
  z.infer<typeof publicationStatusSchema>,
  readonly ('publish' | 'unpublish' | 'delete')[]
> = {
  draft: ['publish', 'delete'],
  published: ['unpublish', 'delete'],
  unpublished: ['publish', 'delete'],
  deleted: [],
};
export const publicationFieldsSchema = z
  .strictObject({
    kind: publicationKindSchema,
    title: z.string().trim().min(1).max(180),
    body: z.string().trim().min(1).max(6000),
    chatSummary: z.string().trim().max(360),
    sourceIds: z
      .array(z.uuid())
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length),
    promiseId: z.uuid().nullable(),
  })
  .refine((v) => v.kind !== 'summary' || v.chatSummary.length > 0, {
    message: 'Catch-up summaries need an approved short chat version',
    path: ['chatSummary'],
  });
export const createPublicationSchema = z
  .strictObject({ ...publicationFieldsSchema.shape, requestId: z.uuid() })
  .refine((v) => v.kind !== 'summary' || v.chatSummary.length > 0);
export const editPublicationSchema = z
  .strictObject({
    ...publicationFieldsSchema.shape,
    expectedVersion: z.number().int().positive(),
  })
  .refine((v) => v.kind !== 'summary' || v.chatSummary.length > 0);
export const publicationActionSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  action: z.enum(['publish', 'unpublish', 'delete']),
  reason: z.string().trim().min(1).max(1000),
});
export const publicationHistorySchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int(),
  action: z.string(),
  actorTwitchUserId: z.string(),
  reason: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});
export const managedPublicationSchema = z.strictObject({
  ...publicationFieldsSchema.shape,
  title: z.string(),
  body: z.string(),
  id: z.uuid(),
  channelId: z.uuid(),
  version: z.number().int().positive(),
  status: publicationStatusSchema,
  approvedByTwitchUserId: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const publicationPageSchema = z.strictObject({
  items: z.array(managedPublicationSchema),
  nextCursor: z.uuid().nullable(),
});
export const publicEntrySchema = z.strictObject({
  id: z.uuid(),
  kind: publicationKindSchema,
  title: z.string(),
  body: z.string(),
  chatSummary: z.string(),
  publishedAt: z.iso.datetime(),
  sources: z.array(z.strictObject({ id: z.uuid(), title: z.string() })),
});
export const publicFeedSchema = z.strictObject({
  channel: z.strictObject({ slug: z.string(), displayName: z.string() }),
  items: z.array(publicEntrySchema),
  nextCursor: z.uuid().nullable(),
});
export const publicCatchupSchema = z.strictObject({
  channel: z.strictObject({ slug: z.string(), displayName: z.string() }),
  summary: publicEntrySchema.nullable(),
  recent: z.array(publicEntrySchema),
});
export const catchupScopes = [
  'user:read:chat',
  'user:bot',
  'channel:bot',
  'user:write:chat',
] as const;
export const catchupSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  captureEnabled: z.boolean(),
  configured: z.boolean(),
  missingScopes: z.array(z.string()),
  recent: z.array(
    z.strictObject({
      id: z.uuid(),
      status: z.enum([
        'queued',
        'attempted',
        'sent',
        'dropped',
        'failed',
        'cancelled',
        'uncertain',
      ]),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export const catchupJobSchema = z.strictObject({ replyId: z.uuid() });
export type PublicationFields = z.infer<typeof publicationFieldsSchema>;
export type ManagedPublication = z.infer<typeof managedPublicationSchema>;
export type PublicEntry = z.infer<typeof publicEntrySchema>;
export type PublicFeed = z.infer<typeof publicFeedSchema>;
export type PublicCatchup = z.infer<typeof publicCatchupSchema>;
