import type { Candidate } from '@lore/shared';
import { previewChannels } from './preview-data';
export const previewCandidates: Candidate[] = [
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
