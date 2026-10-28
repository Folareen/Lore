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
    GEMINI_MODEL: z
      .string()
      .regex(/^[a-zA-Z0-9._-]+$/)
      .default('gemini-3.8-flash'),
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
        new URL(value.TWITCH_TEST_BASE_URL).hostname !== '127.0.0.1')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Twitch test override is restricted to loopback in test mode',
      });
    }
  })
  .parse(process.env);
