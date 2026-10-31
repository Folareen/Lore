// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { MemoryGame } from './memory-game';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('is optional, matches pairs and resets without contacting a service', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryGame />);
  expect(
    (screen.getByRole('button', { name: 'Turn card 1' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  act(() => screen.getByRole('button', { name: 'Play a quick round' }).click());
  // A deterministic shuffle: stream, chat, stream, promise, chat, promise.
  for (const [a, b] of [
    [1, 3],
    [2, 5],
    [4, 6],
  ]) {
    act(() => screen.getByRole('button', { name: `Turn card ${a}` }).click());
    act(() => screen.getByRole('button', { name: `Turn card ${b}` }).click());
  }
  expect(screen.getByRole('status').textContent).toContain(
    'All three pairs found',
  );
  expect(screen.getByRole('status').textContent).toContain('3 turns');
  expect(fetcher).not.toHaveBeenCalled();
  act(() => screen.getByRole('button', { name: 'New round' }).click());
  expect(screen.getByRole('status').textContent).toContain('0 turns');
  vi.unstubAllGlobals();
});
it('lets players inspect a mismatch at their own pace and reset the round', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  render(<MemoryGame />);
  act(() => screen.getByRole('button', { name: 'Play a quick round' }).click());
  act(() => screen.getByRole('button', { name: 'Turn card 1' }).click());
  act(() => screen.getByRole('button', { name: 'Turn card 2' }).click());
  expect(screen.getByRole('status').textContent).toContain('Not a pair');
  act(() => screen.getByRole('button', { name: 'Try another pair' }).click());
  act(() => screen.getByRole('button', { name: 'Turn card 1' }).click());
  act(() => screen.getByRole('button', { name: 'Turn card 2' }).click());
  act(() => screen.getByRole('button', { name: 'New round' }).click());
  expect(screen.getByRole('status').textContent).toContain(
    'Find your first pair',
  );
});
