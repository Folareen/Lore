import type { OpenLoop, OpenLoopHistory, StreamBrief } from '@lore/shared';
import { previewChannels } from './preview-data';
const fixtureTime = '2026-10-28T12:00:00.000Z';
export const previewOpenLoops: OpenLoop[] = [
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
export function fixtureHistory(loop: OpenLoop): OpenLoopHistory[] {
  const first: OpenLoopHistory = {
    version: 1,
    fromStatus: null,
    toStatus: 'confirmed',
    reason: null,
    actorTwitchUserId: '100',
    occurredAt: fixtureTime,
  };
  return loop.version === 1
    ? [first]
    : [
        first,
        {
          ...first,
          version: 2,
          fromStatus: 'confirmed',
          toStatus: loop.status,
        },
      ];
}
export function previewBrief(
  channelId: string,
  loops: OpenLoop[],
): StreamBrief {
  const items = loops.filter(
    (loop) =>
      loop.channelId === channelId &&
      ['confirmed', 'in_progress', 'postponed'].includes(loop.status),
  );
  const rank = { in_progress: 0, confirmed: 1, postponed: 2 };
  items.sort(
    (a, b) =>
      rank[a.status as keyof typeof rank] -
        rank[b.status as keyof typeof rank] ||
      Number(Boolean(b.dueContext)) - Number(Boolean(a.dueContext)) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  return {
    channelId,
    generatedAt: new Date().toISOString(),
    activeCount: items.length,
    items: items.slice(0, 20),
    method: 'saved_open_loops',
  };
}
