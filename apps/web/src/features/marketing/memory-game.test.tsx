// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { MemoryGame } from './memory-game';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
  // Deterministic shuffle: stream, chat, emote, stream, promise, emote, chat, promise.
  for (const [a, b] of [
    [1, 4],
    [2, 7],
    [3, 6],
    [5, 8],
  ]) {
    act(() => screen.getByRole('button', { name: `Turn card ${a}` }).click());
    act(() => screen.getByRole('button', { name: `Turn card ${b}` }).click());
  }
  expect(screen.getByRole('status').textContent).toContain('Perfect round!');
  expect(
    screen.getByText('Your best this visit: 4 turns without a peek'),
  ).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  act(() => screen.getByRole('button', { name: 'New round' }).click());
  expect(screen.getByText('0 turns')).toBeTruthy();
  vi.unstubAllGlobals();
});
it('lets players inspect a mismatch at their own pace and reset the round', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  render(<MemoryGame />);
  act(() => screen.getByRole('button', { name: 'Play a quick round' }).click());
  act(() => screen.getByRole('button', { name: 'Turn card 1' }).click());
  act(() => screen.getByRole('button', { name: 'Turn card 2' }).click());
  expect(screen.getByRole('status').textContent).toContain('Not a pair');
  act(() => screen.getByRole('button', { name: 'Turn card 3' }).click());
  expect(screen.getByRole('button', { name: 'Turn card 1' })).toBeTruthy();
  act(() => screen.getByRole('button', { name: 'New round' }).click());
  expect(screen.getByRole('status').textContent).toContain('Pick two cards');
});

it('offers one untimed peek and lets the player hide it before continuing', () => {
  render(<MemoryGame />);
  act(() => screen.getByRole('button', { name: 'Play a quick round' }).click());
  act(() => screen.getByRole('button', { name: 'Take a peek' }).click());
  expect(screen.queryByRole('button', { name: 'Turn card 1' })).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Have a look');
  act(() => screen.getByRole('button', { name: 'Hide the cards' }).click());
  expect(screen.getByRole('button', { name: 'Turn card 1' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Take a peek' })).toBeNull();
});
