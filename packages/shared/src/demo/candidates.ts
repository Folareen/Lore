import type { Candidate } from '../ai';
import { previewChannels } from './people';
const initialCandidates: (Candidate & { origin: 'demo_fixture' })[] = [
  {
    id: '00000000-0000-4000-8000-000000002001',
    channelId: previewChannels[0].id,
    status: 'pending',
    version: 1,
    origin: 'demo_fixture',
    provider: 'gemini',
    model: 'demo fixture',
    createdAt: '2026-10-28T12:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    source: {
      id: 'demo-chat-1',
      text: 'I’ll share the cozy games list after the stream, remind me!',
      available: true,
    },
    draft: {
      task_type: 'commitment',
      summary: 'Share the cozy games list after the stream.',
      source_record_ids: ['demo-chat-1'],
      source_quote: 'I’ll share the cozy games list after the stream',
      evidence_gaps: ['The destination for the list was not specified.'],
      uncertainties: [
        'Confirm that this was a real commitment rather than a passing idea.',
      ],
      requires_human_approval: true,
      suggested_next_step: 'Check the context and choose who will follow up.',
    },
    reviewedByTwitchUserId: null,
    reviewedAt: null,
    reviewReason: null,
    confirmedOpenLoopId: null,
  },
];

export const previewCandidates: (Candidate & { origin: 'demo_fixture' })[] = [
  ...initialCandidates,
  {
    ...initialCandidates[0],
    id: '00000000-0000-4000-8000-000000002002',
    source: {
      id: 'demo-chat-2',
      text: 'Next stream we can ask chat to name the pond.',
      available: true,
    },
    draft: {
      ...initialCandidates[0].draft!,
      task_type: 'announcement',
      summary: 'Invite chat to name the garden pond next stream.',
      source_record_ids: ['demo-chat-2'],
      source_quote: 'Next stream we can ask chat to name the pond',
      uncertainties: [
        'This sounds like a proposal; confirm the plan before saving it.',
      ],
    },
  },
  {
    ...initialCandidates[0],
    id: '00000000-0000-4000-8000-000000002003',
    status: 'confirmed',
    version: 2,
    source: {
      id: 'demo-chat-3',
      text: 'I will post the planting plan before the garden opens.',
      available: true,
    },
    draft: {
      ...initialCandidates[0].draft!,
      summary: 'Publish the garden planting plan.',
      source_record_ids: ['demo-chat-3'],
      source_quote: 'I will post the planting plan before the garden opens',
      evidence_gaps: [],
      uncertainties: [],
    },
    reviewedByTwitchUserId: '100',
    reviewedAt: '2026-10-28T13:00:00.000Z',
    reviewReason: 'Confirmed with the team; pixel_pilot will share the plan.',
    confirmedOpenLoopId: '00000000-0000-4000-8000-000000001003',
  },
  {
    ...initialCandidates[0],
    id: '00000000-0000-4000-8000-000000002004',
    status: 'dismissed',
    version: 2,
    source: {
      id: 'demo-chat-4',
      text: 'Imagine if we rebuilt the whole island overnight!',
      available: true,
    },
    draft: {
      ...initialCandidates[0].draft!,
      summary: 'Rebuild the island overnight.',
      source_record_ids: ['demo-chat-4'],
      source_quote: 'Imagine if we rebuilt the whole island overnight',
      uncertainties: ['The wording is hypothetical.'],
    },
    reviewedByTwitchUserId: '200',
    reviewedAt: '2026-10-28T14:00:00.000Z',
    reviewReason: 'A playful hypothetical, not a commitment.',
  },
  {
    ...initialCandidates[0],
    id: '00000000-0000-4000-8000-000000002005',
    status: 'expired',
    version: 2,
    draft: null,
    source: { id: 'demo-chat-expired', text: null, available: false },
    expiresAt: '2026-10-28T15:00:00.000Z',
  },
];
