import type { OpenLoop } from '../open-loops';
import { previewChannels } from './people';
const fixtureTime = '2026-10-28T12:00:00.000Z';
export const previewOpenLoops: (OpenLoop & { origin: 'demo_fixture' })[] = [
  {
    id: '00000000-0000-4000-8000-000000001001',
    channelId: previewChannels[0].id,
    wording: 'Finish the community island tour next stream.',
    ownerLabel: 'cozybyte',
    dueContext: 'Next stream',
    status: 'confirmed',
    version: 1,
    origin: 'demo_fixture',
    captureMethod: 'chat_command',
    createdAt: fixtureTime,
    updatedAt: fixtureTime,
    source: {
      excerpt: '!promise Finish the community island tour next stream.',
      originalAvailable: null,
    },
  },
  {
    id: '00000000-0000-4000-8000-000000001002',
    channelId: previewChannels[0].id,
    wording: 'Share the new emote sketches with chat.',
    ownerLabel: 'moss.jpeg',
    dueContext: 'Before Friday’s stream',
    status: 'in_progress',
    version: 2,
    origin: 'demo_fixture',
    captureMethod: 'dashboard',
    createdAt: fixtureTime,
    updatedAt: fixtureTime,
    source: {
      excerpt: 'Share the new emote sketches with chat.',
      originalAvailable: null,
    },
  },
];
