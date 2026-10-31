// @vitest-environment jsdom
import { selectValue } from '../../test/select-value';
import { useState, type AnchorHTMLAttributes } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenLoopsScreen } from './open-loops';
import { StreamBriefScreen } from './stream-brief';
import { WorkspaceProvider } from '../workspace/workspace-context';
import { previewChannels, previewSession } from '../../lib/preview-data';
import { previewOpenLoops } from '../../lib/preview-open-loops';
const { router } = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
const fetchMock = vi.fn<typeof fetch>();
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function Journey() {
  const [brief, setBrief] = useState(false);
  return (
    <>
      <button onClick={() => setBrief(!brief)}>
        {brief ? 'Show promises' : 'Show brief'}
      </button>
      {brief ? <StreamBriefScreen /> : <OpenLoopsScreen />}
    </>
  );
}
function setup(preview = true, connected = true, children = <Journey />) {
  render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={[{ ...previewChannels[0], connected }]}
      preview={preview}
    >
      {children}
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  router.replace.mockReset();
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('lets a credential-free demo capture a confirmed promise and carry it into the next-stream brief', async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole('article', { name: previewOpenLoops[0].wording });
  await user.type(
    screen.getByLabelText('What did we promise?'),
    'Play the community playlist.',
  );
  await user.type(
    screen.getByLabelText('Who’s following up? (optional)'),
    'The crew',
  );
  await user.type(
    screen.getByLabelText('When should we revisit it? (optional)'),
    'Next stream',
  );
  await user.click(screen.getByRole('button', { name: 'Save promise' }));
  const card = await screen.findByRole('article', {
    name: 'Play the community playlist.',
  });
  expect(within(card).getByText('Confirmed')).toBeTruthy();
  expect(within(card).getByText(/Demo fixture/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Show brief' }));
  const link = await screen.findByRole('link', {
    name: 'Play the community playlist.',
  });
  expect(link.getAttribute('href')).toContain('/demo?view=streamer&loop=');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('requires a completion reason and removes fulfilled work from the brief', async () => {
  setup();
  const user = userEvent.setup();
  const card = await screen.findByRole('article', {
    name: previewOpenLoops[0].wording,
  });
  await user.click(within(card).getByText('Change status'));
  await selectValue(
    user,
    within(card).getByLabelText('Next status'),
    'fulfilled',
  );
  expect(
    within(card).getByLabelText<HTMLTextAreaElement>('Reason (required)')
      .required,
  ).toBe(true);
  await user.type(
    within(card).getByLabelText('Reason (required)'),
    'We toured it on stream.',
  );
  await user.click(
    within(card).getByRole('button', { name: 'Update promise' }),
  );
  await waitFor(() =>
    expect(
      within(
        screen.getByRole('article', { name: previewOpenLoops[0].wording }),
      ).getByText('Fulfilled'),
    ).toBeTruthy(),
  );
  await user.click(screen.getByRole('button', { name: 'Show brief' }));
  await screen.findByRole('link', { name: previewOpenLoops[1].wording });
  expect(
    screen.queryByRole('link', { name: previewOpenLoops[0].wording }),
  ).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('confirms cancellations and exposes retained source wording and human history', async () => {
  setup();
  const user = userEvent.setup();
  const card = await screen.findByRole('article', {
    name: previewOpenLoops[0].wording,
  });
  await user.click(within(card).getByText('Change status'));
  await selectValue(
    user,
    within(card).getByLabelText('Next status'),
    'cancelled',
  );
  await user.type(
    within(card).getByLabelText('Reason (required)'),
    'The community picked another plan.',
  );
  await user.click(
    within(card).getByRole('button', { name: 'Update promise' }),
  );
  const dialog = screen.getByRole('dialog');
  expect(
    within(card).getByText('Confirmed', { selector: 'span' }),
  ).toBeTruthy();
  await user.click(
    within(dialog).getByRole('button', { name: 'Cancel promise' }),
  );
  const updated = await screen.findByRole('article', {
    name: previewOpenLoops[0].wording,
  });
  await waitFor(() =>
    expect(within(updated).getByText('Cancelled')).toBeTruthy(),
  );
  await user.click(within(updated).getByText('Source and history'));
  await user.click(
    within(updated).getByRole('button', { name: 'Load history' }),
  );
  expect(
    await within(updated).findByText('The community picked another plan.'),
  ).toBeTruthy();
  expect(
    within(updated).getByText(previewOpenLoops[0].source.excerpt),
  ).toBeTruthy();
});
it('keeps disconnected owner views read-only and clearly distinguishes an unavailable original source', async () => {
  fetchMock.mockResolvedValue(
    response({
      items: [
        {
          ...previewOpenLoops[0],
          origin: 'live_twitch',
          source: { ...previewOpenLoops[0].source, originalAvailable: false },
        },
      ],
      nextCursor: null,
    }),
  );
  setup(false, false);
  const card = await screen.findByRole('article', {
    name: previewOpenLoops[0].wording,
  });
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Save promise' })
      .disabled,
  ).toBe(true);
  await userEvent.click(within(card).getByText('Change status'));
  expect(
    within(card).getByRole<HTMLButtonElement>('button', {
      name: 'Update promise',
    }).disabled,
  ).toBe(true);
  await userEvent.click(within(card).getByText('Source and history'));
  expect(
    within(card).getByText(/original chat source was removed or expired/),
  ).toBeTruthy();
});
it('retains a stable request ID when retrying a failed dashboard capture and sends CSRF', async () => {
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method !== 'POST')
      return response({ items: [], nextCursor: null });
    const posts = fetchMock.mock.calls.filter(
      ([, options]) => options?.method === 'POST',
    );
    if (posts.length === 1) throw new Error('offline');
    const input = JSON.parse(String(init.body));
    return response({
      ...previewOpenLoops[0],
      id: input.requestId,
      wording: input.wording,
      captureMethod: 'dashboard',
      origin: 'manual_import',
    });
  });
  setup(false);
  const user = userEvent.setup();
  await screen.findByText('No promises here yet.');
  await user.type(
    screen.getByLabelText('What did we promise?'),
    'Keep the mock plan.',
  );
  await user.click(screen.getByRole('button', { name: 'Save promise' }));
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Save promise' }));
  await screen.findByRole('article', { name: 'Keep the mock plan.' });
  const posts = fetchMock.mock.calls.filter(
    ([, options]) => options?.method === 'POST',
  );
  expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
  expect(posts[1][1]?.headers).toMatchObject({
    'X-CSRF-Token': previewSession.csrfToken,
  });
});
it('shows mutation conflicts without pretending a status change succeeded', async () => {
  fetchMock.mockImplementation(async (_url, init) =>
    init?.method === 'PATCH'
      ? response(
          { message: 'This open loop changed. Refresh before trying again' },
          409,
        )
      : response({ items: [previewOpenLoops[0]], nextCursor: null }),
  );
  setup(false);
  const user = userEvent.setup();
  const card = await screen.findByRole('article', {
    name: previewOpenLoops[0].wording,
  });
  await user.click(within(card).getByText('Change status'));
  await user.click(
    within(card).getByRole('button', { name: 'Update promise' }),
  );
  expect((await within(card).findByRole('alert')).textContent).toContain(
    'Refresh',
  );
  expect(within(card).getByText('Confirmed')).toBeTruthy();
});
it('handles private list failures and expired sessions with a refresh path', async () => {
  fetchMock
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  setup(false);
  const user = userEvent.setup();
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Refresh promises' }));
  expect(await screen.findByText('No promises here yet.')).toBeTruthy();
  fetchMock.mockResolvedValue(response({}, 401));
  await user.click(screen.getByRole('button', { name: 'Refresh promises' }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith('/login?expired=1'),
  );
});
it('loads a referenced promise even when it is outside the first page', async () => {
  fetchMock.mockImplementation(async (url) =>
    String(url).includes('/open-loops?')
      ? response({ items: [], nextCursor: null })
      : response(previewOpenLoops[0]),
  );
  setup(false, true, <OpenLoopsScreen focusId={previewOpenLoops[0].id} />);
  expect(
    await screen.findByRole('article', { name: previewOpenLoops[0].wording }),
  ).toBeTruthy();
  expect(
    fetchMock.mock.calls.some(([url]) =>
      String(url).endsWith(`/open-loops/${previewOpenLoops[0].id}`),
    ),
  ).toBe(true);
});
