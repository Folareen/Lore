import type { ManagedPublication, PublicEntry } from '@lore/shared';
export { previewPublications } from '@lore/shared';
export function previewPublicEntry(
  entry: ManagedPublication,
  all: ManagedPublication[],
): PublicEntry {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    body: entry.body,
    chatSummary: entry.chatSummary,
    clipId: entry.clipId ?? null,
    screenshot: entry.screenshot ?? null,
    publishedAt: entry.publishedAt!,
    sources: entry.sourceIds.flatMap((id) => {
      const r = all.find(
        (e) =>
          e.id === id &&
          e.channelId === entry.channelId &&
          e.status === 'published',
      );
      return r ? [{ id: r.id, title: r.title }] : [];
    }),
  };
}
