// @vitest-environment jsdom
import { type AnchorHTMLAttributes } from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  act,
  render,
  screen,
  within,
  waitFor,
  cleanup,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverlayDisplay } from './overlay-display';
import { OverlayScreen } from './overlay-settings';
import { OverlayProvider } from './overlay-context';
import { WorkspaceProvider } from '../workspace/workspace-context';
import { PublicationsProvider } from '../publications/publications-context';
import { previewChannels, previewSession } from '../../lib/preview-data';
import type { OverlayDisplay as Display } from '@lore/shared';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
const fetchMock = vi.fn<typeof fetch>();
const token = 'a'.repeat(64);
const data: Display = {
  channel: 'Demo community',
  mode: 'recap',
  items: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      title: '<script>untrusted</script>',
      text: 'Reviewed community recap',
    },
  ],
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function setup(role: 'owner' | 'moderator' | 'team' = 'owner', preview = true) {
  return render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={[{ ...previewChannels[0], role }]}
      preview={preview}
    >
      <PublicationsProvider>
        <OverlayProvider>
          <OverlayScreen />
        </OverlayProvider>
      </PublicationsProvider>
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/overlay/demo');
  for (const method of ['showModal', 'close'])
    Object.defineProperty(HTMLDialogElement.prototype, method, {
      configurable: true,
      value() {
        if (method === 'showModal') this.setAttribute('open', '');
        else this.removeAttribute('open');
      },
    });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('reviews the exact overlay copy, saves fixture approval and creates only a labeled demo link', async () => {
  setup();
  const user = userEvent.setup();
  const recap = await screen.findByRole('checkbox', {
    name: 'Previously, in our corner of chat…',
  });
  await user.click(recap);
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Show the approved selection on stream',
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Review overlay selection' }),
  );
  const dialog = screen.getByRole('dialog');
  expect(
    within(dialog).getByText(
      'The community garden is open! Chat picked the first plants. Next up: naming the pond together.',
    ),
  ).toBeTruthy();
  await user.click(
    within(dialog).getByRole('button', { name: 'Approve and save' }),
  );
  await screen.findByText('Overlay selection approved and saved.');
  await user.click(screen.getByRole('button', { name: 'Create overlay link' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Create new link',
    }),
  );
  const url = await screen.findByLabelText('Copy-once browser-source URL');
  expect((url as HTMLInputElement).value).toContain(
    '#token=demo-only-not-a-credential',
  );
  await user.click(screen.getByRole('button', { name: 'Hide link' }));
  expect(screen.queryByLabelText('Copy-once browser-source URL')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Revoke overlay link' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Revoke link',
    }),
  );
  await screen.findByText(
    'Overlay link revoked. OBS will clear on its next refresh.',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
it('explains team access and keeps credential controls owner-only', async () => {
  const view = setup('team');
  expect(
    screen.getByText('Owners and moderators manage the stream overlay.'),
  ).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  view.unmount();
  setup('moderator');
  await screen.findByText(
    'Only the owner can create or revoke the browser-source link.',
  );
  expect(
    screen.queryByRole('button', { name: 'Create overlay link' }),
  ).toBeNull();
});
it('sends CSRF-protected approvals and retains an actionable version-conflict error', async () => {
  const settings = {
    version: 3,
    enabled: false,
    mode: 'recap',
    entryIds: [],
    tokenActive: false,
  };
  fetchMock.mockImplementation(async (input) =>
    String(input).endsWith('/overlay')
      ? response(settings)
      : response({ items: [], nextCursor: null }),
  );
  setup('owner', false);
  await screen.findByRole('button', { name: 'Review overlay selection' });
  fetchMock.mockResolvedValueOnce(
    response({ message: 'Overlay changed. Reload before saving.' }, 409),
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Review overlay selection' }),
  );
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Approve and save',
    }),
  );
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain(
    'Overlay changed. Reload before saving.',
  );
  const [, options] = fetchMock.mock.calls.at(-1)!;
  expect(options?.method).toBe('POST');
  expect(options?.headers).toHaveProperty(
    'X-CSRF-Token',
    previewSession.csrfToken,
  );
  expect(JSON.parse(options?.body as string)).toEqual({
    expectedVersion: 3,
    enabled: false,
    mode: 'recap',
    entryIds: [],
  });
});
it('keeps an unauthenticated browser source blank without calling the API', async () => {
  render(<OverlayDisplay slug="demo" />);
  await act(async () => {});
  expect(screen.queryByRole('region')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('uses only the fragment credential, renders text safely and clears a revoked overlay', async () => {
  window.history.replaceState(null, '', `/overlay/demo#token=${token}`);
  fetchMock
    .mockResolvedValueOnce(response(data))
    .mockResolvedValueOnce(response({}, 404));
  const view = render(<OverlayDisplay slug="demo" />);
  await screen.findByText('Reviewed community recap');
  expect(view.container.querySelector('script')).toBeNull();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/overlay/demo');
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { Authorization: `Bearer ${token}` },
  });
  fireEvent(window, new Event('online'));
  await waitFor(() =>
    expect(screen.queryByText('Reviewed community recap')).toBeNull(),
  );
});
it('does not restore withdrawn text from a delayed older response', async () => {
  window.history.replaceState(null, '', `/overlay/demo#token=${token}`);
  let resolve!: (value: Response) => void;
  fetchMock
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValueOnce(response({}, 404));
  render(<OverlayDisplay slug="demo" />);
  fireEvent(window, new Event('online'));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    resolve(response(data));
  });
  expect(screen.queryByText('Reviewed community recap')).toBeNull();
});
it('expires displayed text even when a later request hangs', async () => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', `/overlay/demo#token=${token}`);
  fetchMock
    .mockResolvedValueOnce(response(data))
    .mockImplementation(() => new Promise(() => {}));
  render(<OverlayDisplay slug="demo" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('Reviewed community recap')).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6501);
  });
  expect(screen.queryByText('Reviewed community recap')).toBeNull();
});
