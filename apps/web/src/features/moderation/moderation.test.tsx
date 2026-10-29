// @vitest-environment jsdom
import type { AnchorHTMLAttributes } from 'react';
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
import { CasesProvider } from '../cases/cases-context';
import { ModerationProvider } from './moderation-context';
import { CaseWorkflowPanel, ModeratorDeskScreen } from './moderator-desk';
import { previewChannels, previewSession } from '../../lib/preview-data';
import { previewCases } from '../../lib/preview-cases';
import { moderationDeskSchema } from '@lore/shared';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
const fetchMock = vi.fn<typeof fetch>();
function setup(
  children: React.ReactNode = <ModeratorDeskScreen />,
  role: 'owner' | 'moderator' | 'team' = 'owner',
  connected = true,
  preview = true,
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
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('takes a concern through comparison, annotation and a final human review without network calls', async () => {
  setup(<CaseWorkflowPanel record={previewCases[0]} />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Consistency review' });
  await user.click(screen.getByRole('button', { name: 'Raise a concern' }));
  await user.selectOptions(
    screen.getByLabelText('Compare with (optional)'),
    previewCases[1].id,
  );
  await user.type(
    screen.getByLabelText('Concern or missing rationale'),
    'Check whether the different rule versions explain the outcomes.',
  );
  await user.click(screen.getByRole('button', { name: 'Create review flag' }));
  await screen.findByText(previewCases[1].rationale!, { exact: false });
  expect(screen.getByText(/rule v1/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Review concern' }));
  await user.type(
    screen.getByLabelText('Review rationale'),
    'Waiting for the reminder context.',
  );
  await user.type(
    screen.getByLabelText('Evidence differences or gaps'),
    'Full chat is missing.',
  );
  await user.click(screen.getByRole('button', { name: 'Record human review' }));
  await waitFor(() =>
    expect(
      within(
        screen.getByRole('article', { name: 'Consistency concern' }),
      ).getByText('Waiting for the reminder context.'),
    ).toBeTruthy(),
  );
  await user.click(screen.getByRole('button', { name: 'Review concern' }));
  await user.selectOptions(
    screen.getByLabelText('Review outcome'),
    'dismissed',
  );
  await user.clear(screen.getByLabelText('Review rationale'));
  await user.type(
    screen.getByLabelText('Review rationale'),
    'Rule changes explain the different treatment.',
  );
  await user.click(screen.getByRole('button', { name: 'Record human review' }));
  await screen.findByRole('heading', {
    name: 'Potential inconsistency · dismissed',
  });
  expect(screen.queryByRole('button', { name: 'Review concern' })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('assigns an agreed re-entry condition and records explicit completion proof', async () => {
  setup(<CaseWorkflowPanel record={previewCases[1]} />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Consistency review' });
  await user.click(screen.getByRole('button', { name: 'Repair actions' }));
  await user.click(screen.getByRole('button', { name: 'Agree an action' }));
  await user.type(
    screen.getByLabelText('Action title'),
    'Explain expectations before re-entry',
  );
  await user.selectOptions(screen.getByLabelText('Action type'), 're_entry');
  await user.type(
    screen.getByLabelText('Agreed resolution or condition'),
    'Moderator agreed to explain the spoiler rule.',
  );
  await user.selectOptions(
    screen.getByLabelText('Assigned moderator'),
    '00000000-0000-4000-8000-000000000200',
  );
  await user.click(screen.getByRole('button', { name: 'Save agreed action' }));
  await screen.findByRole('heading', {
    name: 'Explain expectations before re-entry',
  });
  await user.click(screen.getByRole('button', { name: 'Update action' }));
  await user.selectOptions(screen.getByLabelText('Action status'), 'completed');
  await user.type(
    screen.getByLabelText('Progress, completion proof or cancellation reason'),
    'The moderator explained the rule and the viewer acknowledged it.',
  );
  await user.click(screen.getByRole('button', { name: 'Save action update' }));
  await waitFor(() =>
    expect(
      within(
        screen.getByRole('article', {
          name: 'Explain expectations before re-entry',
        }),
      ).getByText(
        'The moderator explained the rule and the viewer acknowledged it.',
      ),
    ).toBeTruthy(),
  );
  expect(screen.queryByRole('button', { name: 'Update action' })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('creates a handoff from source records and requires a note to acknowledge and resolve a task', async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole('heading', {
    name: 'Leave the next shift in the loop.',
  });
  await user.click(
    screen.getByRole('button', { name: 'Generate shift handoff' }),
  );
  const title = previewCases[0].title;
  await screen.findByRole('article', { name: title });
  const task = () => screen.getByRole('article', { name: title });
  expect(
    within(task())
      .getByRole('link', { name: 'Open source record' })
      .getAttribute('href'),
  ).toContain(previewCases[0].id);
  await user.click(
    within(task()).getByRole('button', { name: 'Update handoff task' }),
  );
  await user.selectOptions(
    screen.getByLabelText('Task status'),
    'acknowledged',
  );
  await user.type(
    screen.getByLabelText('Handoff note / resolution'),
    'I will inspect the reminder context next shift.',
  );
  await user.click(screen.getByRole('button', { name: 'Save handoff task' }));
  await waitFor(() =>
    expect(within(task()).getByText('acknowledged')).toBeTruthy(),
  );
  await user.click(
    within(task()).getByRole('button', { name: 'Update handoff task' }),
  );
  expect(within(task()).queryByRole('option', { name: 'Pending' })).toBeNull();
  await user.selectOptions(screen.getByLabelText('Task status'), 'resolved');
  await user.click(screen.getByRole('button', { name: 'Save handoff task' }));
  await waitFor(() =>
    expect(within(task()).getByText('resolved')).toBeTruthy(),
  );
  expect(
    within(task()).queryByRole('button', { name: 'Update handoff task' }),
  ).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('documents a human rule change and includes it in the next handoff', async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByRole('heading', {
    name: 'Leave the next shift in the loop.',
  });
  await user.click(screen.getByText('Channel rule changes'));
  await user.click(
    screen.getByRole('button', { name: 'Document a rule change' }),
  );
  for (const [label, text] of [
    ['Rule title', 'Spoilers'],
    ['Previous rule version', '2'],
    ['New rule version', '3'],
    ['Updated rule text', 'Ask before sharing a location.'],
    [
      'What changed and why?',
      'Moderators agreed to clarify location spoilers.',
    ],
  ])
    await user.type(screen.getByLabelText(label), text);
  await user.click(screen.getByRole('button', { name: 'Save rule change' }));
  await screen.findByText('Spoilers · 2 → 3');
  await user.click(
    screen.getByRole('button', { name: 'Generate shift handoff' }),
  );
  await screen.findByRole('heading', { name: 'Documented rule changes' });
  expect(
    screen
      .getByRole('link', { name: 'Source rule-change record' })
      .getAttribute('href'),
  ).toContain('/preview?view=workflows#rule-');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('keeps the desk unavailable to team grants and read-only for disconnected owners', async () => {
  setup(undefined, 'team');
  await screen.findByText(
    'This desk is private to owners and approved moderators.',
  );
  expect(screen.queryByText('Generate shift handoff')).toBeNull();
  cleanup();
  setup(undefined, 'owner', false);
  await screen.findByRole('heading', {
    name: 'Leave the next shift in the loop.',
  });
  expect(
    screen
      .getByRole('button', { name: 'Generate shift handoff' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen
      .getByRole('button', { name: 'Compare documented outcomes' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('keeps a conflicting human review editable and reports the API error', async () => {
  const data = moderationDeskSchema.parse({
    assignees: [],
    repairs: [],
    flags: [
      {
        id: '00000000-0000-4000-8000-000000009001',
        channelId: previewChannels[0].id,
        caseId: previewCases[0].id,
        comparedCaseId: null,
        caseVersion: 1,
        comparedVersion: null,
        version: 1,
        status: 'open',
        origin: 'human',
        concern: 'Review the documented context.',
        reviewNote: null,
        severityContext: '',
        evidenceContext: '',
        reviewedByTwitchUserId: null,
        reviewedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
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
  });
  fetchMock.mockImplementation(async (input, init) => {
    if (String(input).includes('/moderation')) return Response.json(data);
    if (init?.method === 'PATCH')
      return Response.json(
        { message: 'Review changed. Refresh before trying again.' },
        { status: 409 },
      );
    return Response.json(previewCases[0]);
  });
  setup(<CaseWorkflowPanel record={previewCases[0]} />, 'owner', true, false);
  const user = userEvent.setup();
  await screen.findByRole('button', { name: 'Review concern' });
  await user.click(screen.getByRole('button', { name: 'Review concern' }));
  await user.type(
    screen.getByLabelText('Review rationale'),
    'Keep this human reasoning.',
  );
  await user.click(screen.getByRole('button', { name: 'Record human review' }));
  await screen.findByRole('alert');
  expect(
    (screen.getByLabelText('Review rationale') as HTMLTextAreaElement).value,
  ).toBe('Keep this human reasoning.');
});
