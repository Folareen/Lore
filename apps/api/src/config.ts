import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
config({ path: resolve(__dirname, '../../../.env'), quiet: true });
export const env = z
  .object({
    DATABASE_URL: z.url(),
    REDIS_URL: z
      .url()
      .refine(
        (url) => ['redis:', 'rediss:'].includes(new URL(url).protocol),
        'Expected a Redis URL',
      ),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  })
  .parse(process.env);
