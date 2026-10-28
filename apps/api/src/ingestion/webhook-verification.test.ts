import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhook } from './webhook-verification';
const secret = 'local-test-secret';
const now = Date.now();
const body = Buffer.from('{ "event": "fixture" }');
function headers(timestamp = new Date(now).toISOString()) {
  const id = 'opaque:id-with-punctuation';
  return {
    'twitch-eventsub-message-id': id,
    'twitch-eventsub-message-timestamp': timestamp,
    'twitch-eventsub-message-signature': `sha256=${createHmac('sha256', secret).update(id).update(timestamp).update(body).digest('hex')}`,
  };
}
describe('EventSub signature and freshness boundary', () => {
  it('uses exact raw bytes, accepts opaque IDs and nanosecond timestamps', () => {
    expect(verifyWebhook(headers(), body, secret, now).id).toBe(
      'opaque:id-with-punctuation',
    );
    const nanos = new Date(now).toISOString().replace('Z', '123456Z');
    expect(
      verifyWebhook(headers(nanos), body, secret, now).timestamp.getTime(),
    ).toBe(now);
    expect(() =>
      verifyWebhook(
        headers(),
        Buffer.from(JSON.stringify(JSON.parse(body.toString()))),
        secret,
        now,
      ),
    ).toThrow();
  });
  it.each([-10 * 60_000 - 1, 60_001])(
    'rejects a signed timestamp outside the accepted window (%i ms)',
    (offset) => {
      expect(() =>
        verifyWebhook(
          headers(new Date(now + offset).toISOString()),
          body,
          secret,
          now,
        ),
      ).toThrow('Stale');
    },
  );
  it('rejects tampering, malformed signatures, missing headers, arrays, wrong secret and missing raw bytes', () => {
    for (const changed of [
      { ...headers(), 'twitch-eventsub-message-id': 'changed' },
      { ...headers(), 'twitch-eventsub-message-signature': 'sha256=abcd' },
      { ...headers(), 'twitch-eventsub-message-timestamp': 'invalid' },
      { ...headers(), 'twitch-eventsub-message-id': undefined },
      { ...headers(), 'twitch-eventsub-message-id': ['ambiguous', 'ids'] },
    ])
      expect(() => verifyWebhook(changed, body, secret, now)).toThrow();
    expect(() => verifyWebhook(headers(), body, 'wrong-secret', now)).toThrow();
    expect(() => verifyWebhook(headers(), undefined, secret, now)).toThrow();
  });
});
