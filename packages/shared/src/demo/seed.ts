import { type DemoDataset } from '../demo';
import { previewSession, previewChannels, previewPeople } from './people';
import { previewOpenLoops } from './open-loops';
import { previewCandidates } from './candidates';
import { previewCases } from './cases';
import { previewPublications } from './publications';
const channel = previewChannels[0].id;
const time = '2026-10-29T10:00:00.000Z';
const repairId = '00000000-0000-4000-8000-000000008001';
const flagId = '00000000-0000-4000-8000-000000008002';
const handoffId = '00000000-0000-4000-8000-000000008003';
const moderator = previewPeople[0].userId;
export const demoSeed: DemoDataset = {
  version: 1,
  label: 'Demo fixture',
  session: previewSession,
  channels: [previewChannels[0]],
  people: previewPeople,
  loops: previewOpenLoops,
  candidates: previewCandidates,
  cases: previewCases,
  publications: [
    ...previewPublications,
    {
      ...previewPublications[0],
      id: '00000000-0000-4000-8000-000000007004',
      kind: 'commitment',
      title: 'Finish the community island tour next stream.',
      body: 'The garden is open. Next stream, cozybyte will finish the island tour with chat.',
      sourceIds: [],
      promiseId: previewOpenLoops[0].id,
    },
  ],
  moderation: {
    repairs: [
      {
        id: repairId,
        channelId: channel,
        caseId: previewCases[1].id,
        title: 'Welcome fernlight back with a clear spoiler reminder',
        agreement:
          'A moderator will share the spoiler rule before the next story segment and check that the viewer understands it.',
        assigneeId: moderator,
        kind: 're_entry',
        dueAt: null,
        status: 'pending',
        version: 1,
        completionNote: null,
        evidenceId: null,
        createdAt: time,
        updatedAt: time,
      },
    ],
    flags: [
      {
        id: flagId,
        channelId: channel,
        caseId: previewCases[0].id,
        comparedCaseId: previewCases[1].id,
        caseVersion: 1,
        comparedVersion: 2,
        version: 1,
        status: 'open',
        origin: 'human',
        concern:
          'Check whether the clearer rule reminder changes the appropriate response.',
        reviewNote: null,
        severityContext:
          'Both incidents concern story-location spoilers; one followed an explicit reminder.',
        evidenceContext:
          'Only synthetic incident notes are available. The earlier case used rule version 1.',
        reviewedByTwitchUserId: null,
        reviewedAt: null,
        createdAt: time,
        updatedAt: time,
      },
    ],
    handoffs: [
      {
        id: handoffId,
        channelId: channel,
        periodStart: '2026-10-28T10:00:00.000Z',
        periodEnd: time,
        summary:
          'Demo fixture · A spoiler appeal needs review. A previous viewer is returning with a clearer reminder; keep the rule-version difference in mind.',
        createdByTwitchUserId: '200',
        createdAt: time,
        recentDecisions: [],
        ruleContexts: [
          { caseId: previewCases[0].id, title: 'No spoilers', version: '2' },
        ],
        ruleChanges: [],
        truncated: false,
        items: [
          {
            id: '00000000-0000-4000-8000-000000008004',
            channelId: channel,
            handoffId,
            caseId: previewCases[0].id,
            sourceType: 'case',
            sourceId: previewCases[0].id,
            sourceVersion: 1,
            title: 'Review the repeated spoiler warning',
            assigneeId: moderator,
            status: 'pending',
            version: 1,
            note: 'Read the incident note and compare the prior rule before deciding.',
            updatedAt: time,
          },
        ],
      },
    ],
    activity: [],
    ruleChanges: [],
  },
  overlays: {
    [channel]: {
      version: 1,
      enabled: true,
      mode: 'recap',
      entryIds: [previewPublications[2].id],
      tokenActive: false,
    },
  },
};
