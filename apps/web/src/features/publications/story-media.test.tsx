// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoryMedia, StoryScreenshot } from './story-media';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('does not contact Twitch until the viewer loads the clip, with autoplay off and a parent hostname', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(
        private readonly callback: (
          entries: { contentRect: { width: number } }[],
        ) => void,
      ) {}
      observe() {
        this.callback([{ contentRect: { width: 640 } }]);
      }
      disconnect() {}
    },
  );
  const { container } = render(
    <StoryMedia
      entry={{ title: 'Garden day', clipId: 'GardenCrew-abc_123' }}
    />,
  );
  expect(container.querySelector('iframe')).toBeNull();
  await userEvent.click(
    screen.getByRole('button', { name: 'Load Twitch clip' }),
  );
  const frame = screen.getByTitle(
    'Twitch clip: Garden day',
  ) as HTMLIFrameElement;
  const source = new URL(frame.src);
  expect(source.origin).toBe('https://clips.twitch.tv');
  expect(source.searchParams.get('autoplay')).toBe('false');
  expect(source.searchParams.get('parent')).toBe(window.location.hostname);
});
it('keeps the clip link available without embedding on a narrow screen', () => {
  const { container } = render(
    <StoryMedia
      entry={{ title: 'Garden day', clipId: 'GardenCrew-abc_123' }}
    />,
  );
  expect(container.querySelector('iframe')).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Open on Twitch' }).getAttribute('href'),
  ).toBe('https://clips.twitch.tv/GardenCrew-abc_123');
});
it('shows a readable fallback when a screenshot cannot load', () => {
  render(<StoryScreenshot src="/unavailable" alt="A garden" />);
  fireEvent.error(screen.getByRole('img', { name: 'A garden' }));
  expect(screen.getByText(/Screenshot unavailable/)).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});
