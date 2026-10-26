import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
config({ path: resolve(__dirname, '../../../.env'), quiet: true });
const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
export const env = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    DATABASE_URL: z.url(),
    REDIS_URL: z
      .url()
      .refine(
        (url) => ['redis:', 'rediss:'].includes(new URL(url).protocol),
        'Expected a Redis URL',
      ),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    APP_ORIGIN: z
      .url()
      .default('http://localhost:3000')
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) && url.origin === value
        );
      }, 'APP_ORIGIN must be an HTTP(S) origin with no path or trailing slash'),
    TWITCH_CLIENT_ID: optionalSecret,
    TWITCH_CLIENT_SECRET: optionalSecret,
    AUTH_ENCRYPTION_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z0-9+/]{43}=$/, 'Use a base64-encoded 32-byte key')
        .optional(),
    ),
    TWITCH_TEST_BASE_URL: z.url().optional(),
  })
  .superRefine((value, ctx) => {
    const configured = [
      value.TWITCH_CLIENT_ID,
      value.TWITCH_CLIENT_SECRET,
      value.AUTH_ENCRYPTION_KEY,
    ];
    if (configured.some(Boolean) && !configured.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Configure TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and AUTH_ENCRYPTION_KEY together',
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      (!configured.every(Boolean) || !value.APP_ORIGIN.startsWith('https://'))
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Production requires Twitch credentials, encryption key, and an HTTPS APP_ORIGIN',
      });
    }
    if (
      value.TWITCH_TEST_BASE_URL &&
      (value.NODE_ENV !== 'test' ||
        new URL(value.TWITCH_TEST_BASE_URL).hostname !== '127.0.0.1')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Twitch test override is restricted to loopback in test mode',
      });
    }
  })
  .parse(process.env);
