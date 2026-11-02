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
const ruleChange = {
  id: '00000000-0000-4000-8000-000000008007',
  channelId: channel,
  title: 'No spoilers',
  previousVersion: '1',
  version: '2',
  ruleText: previewCases[0].ruleText,
  changeSummary:
    'Clarified that undiscovered locations count as spoilers and that moderators should give an explicit reminder before escalation.',
  actorTwitchUserId: '100',
  createdAt: '2026-10-28T16:00:00.000Z',
};
const priorDecision = previewCases[1];
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
      {
        id: '00000000-0000-4000-8000-000000008005',
        channelId: channel,
        caseId: previewCases[1].id,
        title: 'Share the spoiler reminder before the garden tour',
        agreement:
          'Pin a short spoiler reminder so new viewers know when to wait for an invitation.',
        assigneeId: moderator,
        kind: 'follow_up',
        dueAt: '2026-10-29T09:00:00.000Z',
        status: 'completed',
        version: 2,
        completionNote:
          'Posted the reminder before the tour and checked the wording with cozybyte.',
        evidenceId: null,
        createdAt: '2026-10-28T15:00:00.000Z',
        updatedAt: '2026-10-29T09:00:00.000Z',
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
      {
        id: '00000000-0000-4000-8000-000000008006',
        channelId: channel,
        caseId: previewCases[1].id,
        comparedCaseId: previewCases[0].id,
        caseVersion: 2,
        comparedVersion: 1,
        version: 2,
        status: 'dismissed',
        origin: 'human',
        concern:
          'Check whether the earlier shortened timeout should be treated as a blanket precedent.',
        reviewNote:
          'Different rule versions and reminder timing justify a fresh review. The prior outcome is context, not a mandatory result.',
        severityContext: 'Only the later incident followed a clear reminder.',
        evidenceContext:
          'The sample incident notes do not include full chat or timeout durations.',
        reviewedByTwitchUserId: '100',
        reviewedAt: time,
        createdAt: '2026-10-29T09:00:00.000Z',
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
        recentDecisions: [
          {
            id: priorDecision.id,
            channelId: channel,
            title: priorDecision.title,
            subjectReference: priorDecision.subjectReference,
            status: priorDecision.status,
            version: priorDecision.version,
            origin: priorDecision.origin,
            ruleTitle: priorDecision.ruleTitle,
            ruleVersion: priorDecision.ruleVersion,
            outcome: priorDecision.outcome,
            createdAt: priorDecision.createdAt,
            updatedAt: priorDecision.updatedAt,
          },
        ],
        ruleContexts: [
          { caseId: previewCases[0].id, title: 'No spoilers', version: '2' },
        ],
        ruleChanges: [ruleChange],
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
          {
            id: '00000000-0000-4000-8000-000000008009',
            channelId: channel,
            handoffId,
            caseId: previewCases[1].id,
            sourceType: 'repair',
            sourceId: repairId,
            sourceVersion: 1,
            title: 'Welcome fernlight back with a clear spoiler reminder',
            assigneeId: moderator,
            status: 'acknowledged',
            version: 2,
            note: 'Read the prior decision; check in before the next story segment.',
            updatedAt: time,
          },
        ],
      },
    ],
    activity: [
      {
        id: '00000000-0000-4000-8000-000000008010',
        targetType: 'repair',
        targetId: '00000000-0000-4000-8000-000000008005',
        caseId: priorDecision.id,
        action: 'completed',
        actorTwitchUserId: '200',
        note: 'Pinned the spoiler reminder before the tour.',
        assigneeId: moderator,
        occurredAt: '2026-10-29T09:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000008011',
        targetType: 'flag',
        targetId: '00000000-0000-4000-8000-000000008006',
        caseId: priorDecision.id,
        action: 'dismissed',
        actorTwitchUserId: '100',
        note: 'Documented the rule-version and reminder differences.',
        assigneeId: null,
        occurredAt: time,
      },
    ],
    ruleChanges: [ruleChange],
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
