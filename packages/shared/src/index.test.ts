import { describe, expect, it } from 'vitest';
import { canTransitionOpenLoop, openLoopStatusSchema } from './index';
describe('open-loop workflow', () => {
  it('requires confirmation before a candidate can progress or be fulfilled', () => {
    expect(canTransitionOpenLoop('candidate', 'confirmed')).toBe(true);
    expect(canTransitionOpenLoop('candidate', 'fulfilled')).toBe(false);
    expect(canTransitionOpenLoop('candidate', 'in_progress')).toBe(false);
  });
  it('allows postponing and resuming confirmed work', () => {
    expect(canTransitionOpenLoop('confirmed', 'postponed')).toBe(true);
    expect(canTransitionOpenLoop('postponed', 'in_progress')).toBe(true);
  });
  it('keeps terminal states terminal', () => {
    for (const status of openLoopStatusSchema.options) {
      expect(canTransitionOpenLoop('fulfilled', status)).toBe(false);
      expect(canTransitionOpenLoop('cancelled', status)).toBe(false);
    }
  });
  it('rejects unknown statuses', () =>
    expect(openLoopStatusSchema.safeParse('published').success).toBe(false));
});
