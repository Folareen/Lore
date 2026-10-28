import { z } from 'zod';

export const twitchEventTypes = [
  'channel.chat.message',
  'channel.chat.message_delete',
  'channel.chat.clear',
  'channel.chat.clear_user_messages',
  'stream.online',
  'stream.offline',
] as const;
export const twitchEventTypeSchema = z.enum(twitchEventTypes);
export type TwitchEventType = z.infer<typeof twitchEventTypeSchema>;
export const captureScopes = [
  'user:read:chat',
  'user:bot',
  'channel:bot',
] as const;
// Jobs carry only a durable delivery identifier, never chat or credentials.
export const ingestionJobSchema = z.strictObject({
  deliveryId: z.string().min(1).max(500),
});
export const ingestionStatusSchema = z.strictObject({
  configured: z.boolean(),
  requested: z.boolean(),
  missingScopes: z.array(z.string()),
  error: z.enum(['authorization_required', 'provider_unavailable']).nullable(),
  subscriptions: z.array(
    z.strictObject({ type: twitchEventTypeSchema, status: z.string() }),
  ),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  lastReceivedAt: z.iso.datetime().nullable(),
});
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;
