import { describe, expect, it } from 'vitest';
import { grantMembershipSchema, updateChannelSchema } from './management';
describe('management contracts', () => {
  it('limits retention to the approved one-to-seven-day range', () => {
    for (const days of [0, 8, -1, 1.5, '7'])
      expect(
        updateChannelSchema.safeParse({ chatRetentionDays: days }).success,
      ).toBe(false);
    expect(
      updateChannelSchema.parse({ chatRetentionDays: 1 }).chatRetentionDays,
    ).toBe(1);
    expect(
      updateChannelSchema.parse({ chatRetentionDays: 7 }).chatRetentionDays,
    ).toBe(7);
  });
  it('rejects mass assignment of ownership and role escalation', () => {
    expect(
      updateChannelSchema.safeParse({
        chatRetentionDays: 7,
        ownerUserId: 'other',
      }).success,
    ).toBe(false);
    expect(
      grantMembershipSchema.safeParse({ twitchUserId: '123', role: 'owner' })
        .success,
    ).toBe(false);
    expect(
      grantMembershipSchema.safeParse({
        twitchUserId: '123',
        role: 'moderator',
        verificationState: 'twitch_verified',
      }).success,
    ).toBe(false);
  });
  it('requires a Twitch ID and one of the explicitly granted roles', () => {
    expect(
      grantMembershipSchema.safeParse({ twitchUserId: 'name', role: 'team' })
        .success,
    ).toBe(false);
    expect(
      grantMembershipSchema.parse({ twitchUserId: '123', role: 'moderator' })
        .role,
    ).toBe('moderator');
  });
});
