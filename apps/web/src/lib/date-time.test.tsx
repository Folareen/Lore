import { expect, it } from 'vitest';
import { formatDate, formatDateTime } from './date-time';
it('uses readable month names and omits noisy seconds', () => {
  expect(formatDateTime('2026-11-01T16:41:15Z')).toBe(
    'Nov 1, 2026 · 4:41 PM UTC',
  );
});
it('keeps dates consistent across time zones and year boundaries', () => {
  expect(formatDate('2026-12-31T23:30:00-02:00')).toBe('Jan 1, 2027');
});
it('handles an unavailable date without crashing a screen', () => {
  expect(formatDateTime('')).toBe('Date unavailable');
});
