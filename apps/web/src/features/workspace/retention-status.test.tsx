// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceProvider } from './workspace-context';
import { RetentionStatus } from './retention-status';
import { previewSession, previewChannels } from '../../lib/preview-data';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
const fetchMock = vi.fn<typeof fetch>();
const status = {
  retentionDays: 7,
  capturedMessages: 3,
  expiredMessages: 1,
  lastPurgedAt: '2026-01-01T00:00:00.000Z',
  intervalSeconds: 60,
};
const response = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), { status: code });
function setup(role: 'owner' | 'team' = 'owner', preview = false) {
  const channel = { ...previewChannels[0], role };
  return render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={[channel]}
      preview={preview}
    >
      <RetentionStatus channel={channel} />
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows stale worker status and updates it only after a CSRF-protected purge succeeds', async () => {
  fetchMock.mockResolvedValueOnce(response(status)).mockResolvedValueOnce(
    response({
      ...status,
      capturedMessages: 2,
      expiredMessages: 0,
      lastPurgedAt: new Date().toISOString(),
    }),
  );
  setup();
  await screen.findByText(/3 stored chat messages/);
  expect(
    screen.getByText(/No successful purge in over two minutes/),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Purge expired chat now' }),
  );
  await screen.findByText(/2 stored chat messages · 0 awaiting/);
  const [, options] = fetchMock.mock.calls[1];
  expect(options?.method).toBe('POST');
  expect(options?.headers).toHaveProperty(
    'X-CSRF-Token',
    previewSession.csrfToken,
  );
});
it('exposes a retry after failure without claiming cleanup succeeded', async () => {
  fetchMock
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response(status));
  setup();
  await screen.findByText(/Could not load retention status/);
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh retention status' }),
  );
  await screen.findByText(/3 stored chat messages/);
});
it('does not request owner status for a team member or demo fixture', async () => {
  const view = setup('team');
  expect(fetchMock).not.toHaveBeenCalled();
  view.unmount();
  setup('owner', true);
  expect(screen.getByText(/retention is simulated/)).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('returns expired owner access to sign-in', async () => {
  fetchMock.mockResolvedValueOnce(response({}, 401));
  setup();
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?expired=1'));
});
