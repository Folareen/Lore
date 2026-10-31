import { z } from 'zod';
export * from './workflow';
export const queueNames = {
  ingestion: 'lore-ingestion',
  ai: 'lore-ai',
  caseAi: 'lore-case-ai',
  catchup: 'lore-catchup',
} as const;
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  dependencies: z.object({
    postgres: z.enum(['up', 'down']),
    redis: z.enum(['up', 'down']),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from './management';
export * from './ingestion';
export * from './open-loops';
export * from './ai';
export * from './cases';
export * from './moderation';
export * from './publications';

export * from './overlay';

export * from './demo';
export * from './demo/seed';

export * from './promise-command';
export * from './continuity';
