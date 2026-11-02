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
    DATABASE_URL: z
      .url()
      .refine(
        (url) => ['postgres:', 'postgresql:'].includes(new URL(url).protocol),
        'Expected a PostgreSQL URL',
      ),
    REDIS_URL: z
      .url()
      .refine(
        (url) => ['redis:', 'rediss:'].includes(new URL(url).protocol),
        'Expected a Redis URL',
      ),
    QUEUE_JOB_HISTORY_LIMIT: z.coerce
      .number()
      .int()
      .min(20)
      .max(10000)
      .default(1000),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
    QUEUE_PREFIX: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default('lore'),
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
    TWITCH_EVENTSUB_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .min(10)
        .max(100)
        .regex(/^[\x21-\x7e]+$/)
        .optional(),
    ),
    TWITCH_EVENTSUB_CALLBACK_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .url()
        .refine((value) => {
          const url = new URL(value);
          return (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            (!url.port || url.port === '443') &&
            url.pathname === '/api/webhooks/twitch'
          );
        }, 'Use a public HTTPS URL on port 443 ending in /api/webhooks/twitch')
        .optional(),
    ),
    AUTH_ENCRYPTION_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z0-9+/]{43}=$/, 'Use a base64-encoded 32-byte key')
        .optional(),
    ),
    TWITCH_TEST_BASE_URL: z.url().optional(),
    GEMINI_API_KEY: optionalSecret,
    R2_ACCOUNT_ID: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .optional(),
    ),
    R2_BUCKET: optionalSecret,
    R2_ACCESS_KEY_ID: optionalSecret,
    R2_SECRET_ACCESS_KEY: optionalSecret,
    R2_TEST_ENDPOINT: z.url().optional(),
    GEMINI_MODEL: z
      .string()
      .regex(/^[a-zA-Z0-9._-]+$/)
      .default('gemini-3.8-flash'),
    GEMINI_COMMUNITY_MODEL: z
      .string()
      .regex(/^[a-zA-Z0-9._-]+$/)
      .default('gemini-3.5-flash-lite'),
    COMMUNITY_AI_DAILY_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100),
    COMMUNITY_AI_GLOBAL_DAILY_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .default(500),
    AI_DAILY_CALL_LIMIT: z.coerce.number().int().min(1).max(500).default(50),
    AI_TEST_BASE_URL: z.url().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.AI_TEST_BASE_URL &&
      (value.NODE_ENV !== 'test' ||
        new URL(value.AI_TEST_BASE_URL).hostname !== '127.0.0.1' ||
        new URL(value.AI_TEST_BASE_URL).protocol !== 'http:')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'AI test override is restricted to HTTP loopback in test mode',
      });
    }
    if (
      value.R2_TEST_ENDPOINT &&
      (value.NODE_ENV !== 'test' ||
        new URL(value.R2_TEST_ENDPOINT).hostname !== '127.0.0.1' ||
        new URL(value.R2_TEST_ENDPOINT).protocol !== 'http:')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Test endpoints require HTTP loopback in test mode',
      });
    const r2 = [
      value.R2_ACCOUNT_ID,
      value.R2_BUCKET,
      value.R2_ACCESS_KEY_ID,
      value.R2_SECRET_ACCESS_KEY,
    ];
    if (r2.some(Boolean) && !r2.every(Boolean))
      ctx.addIssue({
        code: 'custom',
        message: 'Configure all four R2 variables together',
      });
    const configured = [
      value.TWITCH_CLIENT_ID,
      value.TWITCH_CLIENT_SECRET,
      value.AUTH_ENCRYPTION_KEY,
    ];
    if (
      Boolean(value.TWITCH_EVENTSUB_SECRET) !==
        Boolean(value.TWITCH_EVENTSUB_CALLBACK_URL) ||
      (value.TWITCH_EVENTSUB_SECRET && !configured.every(Boolean))
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'EventSub requires both its secret and callback URL, plus all Twitch auth credentials',
      });
    }
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
        new URL(value.TWITCH_TEST_BASE_URL).hostname !== '127.0.0.1' ||
        new URL(value.TWITCH_TEST_BASE_URL).protocol !== 'http:')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Twitch test override is restricted to loopback in test mode',
      });
    }
  })
  .parse(process.env);
