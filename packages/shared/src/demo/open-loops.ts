import type { OpenLoop } from '../open-loops';
import { previewChannels } from './people';
const fixtureTime = '2026-10-28T12:00:00.000Z';
const initialOpenLoops: (OpenLoop & { origin: 'demo_fixture' })[] = [
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

export const previewOpenLoops: (OpenLoop & { origin: 'demo_fixture' })[] = [
  ...initialOpenLoops,
  {
    ...initialOpenLoops[0],
    id: '00000000-0000-4000-8000-000000001003',
    wording: 'Publish the garden planting plan.',
    ownerLabel: 'pixel_pilot',
    dueContext: 'Before the garden opening',
    status: 'fulfilled',
    version: 2,
    captureMethod: 'ai_review',
    source: {
      excerpt: 'I will post the planting plan before the garden opens.',
      originalAvailable: null,
    },
    updatedAt: '2026-10-29T09:00:00.000Z',
  },
  {
    ...initialOpenLoops[0],
    id: '00000000-0000-4000-8000-000000001004',
    wording: 'Run the community photo walk.',
    dueContext: 'After the greenhouse reveal',
    status: 'postponed',
    version: 2,
    captureMethod: 'dashboard',
    source: {
      excerpt: 'Let’s move the photo walk until the greenhouse is finished.',
      originalAvailable: null,
    },
    updatedAt: '2026-10-29T09:15:00.000Z',
  },
  {
    ...initialOpenLoops[0],
    id: '00000000-0000-4000-8000-000000001005',
    wording: 'Host a late-night bonus stream.',
    dueContext: 'This week',
    status: 'cancelled',
    version: 2,
    captureMethod: 'dashboard',
    source: {
      excerpt: 'The bonus stream is cancelled so the team can rest.',
      originalAvailable: null,
    },
    updatedAt: '2026-10-29T09:30:00.000Z',
  },
];
