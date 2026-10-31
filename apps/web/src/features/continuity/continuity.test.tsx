// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceProvider } from '../workspace/workspace-context';
import { previewChannels, previewSession } from '../../lib/preview-data';
import { FeatureControls } from './feature-controls';
import { SummaryGenerator } from './summary-generator';
import { MicrophonePanel } from './microphone';
import { WorkspaceStream, useLiveRefresh } from './live-updates';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/candidates',
}));
const settings = {
  moderationImportsEnabled: false,
  promiseConfirmationsEnabled: false,
  publicSummaryAiEnabled: true,
  microphoneEnabled: true,
  missingModerationScopes: ['channel:moderate'],
  chatReady: true,
  aiConfigured: true,
};
const fetcher = vi.fn<typeof fetch>();
function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup(children: React.ReactNode, preview = false) {
  return render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={[previewChannels[0]]}
      preview={preview}
    >
      {children}
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  });
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('requires an explicit owner confirmation and CSRF before enabling event import', async () => {
  fetcher.mockImplementation(async (_url, init) =>
    json(
      init?.method === 'POST'
        ? { ...settings, moderationImportsEnabled: true }
        : settings,
    ),
  );
  setup(<FeatureControls />);
  await userEvent.click(screen.getByText('Additional channel capabilities'));
  expect(
    (
      await screen.findByRole('link', {
        name: 'Authorize moderation event access',
      })
    ).getAttribute('href'),
  ).toBe('/api/auth/twitch/moderation');
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Enable import moderation events',
    }),
  );
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(0);
  await userEvent.click(
    screen.getByRole('button', { name: 'Enable capability' }),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.find(([, init]) => init?.method === 'POST')?.[1],
    ).toMatchObject({
      headers: { 'X-CSRF-Token': previewSession.csrfToken },
      body: JSON.stringify({
        feature: 'moderationImportsEnabled',
        enabled: true,
      }),
    }),
  );
});
it('shows microphone consent before touching a device and keeps the demo provider-free', async () => {
  const getUserMedia = vi.fn();
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
  fetcher.mockImplementation(async (url) =>
    json(
      String(url).endsWith('/features')
        ? { ...settings, microphoneEnabled: false }
        : [],
    ),
  );
  const view = setup(<MicrophonePanel />);
  await userEvent.click(screen.getByText('Microphone follow-ups'));
  expect(
    await screen.findByRole('button', { name: 'Start recording' }),
  ).toHaveProperty('disabled', true);
  expect(getUserMedia).not.toHaveBeenCalled();
  view.unmount();
  fetcher.mockClear();
  setup(<MicrophonePanel />, true);
  await userEvent.click(screen.getByText('Microphone follow-ups'));
  expect(
    await screen.findByText(
      /microphone recording and provider calls are disabled/,
    ),
  ).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
it('cancels a late microphone grant even if the recording panel is reopened', async () => {
  let grant!: (stream: MediaStream) => void;
  const stop = vi.fn();
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        grant = resolve;
      }),
  );
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', vi.fn());
  fetcher.mockImplementation(async (url) =>
    json(String(url).endsWith('/features') ? settings : []),
  );
  setup(<MicrophonePanel />);
  await userEvent.click(screen.getByText('Microphone follow-ups'));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Start recording' }),
    ).toHaveProperty('disabled', false),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Start recording' }),
  );
  await userEvent.click(screen.getByText('Microphone follow-ups'));
  await userEvent.click(screen.getByText('Microphone follow-ups'));
  await act(async () => {
    grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  });
  expect(stop).toHaveBeenCalled();
  expect(MediaRecorder).not.toHaveBeenCalled();
});
it('leaves a generated public summary unpublished until it is explicitly used as an editable draft', async () => {
  const onUse = vi.fn();
  // The generator validates full publication records; use the bundled public fixture projection.
  const { previewPublications } =
    await import('../../lib/preview-publications');
  const source = previewPublications[0];
  const draft = {
    title: 'Garden recap',
    body: 'The garden is open.',
    chatSummary: 'Garden time.',
    sourceIds: [source.id],
  };
  fetcher.mockImplementation(async (url) =>
    json(
      String(url).endsWith('/features')
        ? settings
        : String(url).endsWith('/ai-draft')
          ? draft
          : { items: [source], nextCursor: null },
    ),
  );
  setup(<SummaryGenerator onUse={onUse} />);
  await userEvent.click(
    screen.getByText('Draft a catch-up summary with Gemini'),
  );
  await userEvent.click(await screen.findByRole('checkbox'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Generate summary draft' }),
  );
  expect(await screen.findByText('Gemini draft · not published')).toBeTruthy();
  expect(onUse).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use as editable draft' }),
  );
  expect(onUse).toHaveBeenCalledWith(draft);
  expect(
    fetcher.mock.calls.some(([url]) => String(url).includes('/review')),
  ).toBe(false);
});
class MockStream {
  static current: MockStream;
  handlers = new Map<string, (event: MessageEvent) => void>();
  onopen?: () => void;
  onerror?: () => void;
  close = vi.fn();
  constructor() {
    MockStream.current = this;
  }
  addEventListener(name: string, handler: (event: MessageEvent) => void) {
    this.handlers.set(name, handler);
  }
  emit(revision: number) {
    this.handlers.get('changed')?.(
      new MessageEvent('changed', { data: JSON.stringify({ revision }) }),
    );
  }
}
it('refreshes clean views while protecting unsaved input, and still refreshes consent', async () => {
  vi.stubGlobal('EventSource', MockStream);
  const refresh = vi.fn(),
    consent = vi.fn();
  function View() {
    useLiveRefresh(previewChannels[0].id, refresh);
    useLiveRefresh(previewChannels[0].id, consent, true);
    return <input aria-label="Unsaved wording" />;
  }
  setup(
    <>
      <WorkspaceStream />
      <View />
    </>,
  );
  act(() => {
    MockStream.current.emit(1);
    MockStream.current.emit(2);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  fireEvent.input(screen.getByLabelText('Unsaved wording'), {
    target: { value: 'Keep this edit' },
  });
  act(() => MockStream.current.emit(3));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(consent).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Unsaved wording')).toHaveProperty(
    'value',
    'Keep this edit',
  );
  expect(screen.getByText(/Your edits have been preserved/)).toBeTruthy();
});
