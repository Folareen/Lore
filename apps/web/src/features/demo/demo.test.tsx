// @vitest-environment jsdom
import { selectValue } from '../../test/select-value';
import { useState, type AnchorHTMLAttributes } from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  within,
  waitFor,
  cleanup,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { demoSeed } from '@lore/shared';
import { DemoPlayground } from './demo-context';
import { DemoHome } from './demo-home';
import { DemoChat } from './demo-chat';
import { StreamBriefScreen } from '../open-loops/stream-brief';
import { CommunityPreview } from '../publications/community-preview';
import { PublicationsScreen } from '../publications/publications';
import { ModeratorDeskScreen } from '../moderation/moderator-desk';
import { ModerationScreen } from '../cases/moderation';
import { CandidatesScreen } from '../candidates/candidates';
import { OverlayScreen } from '../overlay/overlay-settings';
import DemoLayout from '../../app/demo/layout';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/demo',
  useSearchParams: () => new URLSearchParams(),
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
function Screens() {
  const [view, setView] = useState('guide');
  return (
    <>
      <nav aria-label="Test views">
        {[
          'guide',
          'chat',
          'brief',
          'cases',
          'workflows',
          'community',
          'publishing',
          'candidates',
          'overlay',
        ].map((v) => (
          <button key={v} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </nav>
      {
        {
          guide: <DemoHome />,
          chat: <DemoChat />,
          brief: <StreamBriefScreen />,
          cases: <ModerationScreen />,
          workflows: <ModeratorDeskScreen />,
          community: <CommunityPreview />,
          publishing: <PublicationsScreen />,
          candidates: <CandidatesScreen />,
          overlay: <OverlayScreen />,
        }[view]
      }
    </>
  );
}
function setup(data = demoSeed) {
  return render(
    <DemoPlayground data={data}>
      <Screens />
    </DemoPlayground>,
  );
}
function change(user: ReturnType<typeof userEvent.setup>, view: string) {
  return user.click(
    within(screen.getByRole('navigation', { name: 'Test views' })).getByRole(
      'button',
      { name: view },
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
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
  vi.unstubAllGlobals();
});
it.each([
  ['unreachable API', () => Promise.reject(new TypeError('fetch failed'))],
  [
    'request timeout',
    () => Promise.reject(new DOMException('Timed out', 'TimeoutError')),
  ],
  ['missing seed', () => Promise.resolve(new Response(null, { status: 503 }))],
  ['invalid JSON', () => Promise.resolve(new Response('not JSON'))],
  ['invalid dataset', () => Promise.resolve(Response.json({ version: 2 }))],
])('keeps the demo usable with bundled data on %s', async (_, load) => {
  fetchMock.mockImplementationOnce(load);
  render(await DemoLayout({ children: <Screens /> }));
  const user = userEvent.setup();
  expect(
    screen.getByRole('heading', { name: 'The next stream remembers.' }),
  ).toBeTruthy();
  await change(user, 'brief');
  await screen.findByText(demoSeed.loops[0].wording);
  await change(user, 'chat');
  await user.click(screen.getByRole('button', { name: 'Simulate command' }));
  await screen.findByText(
    'Simulated promise saved. Open the next-stream brief to see it.',
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/demo'),
    expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }),
  );
});
it('uses the validated backend snapshot when available', async () => {
  const data = structuredClone(demoSeed);
  data.loops[0].wording = 'Current backend seed';
  fetchMock.mockResolvedValueOnce(Response.json(data));
  render(await DemoLayout({ children: <Screens /> }));
  await change(userEvent.setup(), 'brief');
  await screen.findByText('Current backend seed');
  expect(screen.queryByText(demoSeed.loops[0].wording)).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('starts all three surfaces from the supplied seeded snapshot and keeps navigation in demo mode', async () => {
  const data = structuredClone(demoSeed);
  data.loops[0].wording = 'Seed snapshot marker';
  setup(data);
  const user = userEvent.setup();
  expect(
    screen.getByRole('heading', { name: 'The next stream remembers.' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Open loops' }).getAttribute('href'),
  ).toBe('/demo?view=streamer');
  await change(user, 'brief');
  await screen.findByText('Seed snapshot marker');
  await change(user, 'cases');
  const caseLink = await screen.findByRole('link', {
    name: /Review a repeated spoiler warning/,
  });
  expect(caseLink.getAttribute('href')).toContain('/demo?view=case&case=');
  await change(user, 'workflows');
  await screen.findByText(/A spoiler appeal needs review/);
  await change(user, 'community');
  await screen.findByText(demoSeed.publications[2].body);
  expect(screen.queryByText(demoSeed.cases[0].incident)).toBeNull();
  await change(user, 'overlay');
  await screen.findByRole('checkbox', { name: demoSeed.publications[2].title });
  expect(
    screen.getByRole('checkbox', {
      name: 'Show the approved selection on stream',
    }),
  ).toHaveProperty('checked', true);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('captures simulated authorized chat into the brief and resets only this visitor to the seed', async () => {
  setup();
  const user = userEvent.setup();
  await change(user, 'chat');
  await selectValue(user, screen.getByLabelText('Simulated speaker'), 'viewer');
  await user.click(screen.getByRole('button', { name: 'Simulate command' }));
  await screen.findByText(/Use !catchup, or send !promise/);
  await selectValue(
    user,
    screen.getByLabelText('Simulated speaker'),
    'broadcaster',
  );
  await user.click(screen.getByRole('button', { name: 'Simulate command' }));
  await screen.findByText(
    'Simulated promise saved. Open the next-stream brief to see it.',
  );
  await change(user, 'brief');
  await screen.findByText('Name the garden pond with chat next stream.');
  await user.click(screen.getByText('Demo tools', { exact: true }));
  await user.click(screen.getByRole('button', { name: 'Reset demo' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Reset demo',
    }),
  );
  await change(user, 'brief');
  await screen.findByText(demoSeed.loops[0].wording);
  expect(
    screen.queryByText('Name the garden pond with chat next stream.'),
  ).toBeNull();
  expect(demoSeed.loops).toHaveLength(2);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('updates simulated catch-up after human source withdrawal and restores the recap on reset', async () => {
  setup();
  const user = userEvent.setup();
  await change(user, 'publishing');
  const source = await screen.findByRole('article', {
    name: 'What is the moss club?',
  });
  await user.click(within(source).getByRole('button', { name: 'Unpublish' }));
  await user.type(
    screen.getByLabelText('Publication review reason'),
    'Withdraw this synthetic source.',
  );
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Withdraw community entry',
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await change(user, 'chat');
  await user.click(screen.getByRole('button', { name: 'Use !catchup' }));
  await user.click(screen.getByRole('button', { name: 'Simulate command' }));
  await screen.findByText('No catch-up summary has been approved yet.');
  await user.click(screen.getByText('Demo tools', { exact: true }));
  await user.click(screen.getByRole('button', { name: 'Reset demo' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Reset demo',
    }),
  );
  await change(user, 'chat');
  await user.click(screen.getByRole('button', { name: 'Use !catchup' }));
  await user.click(screen.getByRole('button', { name: 'Simulate command' }));
  await screen.findByText(`Catch up: ${demoSeed.publications[2].chatSummary}`);
  expect(fetchMock).not.toHaveBeenCalled();
});
