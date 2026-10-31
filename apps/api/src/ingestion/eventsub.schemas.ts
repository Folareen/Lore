import { z } from 'zod';
import { twitchEventTypeSchema } from '@lore/shared';
const id = z.string().min(1).max(500);
const userId = z.string().regex(/^\d+$/).max(30);
export const messageTypeSchema = z.enum([
  'notification',
  'webhook_callback_verification',
  'revocation',
]);
export const subscriptionSchema = z.object({
  id,
  type: twitchEventTypeSchema,
  version: z.literal('1'),
  status: z.string().min(1).max(100),
  condition: z.object({
    broadcaster_user_id: userId,
    user_id: userId.optional(),
    moderator_user_id: userId.optional(),
  }),
  transport: z.object({ method: z.literal('webhook'), callback: z.url() }),
});
export const envelopeSchema = z.object({
  subscription: subscriptionSchema,
  challenge: z.string().min(1).max(4096).optional(),
  event: z.unknown().optional(),
});
const broadcaster = z.object({ broadcaster_user_id: userId });
export const chatSchema = broadcaster.extend({
  chatter_user_id: userId,
  message_id: id,
  message: z.object({ text: z.string().max(10000) }),
  badges: z
    .array(
      z.object({
        set_id: z.string().max(100),
        id: z.string().max(100),
        info: z.string().max(100),
      }),
    )
    .max(100),
  source_broadcaster_user_id: userId.nullish(),
});
export const eventSchemas = {
  'channel.chat.message': chatSchema,
  'channel.chat.message_delete': broadcaster.extend({
    message_id: id,
    target_user_id: userId,
  }),
  'channel.chat.clear': broadcaster,
  'channel.chat.clear_user_messages': broadcaster.extend({
    target_user_id: userId,
  }),
  'stream.online': broadcaster.extend({
    id,
    type: z.enum(['live', 'playlist', 'watch_party', 'premiere', 'rerun']),
    started_at: z.iso.datetime({ offset: true }),
  }),
  'stream.offline': broadcaster,
  'channel.ban': broadcaster.extend({
    user_id: userId,
    user_login: z.string().max(100),
    moderator_user_id: userId,
    reason: z.string().max(4000),
    banned_at: z.iso.datetime({ offset: true }),
    ends_at: z.string().nullable(),
    is_permanent: z.boolean(),
  }),
  'channel.unban_request.create': broadcaster.extend({
    id,
    user_id: userId,
    user_login: z.string().max(100),
    text: z.string().max(4000),
    created_at: z.iso.datetime({ offset: true }),
  }),
  'channel.unban_request.resolve': broadcaster.extend({
    id,
    user_id: userId,
    user_login: z.string().max(100),
    moderator_user_id: userId.nullish(),
    moderator_id: userId.nullish(),
    resolution_text: z
      .string()
      .max(4000)
      .nullish()
      .transform((value) => value ?? ''),
    status: z.enum(['approved', 'denied', 'canceled']),
  }),
} as const;
