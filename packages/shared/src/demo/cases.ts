import type { CaseDetail } from '../cases';
import { previewChannels } from './people';
const time = '2026-10-29T10:00:00.000Z';
const initialCases: (CaseDetail & { origin: 'demo_fixture' })[] = [
  {
    id: '00000000-0000-4000-8000-000000003001',
    channelId: previewChannels[0].id,
    title: 'Review a repeated spoiler warning',
    subjectReference: 'Demo viewer · maple_quest',
    incident:
      'A viewer posted a late-game location after the no-spoilers reminder. The message was removed and a timeout applied.',
    appeal:
      'The viewer says they did not realize the location was a spoiler and asks for a review.',
    incidentAt: time,
    ruleTitle: 'No spoilers',
    ruleVersion: '2',
    ruleText:
      'Do not share story events or undiscovered locations unless the streamer asks. Give a clear reminder before escalating repeated spoilers.',
    status: 'open',
    version: 1,
    origin: 'demo_fixture',
    outcome: null,
    rationale: null,
    followUp: null,
    decidedByTwitchUserId: null,
    decidedAt: null,
    aiRunId: null,
    aiDisposition: null,
    createdAt: time,
    updatedAt: time,
    evidence: [
      {
        id: '00000000-0000-4000-8000-000000004001',
        label: 'Moderator’s incident note',
        excerpt:
          'The reminder was posted two minutes before the location message. The full chat context is not included in this demo.',
        origin: 'demo_fixture',
        sourceEventId: null,
        originalAvailable: null,
        occurredAt: time,
        createdAt: time,
        removed: false,
        file: null,
      },
    ],
    history: [
      {
        id: '00000000-0000-4000-8000-000000005001',
        version: 1,
        action: 'created',
        actorTwitchUserId: '100',
        reason: null,
        occurredAt: time,
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000003002',
    channelId: previewChannels[0].id,
    title: 'Earlier spoiler appeal',
    subjectReference: 'Demo viewer · fernlight',
    incident:
      'A first-time viewer shared a story location before receiving a clear reminder.',
    appeal: 'The viewer apologized and asked for the timeout to be shortened.',
    incidentAt: time,
    ruleTitle: 'No spoilers',
    ruleVersion: '1',
    ruleText: 'Avoid story spoilers. Start with a reminder for new viewers.',
    status: 'decided',
    version: 2,
    origin: 'demo_fixture',
    outcome: 'modify',
    rationale:
      'The reminder had not been clear. A moderator shortened the timeout and explained the rule.',
    followUp: 'Share the spoiler rule before the next story segment.',
    decidedByTwitchUserId: '200',
    decidedAt: time,
    aiRunId: null,
    aiDisposition: null,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: time,
    evidence: [],
    history: [
      {
        id: '00000000-0000-4000-8000-000000005002',
        version: 1,
        action: 'created',
        actorTwitchUserId: '200',
        reason: null,
        occurredAt: time,
      },
      {
        id: '00000000-0000-4000-8000-000000005003',
        version: 2,
        action: 'decided',
        actorTwitchUserId: '200',
        reason: 'The reminder had not been clear.',
        occurredAt: time,
      },
    ],
  },
];

export const previewCases: (CaseDetail & { origin: 'demo_fixture' })[] = [
  ...initialCases,
  {
    ...initialCases[0],
    id: '00000000-0000-4000-8000-000000003003',
    title: 'Check a repeated backseating report',
    subjectReference: 'Demo viewer · pebble_path',
    status: 'reviewing',
    version: 2,
    incident:
      'A viewer repeatedly posted building instructions after the streamer asked chat to let them experiment.',
    appeal:
      'The viewer says they were trying to help and asks which kinds of suggestions are welcome.',
    ruleTitle: 'Ask before backseating',
    ruleVersion: '1',
    ruleText:
      'Offer game instructions only when the streamer asks. Acknowledge a reminder and let the streamer try their own approach.',
    evidence: [
      {
        ...initialCases[0].evidence[0],
        id: '00000000-0000-4000-8000-000000004003',
        label: 'Synthetic report summary',
        excerpt:
          'Two instruction messages followed the reminder. Exact wording and full chat are not retained in this sample.',
      },
    ],
    history: [
      {
        ...initialCases[0].history[0],
        id: '00000000-0000-4000-8000-000000005004',
      },
      {
        id: '00000000-0000-4000-8000-000000005005',
        version: 2,
        action: 'updated',
        actorTwitchUserId: '200',
        reason: 'Added the viewer’s appeal; waiting for a human review.',
        occurredAt: time,
      },
    ],
  },
];
