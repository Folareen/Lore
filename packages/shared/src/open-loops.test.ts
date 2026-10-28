import { expect, it } from 'vitest';
import { createOpenLoopSchema, transitionOpenLoopSchema } from './open-loops';
it('requires a bounded explicit capture and rejects client-supplied authority or status', () => {
  const capture = {
    wording: '  Keep the promise.  ',
    requestId: '00000000-0000-4000-8000-000000000001',
  };
  expect(createOpenLoopSchema.parse(capture).wording).toBe('Keep the promise.');
  for (const input of [
    { ...capture, status: 'confirmed' },
    { ...capture, origin: 'live_twitch' },
    { ...capture, wording: '   ' },
    { ...capture, wording: 'x'.repeat(2001) },
    { ...capture, requestId: 'not-a-uuid' },
  ])
    expect(createOpenLoopSchema.safeParse(input).success).toBe(false);
});
it('requires a reason for terminal changes and a version for concurrency control', () => {
  for (const status of ['fulfilled', 'cancelled']) {
    expect(
      transitionOpenLoopSchema.safeParse({ status, expectedVersion: 1 })
        .success,
    ).toBe(false);
    expect(
      transitionOpenLoopSchema.safeParse({
        status,
        expectedVersion: 1,
        reason: '   ',
      }).success,
    ).toBe(false);
    expect(
      transitionOpenLoopSchema.safeParse({
        status,
        expectedVersion: 1,
        reason: 'Done on stream.',
      }).success,
    ).toBe(true);
  }
  expect(
    transitionOpenLoopSchema.safeParse({ status: 'in_progress' }).success,
  ).toBe(false);
});
