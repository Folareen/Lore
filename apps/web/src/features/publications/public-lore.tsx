'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  publicFeedSchema,
  publicCatchupSchema,
  publicEntrySchema,
} from '@lore/shared';
import { apiRequest } from '../../lib/api';
export const publicEntryResponseSchema = z.strictObject({
  channel: publicFeedSchema.shape.channel,
  entry: publicEntrySchema,
});
export {
  PublicShell,
  PublishedAt,
  SourceLinks,
  EntryCard,
  publicationLabels,
} from './public-content';
import { CommunityContent, type PublicView } from './public-content';
export function PublicReader({
  initial,
  query = '',
}: {
  initial: PublicView;
  query?: string;
}) {
  const [view, setView] = useState<PublicView | null>(initial),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const slug = initial.data.channel.slug;
  const endpoint = `/public/channels/${encodeURIComponent(slug)}`;
  async function refresh(signal?: AbortSignal) {
    const sequence = ++requestSequence.current;
    try {
      const next: PublicView =
        initial.mode === 'feed'
          ? {
              mode: 'feed',
              data: await apiRequest(`${endpoint}?${query}`, publicFeedSchema, {
                signal,
              }),
            }
          : initial.mode === 'catchup'
            ? {
                mode: 'catchup',
                data: await apiRequest(
                  `${endpoint}/catch-up`,
                  publicCatchupSchema,
                  { signal },
                ),
              }
            : {
                mode: 'entry',
                data: await apiRequest(
                  `${endpoint}/entries/${initial.data.entry.id}`,
                  publicEntryResponseSchema,
                  { signal },
                ),
              };
      if (!signal?.aborted && sequence === requestSequence.current) {
        setView(next);
        setError('');
      }
    } catch (e) {
      if (!signal?.aborted && sequence === requestSequence.current) {
        setView(null);
        setError(
          e instanceof Error
            ? e.message
            : 'This community page is unavailable.',
        );
      }
    }
  }
  useEffect(() => {
    const c = new AbortController();
    void refresh(c.signal);
    const timer = setInterval(() => void refresh(c.signal), 30000);
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh(c.signal);
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      c.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [slug, initial.mode, query, revision]);
  const link = (id: string) => `/c/${slug}/entries/${id}`;
  return (
    <div className="content-stack">
      {error && (
        <div className="panel">
          <p className="notice error" role="alert">
            {error}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((r) => r + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {view && (
        <CommunityContent
          view={view}
          query={query}
          link={link}
          feedHref={`/c/${slug}`}
          catchupHref={`/c/${slug}/catch-up`}
          busy={busy}
          onMore={
            view.mode === 'feed'
              ? () => {
                  setBusy(true);
                  const sequence = ++requestSequence.current;
                  const params = new URLSearchParams(query);
                  params.set('cursor', view.data.nextCursor!);
                  void apiRequest(`${endpoint}?${params}`, publicFeedSchema)
                    .then((page) => {
                      if (sequence !== requestSequence.current) return;
                      setView((current) =>
                        current?.mode === 'feed'
                          ? {
                              mode: 'feed',
                              data: {
                                ...page,
                                items: [...current.data.items, ...page.items],
                              },
                            }
                          : current,
                      );
                    })
                    .catch((e: unknown) => {
                      if (sequence !== requestSequence.current) return;
                      setView(null);
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Could not load more entries.',
                      );
                    })
                    .finally(() => setBusy(false));
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
