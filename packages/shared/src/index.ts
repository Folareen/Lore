import { z } from 'zod';
export * from './workflow';
export const queueNames = {
  ingestion: 'lore-ingestion',
  ai: 'lore-ai',
  caseAi: 'lore-case-ai',
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
