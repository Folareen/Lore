import { z } from 'zod';
import { publicationKindSchema } from './publications';
export const discoverQuerySchema = z.strictObject({
  q: z.string().trim().max(100).default(''),
  cursor: z.string().min(1).max(2000).optional(),
});
export const discoverChannelSchema = z.strictObject({
  slug: z.string(),
  displayName: z.string(),
  storyCount: z.number().int().positive(),
  latest: z.strictObject({
    id: z.uuid(),
    title: z.string(),
    excerpt: z.string().max(480),
    kind: publicationKindSchema,
    publishedAt: z.iso.datetime(),
  }),
});
export const discoverPageSchema = z.strictObject({
  items: z.array(discoverChannelSchema).max(12),
  nextCursor: z.string().nullable(),
});
export type DiscoverPage = z.infer<typeof discoverPageSchema>;
