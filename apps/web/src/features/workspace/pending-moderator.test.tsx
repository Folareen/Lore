// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  savePendingModerator,
  takePendingModerator,
} from './pending-moderator';
const input = {
  actorId: '00000000-0000-4000-8000-000000000001',
  channelId: '00000000-0000-4000-8000-000000000002',
  action: {
    kind: 'grant' as const,
    twitchUserId: '200',
    role: 'moderator' as const,
  },
};
afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});
it('resumes only once for the same owner and expires abandoned changes', () => {
  savePendingModerator(input);
  expect(takePendingModerator(input.actorId)).toMatchObject(input);
  expect(takePendingModerator(input.actorId)).toBeNull();
  savePendingModerator(input);
  expect(takePendingModerator(input.channelId)).toBeNull();
  savePendingModerator(input);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 10 * 60_000);
  expect(takePendingModerator(input.actorId)).toBeNull();
});
it('rejects invalid and malformed browser data without starting a change', () => {
  for (const value of [
    '{',
    '{"role":"owner"}',
    JSON.stringify({ ...input, createdAt: Date.now() + 10000 }),
  ]) {
    sessionStorage.setItem('lore:pending-moderator', value);
    expect(takePendingModerator(input.actorId)).toBeNull();
  }
});
