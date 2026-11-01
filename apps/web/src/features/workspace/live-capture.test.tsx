// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  captureScopes,
  twitchEventTypes,
  type IngestionStatus,
} from '@lore/shared';
import { LiveCapture } from './live-capture';
import { WorkspaceProvider } from './workspace-context';
import { previewChannels, previewSession } from '../../lib/preview-data';
const { router } = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const fetchMock = vi.fn<typeof fetch>();
const paused: IngestionStatus = {
  configured: true,
  requested: false,
  missingScopes: [],
  error: null,
  subscriptions: [],
  pending: 0,
  failed: 0,
  lastReceivedAt: null,
};
function reply(status: IngestionStatus) {
  return new Response(JSON.stringify(status), {
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup(preview = false, channel = previewChannels[0]) {
  render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={[channel]}
      preview={preview}
    >
      <LiveCapture channel={channel} />
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  router.replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('explains missing capture permissions and links to separate Twitch authorization', async () => {
  fetchMock.mockResolvedValue(
    reply({ ...paused, missingScopes: [...captureScopes] }),
  );
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Manage live capture' }),
  );
  const link = await screen.findByRole('link', {
    name: 'Authorize chat capture on Twitch',
  });
  expect(link.getAttribute('href')).toBe('/api/auth/twitch/capture');
  expect(screen.queryByRole('button', { name: 'Start capture' })).toBeNull();
});
it('offers a retry for a recorded authorization failure when capture scopes are present', async () => {
  fetchMock.mockImplementation(async (_url, options) =>
    reply(
      options?.method === 'POST'
        ? {
            ...paused,
            requested: true,
            subscriptions: twitchEventTypes.map((type) => ({
              type,
              status: 'enabled',
            })),
          }
        : { ...paused, error: 'authorization_required' },
    ),
  );
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Manage live capture' }));
  expect(await screen.findByText('Capture needs attention')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start capture' })).toBeNull();
  expect(
    screen
      .getByRole('link', { name: 'Reconnect Twitch permissions' })
      .getAttribute('href'),
  ).toBe('/api/auth/twitch/capture');
  await user.click(screen.getByRole('button', { name: 'Retry capture' }));
  expect(await screen.findByText('Listening on Twitch')).toBeTruthy();
  expect(
    screen.queryByRole('link', { name: 'Reconnect Twitch permissions' }),
  ).toBeNull();
  expect(fetchMock.mock.calls[1][0]).toBe(
    `/api/channels/${previewChannels[0].id}/ingestion/start`,
  );
  expect(fetchMock.mock.calls[1][1]).toMatchObject({
    method: 'POST',
    headers: { 'X-CSRF-Token': previewSession.csrfToken },
  });
});
it('starts and stops through CSRF-protected mutations and reports actual subscription readiness', async () => {
  fetchMock.mockImplementation(async (_url, options) =>
    reply(
      options?.method === 'POST' && String(_url).endsWith('/start')
        ? {
            ...paused,
            requested: true,
            subscriptions: twitchEventTypes.map((type) => ({
              type,
              status: 'enabled',
            })),
          }
        : paused,
    ),
  );
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Manage live capture' }));
  await user.click(
    await screen.findByRole('button', { name: 'Start capture' }),
  );
  expect(await screen.findByText('Listening on Twitch')).toBeTruthy();
  expect(fetchMock.mock.calls[1][1]).toMatchObject({
    method: 'POST',
    headers: { 'X-CSRF-Token': previewSession.csrfToken },
  });
  await user.click(screen.getByRole('button', { name: 'Stop capture' }));
  expect(await screen.findByText('Capture stopped')).toBeTruthy();
  expect(fetchMock.mock.calls[2][0]).toBe(
    `/api/channels/${previewChannels[0].id}/ingestion/stop`,
  );
});
it('supports retrying a failed status load and explains unconfigured ingestion', async () => {
  fetchMock
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(reply({ ...paused, configured: false }));
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Manage live capture' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  await user.click(
    screen.getByRole('button', { name: 'Refresh capture status' }),
  );
  expect(
    await screen.findByText(
      'Live capture isn’t configured for this Lore instance yet.',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start capture' })).toBeNull();
});
it('keeps preview, disconnected and non-owner views away from private ingestion endpoints', async () => {
  setup(true);
  expect(screen.getByText(/Demo fixture/)).toBeTruthy();
  cleanup();
  setup(false, previewChannels[1]);
  expect(screen.getByText(/Only the channel owner/)).toBeTruthy();
  cleanup();
  setup(false, { ...previewChannels[0], connected: false });
  expect(screen.getByText(/Reconnect your channel/)).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('redirects expired sessions and never reports capture readiness on a failed request', async () => {
  fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Manage live capture' }),
  );
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith('/login?expired=1'),
  );
  expect(screen.queryByText('Listening on Twitch')).toBeNull();
});
