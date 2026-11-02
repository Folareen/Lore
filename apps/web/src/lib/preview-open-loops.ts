import type { OpenLoop, OpenLoopHistory, StreamBrief } from '@lore/shared';
const fixtureTime = '2026-10-28T12:00:00.000Z';
export { previewOpenLoops } from '@lore/shared';
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
          reason:
            loop.status === 'fulfilled'
              ? 'The demo team confirmed this work was completed.'
              : ['postponed', 'cancelled'].includes(loop.status)
                ? loop.source.excerpt
                : null,
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
  const changed = loops
    .filter((loop) => loop.channelId === channelId && loop.version > 1)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latest = Math.max(
    ...loops
      .filter((loop) => loop.channelId === channelId)
      .map((loop) => Date.parse(loop.updatedAt)),
  );
  const since = new Date(
    (Number.isFinite(latest) ? latest : Date.now()) - 7 * 86400000,
  ).toISOString();
  return {
    channelId,
    generatedAt: new Date().toISOString(),
    activeCount: items.length,
    items: items.slice(0, 20),
    method: 'saved_open_loops',
    context: {
      since,
      basis: 'recent_seven_days',
      recentChanges: changed
        .filter((loop) => loop.updatedAt >= since)
        .slice(0, 20)
        .map(({ id, wording, status, updatedAt }) => ({
          id,
          wording,
          status,
          updatedAt,
        })),
      community: [],
      truncated: changed.length > 20,
    },
  };
}
