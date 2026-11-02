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
export const demoScreenshotAssets: Readonly<Record<string, string>> = {
  '00000000-0000-4000-8000-000000007101': '/illustrations/memory-party.png',
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
    screenshot: {
      id: '00000000-0000-4000-8000-000000007101',
      alt: 'Demo community illustration — a sample attachment, not captured stream footage',
    },
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
  {
    ...base,
    id: '00000000-0000-4000-8000-000000007005',
    kind: 'milestone',
    title: 'Try a Twitch clip',
    body: 'This external clip is the example used in Twitch’s embed documentation. Load it to try the player, or open it on Twitch. It is not footage from this fictional demo community.',
    clipId: 'IncredulousAbstemiousFennelImGlitch',
  },
  {
    ...base,
    id: '00000000-0000-4000-8000-000000007006',
    kind: 'story',
    title: 'Help name the garden pond',
    body: 'The next community garden stream will include a pond-naming vote. Bring your best cozy name; the streamer will explain the choices on stream.',
    status: 'draft',
    version: 1,
    approvedByTwitchUserId: null,
    publishedAt: null,
  },
  {
    ...base,
    id: '00000000-0000-4000-8000-000000007007',
    kind: 'commitment',
    title: 'Photo walk postponed until the greenhouse is ready',
    body: 'The community photo walk is postponed. We will share a new plan after the greenhouse reveal.',
    promiseId: '00000000-0000-4000-8000-000000001004',
  },
  {
    ...base,
    id: '00000000-0000-4000-8000-000000007008',
    kind: 'story',
    title: 'Old bonus-stream announcement',
    body: 'This sample announcement was withdrawn when the bonus stream was cancelled. It is visible only in the publishing workspace.',
    status: 'unpublished',
    version: 3,
  },
];
