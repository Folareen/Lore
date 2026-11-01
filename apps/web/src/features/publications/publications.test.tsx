// @vitest-environment jsdom
import { useState, type AnchorHTMLAttributes } from 'react';
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
import { WorkspaceProvider } from '../workspace/workspace-context';
import { PublicationsProvider } from './publications-context';
import { PublicationsScreen } from './publications';
import { CommunityPreview } from './community-preview';
import { PublicReader } from './public-lore';
import {
  previewPublications,
  previewPublicEntry,
} from '../../lib/preview-publications';
import { previewChannels, previewSession } from '../../lib/preview-data';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
    void prefetch;
    return <a {...props}>{children}</a>;
  },
}));
const fetchMock = vi.fn<typeof fetch>();
function Harness() {
  const [visitor, setVisitor] = useState(false);
  return (
    <>
      <button onClick={() => setVisitor(!visitor)}>
        {visitor ? 'View fixture publisher' : 'View fixture visitor'}
      </button>
      {visitor ? <CommunityPreview /> : <PublicationsScreen />}
    </>
  );
}
function setup(role: 'owner' | 'moderator' | 'team' = 'owner', preview = true) {
  render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={[{ ...previewChannels[0], role }]}
      preview={preview}
    >
      <PublicationsProvider>
        <Harness />
      </PublicationsProvider>
    </WorkspaceProvider>,
  );
}
async function draft(
  user: ReturnType<typeof userEvent.setup>,
  title = 'Our next community moment',
) {
  await screen.findByRole('button', { name: 'New story' });
  await user.click(screen.getByRole('button', { name: 'New story' }));
  await user.type(screen.getByLabelText('Public title'), title);
  await user.type(
    screen.getByLabelText('Public story'),
    'Chat chose a new garden path. Everyone is welcome to help name it.',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save community draft' }),
  );
  await screen.findByRole('article', { name: title });
  return title;
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
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
it('keeps a new draft out of visitor catch-up until an explicit human publication review', async () => {
  setup();
  const user = userEvent.setup(),
    title = await draft(user);
  await user.click(
    screen.getByRole('button', { name: 'View fixture visitor' }),
  );
  expect(screen.queryByRole('heading', { name: title })).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'View fixture publisher' }),
  );
  const card = await screen.findByRole('article', { name: title });
  await user.click(within(card).getByRole('button', { name: 'Open draft' }));
  await user.click(
    within(card).getByRole('button', { name: 'Review for publication' }),
  );
  const dialog = screen.getByRole('dialog', {
    name: /Publish this exact wording/,
  });
  expect(
    within(dialog).getByText(
      'Chat chose a new garden path. Everyone is welcome to help name it.',
    ),
  ).toBeTruthy();
  await user.click(
    within(dialog).getByRole('button', { name: 'Approve & publish' }),
  );
  expect(within(dialog).getByRole('alert').textContent).toContain(
    'review reason',
  );
  await user.type(
    screen.getByLabelText('Publication review reason'),
    'Reviewed for public sharing; no private moderation context.',
  );
  await user.click(
    within(dialog).getByRole('button', { name: 'Approve & publish' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await user.click(
    screen.getByRole('button', { name: 'View fixture visitor' }),
  );
  await screen.findByRole('heading', { name: title });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('lets team members prepare drafts without approval controls or Twitch sending settings', async () => {
  setup('team');
  const user = userEvent.setup(),
    title = await draft(user, 'A team-prepared story');
  const card = screen.getByRole('article', { name: title });
  expect(
    within(card).queryByRole('button', { name: 'Review for publication' }),
  ).toBeNull();
  expect(
    screen.queryByRole('heading', { name: '!catchup in Twitch chat' }),
  ).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'View fixture visitor' }),
  );
  expect(screen.queryByText(title)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('withdraws published sources and dependent newcomer summaries when a public source is edited', async () => {
  setup();
  const user = userEvent.setup();
  const source = previewPublications[0];
  const card = await screen.findByRole('article', { name: source.title });
  await user.click(within(card).getByRole('button', { name: 'Manage story' }));
  await user.click(within(card).getByRole('button', { name: 'Edit as draft' }));
  await user.clear(screen.getByLabelText('Public story'));
  await user.type(
    screen.getByLabelText('Public story'),
    'Updated explanation awaiting another human review.',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save community draft' }),
  );
  await waitFor(() =>
    expect(
      within(screen.getByRole('article', { name: source.title })).getByText(
        'draft',
      ),
    ).toBeTruthy(),
  );
  expect(
    within(
      screen.getByRole('article', { name: previewPublications[2].title }),
    ).getByText('unpublished'),
  ).toBeTruthy();
  await user.click(
    screen.getByRole('button', { name: 'View fixture visitor' }),
  );
  await screen.findByText('No catch-up published yet');
  expect(screen.queryByText(source.title)).toBeNull();
  expect(screen.queryByText(previewPublications[2].body)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('requires reasoned deletion and removes the entry from visitor views', async () => {
  setup();
  const user = userEvent.setup();
  const source = previewPublications[1];
  const card = await screen.findByRole('article', { name: source.title });
  await user.click(within(card).getByRole('button', { name: 'Manage story' }));
  await user.click(within(card).getByText('More actions'));
  await user.click(within(card).getByRole('button', { name: 'Delete entry' }));
  await user.type(
    screen.getByLabelText('Publication review reason'),
    'Withdraw this update at the community owner’s request.',
  );
  await user.click(
    screen.getByRole('button', { name: 'Delete community entry' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('article', { name: source.title })).toBeNull(),
  );
  await user.click(
    screen.getByRole('button', { name: 'View fixture visitor' }),
  );
  expect(screen.queryByRole('heading', { name: source.title })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('shows the exact short catch-up wording and keeps chat sending disabled in the fixture preview', async () => {
  setup();
  await userEvent.click(
    within(
      await screen.findByRole('article', {
        name: previewPublications[2].title,
      }),
    ).getByRole('button', { name: 'Manage story' }),
  );
  expect(
    await screen.findByText(previewPublications[2].chatSummary),
  ).toBeTruthy();
  await userEvent.click(screen.getByRole('tab', { name: 'Twitch replies' }));
  await screen.findByRole('heading', { name: '!catchup in Twitch chat' });
  expect(
    screen
      .getByRole('button', { name: 'Enable !catchup replies' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.queryByRole('link', { name: 'Authorize chat replies with Twitch' }),
  ).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('clears public content when revalidation finds a withdrawal and renders community text without HTML execution', async () => {
  const data = {
    channel: { slug: 'twitch-100', displayName: 'cozybyte' },
    items: [
      {
        ...previewPublicEntry(previewPublications[0], previewPublications),
        body: '<script>privateContext()</script>',
      },
    ],
    nextCursor: null,
  };
  fetchMock.mockImplementation(async (input) =>
    Response.json(
      String(input).endsWith('/assistant') ? { enabled: false } : data,
    ),
  );
  render(<PublicReader initial={{ mode: 'feed', data }} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.getByText('<script>privateContext()</script>')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  fetchMock.mockImplementation(async () =>
    Response.json(
      { message: 'Community Lore is not available' },
      { status: 404 },
    ),
  );
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  fireEvent(document, new Event('visibilitychange'));
  await screen.findByRole('alert');
  expect(
    screen.queryByRole('heading', { name: previewPublications[0].title }),
  ).toBeNull();
});
it('sends a CSRF-protected versioned approval and keeps a conflict visible without publishing', async () => {
  const record = {
    ...previewPublications[0],
    status: 'draft' as const,
    publishedAt: null,
    approvedByTwitchUserId: null,
    version: 1,
  };
  fetchMock.mockImplementation(async (input, init) => {
    if (String(input).includes('/catchup/settings'))
      return Response.json({
        enabled: false,
        captureEnabled: false,
        configured: false,
        missingScopes: [],
        recent: [],
      });
    if (init?.method === 'POST') {
      expect(new Headers(init.headers).get('X-CSRF-Token')).toBe(
        previewSession.csrfToken,
      );
      expect(JSON.parse(String(init.body)).expectedVersion).toBe(1);
      return Response.json(
        { message: 'Entry changed. Refresh before reviewing' },
        { status: 409 },
      );
    }
    return Response.json({ items: [record], nextCursor: null });
  });
  setup('owner', false);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open draft' }));
  await screen.findByRole('button', { name: 'Review for publication' });
  await user.click(
    screen.getByRole('button', { name: 'Review for publication' }),
  );
  await user.type(
    screen.getByLabelText('Publication review reason'),
    'Keep this review rationale.',
  );
  await user.click(screen.getByRole('button', { name: 'Approve & publish' }));
  const dialog = screen.getByRole('dialog', {
    name: /Publish this exact wording/,
  });
  await within(dialog).findByRole('alert');
  expect(
    (screen.getByLabelText('Publication review reason') as HTMLTextAreaElement)
      .value,
  ).toBe('Keep this review rationale.');
  expect(
    within(screen.getByRole('article', { name: record.title })).getByText(
      'draft',
    ),
  ).toBeTruthy();
});
it('does not resurrect withdrawn text when an older public request finishes after a newer withdrawal', async () => {
  const data = {
    channel: { slug: 'twitch-100', displayName: 'cozybyte' },
    items: [previewPublicEntry(previewPublications[0], previewPublications)],
    nextCursor: null,
  };
  let release: (response: Response) => void = () => {
    throw new Error('Missing pending response');
  };
  let feedRequests = 0;
  fetchMock.mockImplementation(async (input) => {
    if (String(input).endsWith('/assistant'))
      return Response.json({ enabled: false });
    feedRequests++;
    if (feedRequests === 1)
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return Response.json(
      { message: 'Community Lore is not available' },
      { status: 404 },
    );
  });
  render(<PublicReader initial={{ mode: 'feed', data }} />);
  await waitFor(() => expect(feedRequests).toBe(1));
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  fireEvent(document, new Event('visibilitychange'));
  await screen.findByRole('alert');
  await act(async () => {
    release(Response.json(data));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: previewPublications[0].title }),
    ).toBeNull(),
  );
  expect(screen.getByRole('alert').textContent).toContain('not available');
});

it('switches community tabs through scoped public filters and paginates within the selected tab', async () => {
  const source = previewPublicEntry(
    previewPublications[0],
    previewPublications,
  );
  const story = { ...source, kind: 'story' as const, title: 'Garden story' };
  const reference = { ...source, kind: 'reference', title: 'Pond committee' };
  const older = {
    ...reference,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Older reference',
  };
  const channel = { slug: 'twitch-100', displayName: 'cozybyte' };
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/assistant'))
      return Response.json({ enabled: false });
    const kind = url.searchParams.get('kind');
    const more = url.searchParams.has('cursor');
    return Response.json({
      channel,
      items:
        kind === 'reference'
          ? [more ? older : reference]
          : kind === 'commitment'
            ? []
            : [story],
      nextCursor: kind === 'reference' && !more ? older.id : null,
    });
  });
  render(
    <PublicReader
      initial={{
        mode: 'feed',
        data: { channel, items: [story], nextCursor: null },
      }}
      query="q=garden"
    />,
  );
  await screen.findByRole('heading', { name: 'Garden story' });
  const originalUrl = window.location.href;
  await userEvent.click(screen.getByRole('tab', { name: 'Inside references' }));
  await screen.findByRole('heading', { name: 'Pond committee' });
  expect(screen.queryByRole('heading', { name: 'Garden story' })).toBeNull();
  expect(window.location.href).toBe(originalUrl);
  expect(
    fetchMock.mock.calls.some(([url]) =>
      String(url).includes('q=garden&kind=reference'),
    ),
  ).toBe(true);
  await userEvent.click(
    screen.getByRole('button', { name: 'More community stories' }),
  );
  await screen.findByRole('heading', { name: 'Older reference' });
  expect(
    screen.getByRole('link', { name: 'Older reference' }).getAttribute('href'),
  ).toContain(`/entries/${older.id}`);
  const tab = screen.getByRole('tab', { name: 'Inside references' });
  tab.focus();
  await userEvent.keyboard('{ArrowRight}');
  await screen.findByRole('heading', { name: 'No plans or promises found' });
  expect(
    screen
      .getByRole('tab', { name: 'Plans & promises' })
      .getAttribute('aria-selected'),
  ).toBe('true');
  await userEvent.click(screen.getByRole('tab', { name: 'Stories' }));
  await screen.findByRole('heading', { name: 'Garden story' });
  await userEvent.click(screen.getByRole('tab', { name: 'Stories' }));
  expect(screen.queryByRole('status')).toBeNull();
});
