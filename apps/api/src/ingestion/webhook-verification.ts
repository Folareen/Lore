import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
const timestampSchema = z.iso.datetime({ offset: true });
export function verifyWebhook(
  headers: Record<string, string | string[] | undefined>,
  body: Buffer | undefined,
  secret: string,
  now = Date.now(),
) {
  const id = headers['twitch-eventsub-message-id'];
  const timestamp = headers['twitch-eventsub-message-timestamp'];
  const signature = headers['twitch-eventsub-message-signature'];
  if (
    typeof id !== 'string' ||
    !id ||
    id.length > 500 ||
    typeof timestamp !== 'string' ||
    !timestampSchema.safeParse(timestamp).success ||
    typeof signature !== 'string' ||
    !/^sha256=[a-f0-9]{64}$/.test(signature) ||
    !body
  )
    throw new UnauthorizedException('Invalid EventSub delivery');
  const age = now - Date.parse(timestamp);
  if (age > 10 * 60_000 || age < -60_000)
    throw new UnauthorizedException('Stale EventSub delivery');
  const expected = createHmac('sha256', secret)
    .update(id)
    .update(timestamp)
    .update(body)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex')))
    throw new UnauthorizedException('Invalid EventSub signature');
  return { id, timestamp: new Date(timestamp) };
}
