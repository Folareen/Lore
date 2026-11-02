// @vitest-environment jsdom
import { selectValue } from '../../test/select-value';
import { useState, type AnchorHTMLAttributes } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceProvider } from '../workspace/workspace-context';
import { CandidatesProvider } from './candidates-context';
import { CandidatesScreen } from './candidates';
import { StreamBriefScreen } from '../open-loops/stream-brief';
import { previewChannels, previewSession } from '../../lib/preview-data';
import { previewCandidates } from '../../lib/preview-candidates';
const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
const fetchMock = vi.fn<typeof fetch>();
function Journey() {
  const [brief, setBrief] = useState(false);
  return (
    <>
      <button onClick={() => setBrief(!brief)}>
        {brief ? 'Review candidates' : 'Show brief'}
      </button>
      {brief ? <StreamBriefScreen /> : <CandidatesScreen />}
    </>
  );
}
function setup(
  preview = true,
  connected = true,
  role: 'owner' | 'moderator' = 'owner',
) {
  render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={[{ ...previewChannels[0], connected, role }]}
      preview={preview}
    >
      <CandidatesProvider>
        <Journey />
      </CandidatesProvider>
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows full candidate evidence and uncertainty, then carries an edited human confirmation into the brief', async () => {
  setup();
  const user = userEvent.setup();
  const article = await screen.findByRole('article', {
    name: previewCandidates[0].draft!.summary,
  });
  await user.click(
    within(article).getByRole('button', { name: 'Review suggestion' }),
  );
  expect(
    within(article).getByText(previewCandidates[0].source.text!),
  ).toBeTruthy();
  expect(
    within(article).getByText(previewCandidates[0].draft!.uncertainties[0]),
  ).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Show brief' }));
  await screen.findByText('Finish the community island tour next stream.');
  expect(screen.queryByText(previewCandidates[0].draft!.summary)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Review candidates' }));
  await screen.findByRole('article', {
    name: previewCandidates[0].draft!.summary,
  });
  await user.click(
    within(
      screen.getByRole('article', {
        name: previewCandidates[0].draft!.summary,
      }),
    ).getByRole('button', { name: 'Review suggestion' }),
  );
  await user.click(screen.getByRole('button', { name: 'Review as promise' }));
  await user.clear(screen.getByLabelText('Promise wording'));
  await user.type(
    screen.getByLabelText('Promise wording'),
    'Post the cozy games list in Discord.',
  );
  await user.click(screen.getByRole('button', { name: 'Confirm promise' }));
  await screen.findByText('View saved promise');
  await user.click(screen.getByRole('button', { name: 'Show brief' }));
  await screen.findByText('Post the cozy games list in Discord.');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('requires an explicit dismissal reason and preserves the reviewed decision', async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole('article', {
    name: previewCandidates[0].draft!.summary,
  });
  await user.click(
    within(
      screen.getByRole('article', {
        name: previewCandidates[0].draft!.summary,
      }),
    ).getByRole('button', { name: 'Review suggestion' }),
  );
  await user.click(screen.getByRole('button', { name: 'Dismiss suggestion' }));
  expect(
    (
      screen.getByLabelText(
        'Why dismiss this suggestion?',
      ) as HTMLTextAreaElement
    ).required,
  ).toBe(true);
  await user.type(
    screen.getByLabelText('Why dismiss this suggestion?'),
    'Just brainstorming.',
  );
  await user.click(screen.getByRole('button', { name: 'Confirm dismissal' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('article', {
        name: previewCandidates[0].draft!.summary,
      }),
    ).toBeNull(),
  );
  await selectValue(user, screen.getByLabelText('Show'), 'dismissed');
  await user.click(
    within(
      await screen.findByRole('article', {
        name: previewCandidates[0].draft!.summary,
      }),
    ).getByRole('button', { name: 'Review suggestion' }),
  );
  await screen.findByText(/Just brainstorming/);
  expect(
    screen.queryByRole('button', { name: 'Review as promise' }),
  ).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('makes a disconnected channel read-only', async () => {
  setup(true, false);
  await screen.findByRole('article', {
    name: previewCandidates[0].draft!.summary,
  });
  await userEvent.click(
    within(
      screen.getByRole('article', {
        name: previewCandidates[0].draft!.summary,
      }),
    ).getByRole('button', { name: 'Review suggestion' }),
  );
  expect(
    (
      screen.getByRole('button', {
        name: 'Review as promise',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    within(
      screen.getByRole('article', {
        name: previewCandidates[0].draft!.summary,
      }),
    ).getByText('Reconnect the channel before reviewing suggestions.'),
  ).toBeTruthy();
});
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
it('explains missing server credentials and owner-only consent without offering a broken action', async () => {
  fetchMock.mockImplementation(async (input) =>
    String(input).includes('/candidates?')
      ? json({ items: [], nextCursor: null })
      : json({
          configured: false,
          enabled: false,
          provider: 'gemini',
          model: 'test',
          dailyUsed: 0,
          dailyLimit: 50,
          recentRuns: [],
        }),
  );
  setup(false, true, 'moderator');
  await userEvent.click(screen.getByText('Find suggestions in chat'));
  await screen.findByText(
    'Only the channel owner can enable chat suggestions.',
  );
  expect(screen.getByText(/configuration needs attention/)).toBeTruthy();
  expect(
    (
      screen.getByRole('button', {
        name: 'Analyze new chat',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it('sends versioned, CSRF-protected review and keeps a conflict visible for refresh', async () => {
  fetchMock.mockImplementation(async (input, options) => {
    if (String(input).endsWith('/confirm')) {
      expect(options?.headers).toMatchObject({
        'X-CSRF-Token': previewSession.csrfToken,
      });
      expect(JSON.parse(String(options?.body))).toMatchObject({
        expectedVersion: 1,
        wording: previewCandidates[0].draft!.summary,
      });
      return json(
        { message: 'This candidate changed. Refresh before reviewing' },
        409,
      );
    }
    return String(input).includes('/candidates?')
      ? json({ items: [previewCandidates[0]], nextCursor: null })
      : json({
          configured: true,
          enabled: true,
          provider: 'gemini',
          model: 'test',
          dailyUsed: 1,
          dailyLimit: 50,
          recentRuns: [],
        });
  });
  setup(false);
  const user = userEvent.setup();
  await screen.findByRole('article', {
    name: previewCandidates[0].draft!.summary,
  });
  await user.click(
    within(
      screen.getByRole('article', {
        name: previewCandidates[0].draft!.summary,
      }),
    ).getByRole('button', { name: 'Review suggestion' }),
  );
  await user.click(screen.getByRole('button', { name: 'Review as promise' }));
  await user.click(screen.getByRole('button', { name: 'Confirm promise' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This candidate changed. Refresh before reviewing',
  );
  expect(screen.queryByText('View saved promise')).toBeNull();
});
it('preserves review edits while refreshed suggestions keep the same version', async () => {
  fetchMock.mockImplementation(async (input) =>
    String(input).includes('/candidates?')
      ? json({ items: [previewCandidates[0]], nextCursor: null })
      : json({
          configured: true,
          enabled: true,
          provider: 'gemini',
          model: 'test',
          dailyUsed: 1,
          dailyLimit: 50,
          recentRuns: [],
        }),
  );
  setup(false);
  const user = userEvent.setup();
  await screen.findByRole('article', {
    name: previewCandidates[0].draft!.summary,
  });
  await user.click(
    within(
      screen.getByRole('article', {
        name: previewCandidates[0].draft!.summary,
      }),
    ).getByRole('button', { name: 'Review suggestion' }),
  );
  await user.click(screen.getByRole('button', { name: 'Review as promise' }));
  await user.clear(screen.getByLabelText('Promise wording'));
  await user.type(
    screen.getByLabelText('Promise wording'),
    'Keep my review in progress.',
  );
  await user.click(screen.getByRole('button', { name: 'Refresh suggestions' }));
  await waitFor(() =>
    expect(screen.queryByText('Loading suggestions…')).toBeNull(),
  );
  expect(
    (screen.getByLabelText('Promise wording') as HTMLTextAreaElement).value,
  ).toBe('Keep my review in progress.');
});
