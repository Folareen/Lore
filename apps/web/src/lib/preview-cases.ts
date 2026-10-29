import type { CaseDetail, CaseAiRun } from '@lore/shared';
import { previewChannels } from './preview-data';
const time = '2026-10-29T10:00:00.000Z';
export const previewCases: CaseDetail[] = [
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
export function previewPrecedents(
  record: CaseDetail,
  records: CaseDetail[],
): CaseAiRun {
  const prior = records.filter(
    (r) =>
      r.channelId === record.channelId &&
      r.id !== record.id &&
      r.status === 'decided',
  );
  return {
    id: crypto.randomUUID(),
    status: 'completed',
    error: null,
    caseVersion: record.version,
    createdAt: new Date().toISOString(),
    indexedCount: prior.length,
    eligibleCount: prior.length,
    stale: false,
    matches: prior.map((p) => ({
      case: {
        id: p.id,
        channelId: p.channelId,
        title: p.title,
        subjectReference: p.subjectReference,
        status: p.status,
        version: p.version,
        origin: p.origin,
        ruleTitle: p.ruleTitle,
        ruleVersion: p.ruleVersion,
        outcome: p.outcome,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      rationale: p.rationale!,
      followUp: p.followUp || '',
      incident: p.incident,
      ruleText: p.ruleText,
      similarity: 0.82,
    })),
    recommendation: {
      task_type: 'case_review',
      proposed_action: 'modify',
      summary:
        'Check the timing and clarity of the reminder before deciding whether the timeout was proportionate.',
      source_record_ids: [record.id, ...prior.map((p) => p.id)],
      comparisons: prior.map((p) => ({
        case_id: p.id,
        similarities:
          'Both cases concern a location spoiler and a request to review a timeout.',
        differences:
          'This case mentions an earlier reminder; the precedent used a different rule version and had no clear reminder.',
      })),
      evidence_gaps: ['Full chat context and timeout duration are missing.'],
      uncertainties: [
        'The viewer’s understanding cannot be established from these notes.',
      ],
      requires_human_approval: true,
      suggested_next_step:
        'Review the exact messages and rule version, then record your own decision.',
    },
  };
}
