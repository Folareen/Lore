import type { CaseDetail } from '../cases';
import { previewChannels } from './people';
const time = '2026-10-29T10:00:00.000Z';
export const previewCases: (CaseDetail & { origin: 'demo_fixture' })[] = [
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
