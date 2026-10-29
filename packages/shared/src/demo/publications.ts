import type { ManagedPublication } from '../publications';
import { previewChannels } from './people';
const time = '2026-10-29T10:00:00.000Z';
const base = {
  channelId: previewChannels[0].id,
  promiseId: null,
  status: 'published' as const,
  version: 2,
  approvedByTwitchUserId: '100',
  publishedAt: time,
  createdAt: time,
  updatedAt: time,
  chatSummary: '',
  sourceIds: [],
};
export const previewPublications: ManagedPublication[] = [
  {
    ...base,
    id: '00000000-0000-4000-8000-000000007001',
    kind: 'reference',
    title: 'What is the moss club?',
    body: 'A cozy nickname chat gave the crew during our forest-building streams. No membership needed — if you are here, you are in.',
  },
  {
    ...base,
    id: '00000000-0000-4000-8000-000000007002',
    kind: 'milestone',
    title: 'The community garden is open',
    body: 'Chat picked the first three plants for our little in-game garden. Next stream, we will name the pond together.',
  },
  {
    ...base,
    id: '00000000-0000-4000-8000-000000007003',
    kind: 'summary',
    title: 'Previously, in our corner of chat…',
    body: 'We opened the community garden, let chat pick the first plants, and welcomed the moss club. Coming next: naming the pond together. New here? The moss club is just our cozy nickname for the crew.',
    chatSummary:
      'The community garden is open! Chat picked the first plants. Next up: naming the pond together.',
    sourceIds: [
      '00000000-0000-4000-8000-000000007001',
      '00000000-0000-4000-8000-000000007002',
    ],
  },
];
