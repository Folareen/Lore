// @vitest-environment jsdom
import { type AnchorHTMLAttributes } from 'react';
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
import { CasesProvider } from './cases-context';
import { ModerationProvider } from '../moderation/moderation-context';
import { ModerationScreen } from './moderation';
import { CaseDetailScreen } from './case-detail';
import { previewChannels, previewSession } from '../../lib/preview-data';
import { previewCases } from '../../lib/preview-cases';
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
const fetchMock = vi.fn<typeof fetch>();
function setup(
  children = <CaseDetailScreen id={previewCases[0].id} />,
  preview = true,
  role: 'owner' | 'moderator' | 'team' = 'owner',
  connected = true,
) {
  render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={[{ ...previewChannels[0], role, connected }]}
      preview={preview}
    >
      <CasesProvider>
        <ModerationProvider>{children}</ModerationProvider>
      </CasesProvider>
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  router.push.mockReset();
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
it('takes a fixture case through evidence, precedent review and an explicitly confirmed human decision without network calls', async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: previewCases[0].title });
  expect(screen.getByText(previewCases[0].ruleText)).toBeTruthy();
  await user.click(screen.getByText('Attach evidence'));
  await user.type(screen.getByLabelText('Evidence label'), 'Reminder context');
  await user.type(
    screen.getByLabelText('Evidence excerpt'),
    'The reminder was visible before the message.',
  );
  await user.click(screen.getByRole('button', { name: 'Retain evidence' }));
  await screen.findByRole('article', { name: 'Reminder context' });
  await user.click(
    screen.getByRole('button', { name: 'Find potential precedents' }),
  );
  await screen.findByRole('heading', {
    name: 'AI suggestion · Human review required',
  });
  expect(screen.getByText(/Different|different rule version/)).toBeTruthy();
  expect(
    screen.getByText(
      'The viewer’s understanding cannot be established from these notes.',
    ),
  ).toBeTruthy();
  await user.click(
    screen.getByRole('button', { name: 'Use recommendation as a draft' }),
  );
  await user.selectOptions(
    screen.getByLabelText('How did you review the AI suggestion?'),
    'modified',
  );
  await user.clear(screen.getByLabelText('Decision rationale'));
  await user.type(
    screen.getByLabelText('Decision rationale'),
    'I checked the reminder and chose a shorter timeout.',
  );
  await user.click(
    screen.getByRole('button', { name: 'Review human decision' }),
  );
  expect(screen.queryByText('Modify · Human decision')).toBeNull();
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Save human decision',
    }),
  );
  await screen.findByRole('heading', { name: 'Modify · Human decision' });
  expect(screen.getByText(/AI suggestion modified/)).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Review human decision' }),
  ).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('lets a moderator edit a case snapshot without sending response-only fields', async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: previewCases[0].title });
  await user.click(screen.getByRole('button', { name: 'Edit case' }));
  await user.clear(screen.getByLabelText('Case title'));
  await user.type(
    screen.getByLabelText('Case title'),
    'Updated incident review',
  );
  await user.click(screen.getByRole('button', { name: 'Save case changes' }));
  await screen.findByRole('heading', { name: 'Updated incident review' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('requires a reason and confirmation before removing retained evidence', async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole('article', { name: 'Moderator’s incident note' });
  await user.click(screen.getByRole('button', { name: 'Remove evidence' }));
  const dialog = screen.getByRole('dialog');
  await user.click(
    within(dialog).getByRole('button', { name: 'Remove evidence' }),
  );
  expect(within(dialog).getByRole('alert').textContent).toContain(
    'Give a reason',
  );
  await user.type(
    screen.getByLabelText('Removal reason'),
    'Incorrect incident note.',
  );
  await user.click(
    within(dialog).getByRole('button', { name: 'Remove evidence' }),
  );
  await screen.findByText(
    'This evidence was removed. Its content is no longer retained here.',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
it('blocks general team access and makes disconnected owner case files read-only', async () => {
  setup(undefined, true, 'team');
  expect(
    screen.getByText('Cases are private to owners and approved moderators.'),
  ).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  cleanup();
  setup(undefined, true, 'owner', false);
  await screen.findByRole('heading', { name: previewCases[0].title });
  expect(screen.queryByRole('button', { name: 'Edit case' })).toBeNull();
  expect(screen.queryByText('Attach evidence')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Review human decision' }),
  ).toBeNull();
});
it('creates a labeled manual case through the fixture list', async () => {
  setup(<ModerationScreen />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: previewCases[0].title });
  await user.click(screen.getByRole('button', { name: 'New case' }));
  for (const [label, text] of [
    ['Case title', 'A new review'],
    ['Subject reference', 'Demo viewer'],
    ['Incident details', 'A synthetic incident'],
    ['Channel rule', 'Be kind'],
    ['Rule version', '1'],
    ['Rule text at the time', 'No personal attacks.'],
  ])
    await user.type(screen.getByLabelText(label), text);
  await user.click(screen.getByRole('button', { name: 'Create case' }));
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(
      expect.stringContaining('/demo?view=case&case='),
    ),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
it('keeps API version conflicts visible and never presents a decision as saved', async () => {
  fetchMock.mockImplementation(
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).endsWith('/decision')
            ? { message: 'This case changed. Refresh before trying again' }
            : String(input).includes('/moderation?')
              ? {
                  assignees: [],
                  repairs: [],
                  flags: [],
                  handoffs: [],
                  activity: [],
                  nextCursors: {
                    repairs: null,
                    flags: null,
                    handoffs: null,
                    ruleChanges: null,
                    activity: null,
                  },
                  activityTruncated: false,
                  ruleChanges: [],
                  ruleChangesTruncated: false,
                }
              : String(input).endsWith('/ai/settings')
                ? {
                    enabled: false,
                    embeddingsConfigured: false,
                    reasoningConfigured: false,
                    storageConfigured: false,
                    embeddingModel: 'test',
                    reasoningModel: 'test',
                    dailyUsed: 0,
                    dailyLimit: 50,
                  }
                : String(input).endsWith('/precedents')
                  ? null
                  : previewCases[0],
        ),
        {
          status: String(input).endsWith('/decision') ? 409 : 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
  );
  setup(undefined, false);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: previewCases[0].title });
  await user.type(
    screen.getByLabelText('Decision rationale'),
    'I reviewed this manually.',
  );
  await user.click(
    screen.getByRole('button', { name: 'Review human decision' }),
  );
  await user.click(screen.getByRole('button', { name: 'Save human decision' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This case changed',
  );
  expect(screen.queryByText('No action · Human decision')).toBeNull();
});
it('preserves a human rationale when a new recommendation arrives', async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: previewCases[0].title });
  await user.type(
    screen.getByLabelText('Decision rationale'),
    'My notes should stay while I compare the context.',
  );
  await user.click(
    screen.getByRole('button', { name: 'Find potential precedents' }),
  );
  await screen.findByRole('heading', {
    name: 'AI suggestion · Human review required',
  });
  expect(
    (screen.getByLabelText('Decision rationale') as HTMLTextAreaElement).value,
  ).toBe('My notes should stay while I compare the context.');
  expect(
    (
      screen.getByLabelText(
        'How did you review the AI suggestion?',
      ) as HTMLSelectElement
    ).value,
  ).toBe('');
  expect(fetchMock).not.toHaveBeenCalled();
});
