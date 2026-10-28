import { describe, expect, it } from 'vitest';
import { parsePromiseCommand } from './promise-command';
const command = {
  broadcaster_user_id: '100',
  chatter_user_id: '200',
  message: { text: '!promise Finish the island tour next stream.' },
  badges: [{ set_id: 'moderator' }],
};
describe('explicit Twitch promise commands', () => {
  it('accepts verified moderator badges and the matching broadcaster badge', () => {
    expect(parsePromiseCommand(command)).toBe(
      'Finish the island tour next stream.',
    );
    expect(
      parsePromiseCommand({
        ...command,
        chatter_user_id: '100',
        badges: [{ set_id: 'broadcaster' }],
      }),
    ).toBe('Finish the island tour next stream.');
  });
  it('does not infer authority from owner IDs, badge versions, VIP or subscriber status', () => {
    for (const badges of [
      [],
      [{ set_id: 'vip' }],
      [{ set_id: 'subscriber' }],
      [{ set_id: 'broadcaster' }],
      [{ set_id: '1' }],
    ])
      expect(parsePromiseCommand({ ...command, badges })).toBeNull();
    expect(
      parsePromiseCommand({ ...command, chatter_user_id: '100', badges: [] }),
    ).toBeNull();
  });
  it('rejects other-channel shared chat, ordinary messages, malformed commands and oversized wording', () => {
    expect(
      parsePromiseCommand({ ...command, source_broadcaster_user_id: '300' }),
    ).toBeNull();
    for (const text of [
      'I promise a tour',
      '!promise',
      '!promise   ',
      '!promises tour',
      'hello !promise tour',
      '!promise ' + 'a'.repeat(2001),
    ])
      expect(parsePromiseCommand({ ...command, message: { text } })).toBeNull();
    expect(
      parsePromiseCommand({
        ...command,
        message: { text: ' !PROMISE  Keep\nthis wording. ' },
      }),
    ).toBe('Keep\nthis wording.');
  });
});
