'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import {
  publicFeedSchema,
  publicCatchupSchema,
  publicEntrySchema,
  type PublicFeed,
  type PublicCatchup,
  type PublicEntry,
} from '@lore/shared';
import { apiRequest } from '../../lib/api';
import { Brand } from '../../components/brand';
import { Avatar } from '../../components/avatar';
import { ThemeToggle } from '../../components/theme-control';
export const publicEntryResponseSchema = z.strictObject({
  channel: publicFeedSchema.shape.channel,
  entry: publicEntrySchema,
});
export const publicationLabels = {
  milestone: 'Milestone',
  reference: 'Inside reference',
  story: 'Ongoing story',
  commitment: 'Commitment update',
  summary: 'Catch-up summary',
} as const;
type PublicView =
  | { mode: 'feed'; data: PublicFeed }
  | { mode: 'catchup'; data: PublicCatchup }
  | { mode: 'entry'; data: z.infer<typeof publicEntryResponseSchema> };
export function PublicShell({
  slug,
  name,
  children,
}: {
  slug: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="community-shell">
      <header className="community-header">
        <Brand />
        <div className="button-row">
          <Link href={`/c/${slug}`} prefetch={false}>
            Community Lore
          </Link>
          <Link href={`/c/${slug}/catch-up`} prefetch={false}>
            Catch up
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content">
        <div className="community-identity">
          <Avatar name={name} size={44} />
          <div>
            <strong>{name}</strong>
            <p className="muted">The stories this community chose to share.</p>
          </div>
        </div>
        {children}
      </main>
      <footer className="community-footer">
        Your community, caught up. <Link href="/">Made with Lore</Link>
      </footer>
    </div>
  );
}
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
        <>
          {view.mode === 'feed' ? (
            <>
              <div className="community-heading">
                <h1>The stories so far.</h1>
                <p>
                  Milestones, inside references, and the stories worth bringing
                  along.
                </p>
                <Link
                  className="button primary"
                  href={`/c/${slug}/catch-up`}
                  prefetch={false}
                >
                  New here? Catch up
                </Link>
              </div>
              <form className="community-search" method="GET">
                <label className="field">
                  Search public Lore
                  <input
                    name="q"
                    maxLength={100}
                    defaultValue={new URLSearchParams(query).get('q') ?? ''}
                    placeholder="A moment, a story, a chat reference…"
                  />
                </label>
                <label className="field">
                  Show
                  <select
                    name="kind"
                    defaultValue={new URLSearchParams(query).get('kind') ?? ''}
                  >
                    <option value="">All updates</option>
                    {Object.entries(publicationLabels).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button secondary">Find context</button>
              </form>
              {!view.data.items.length && (
                <p className="notice">
                  No published entries match this search.
                </p>
              )}
              {view.data.items.map((entry) => (
                <EntryCard key={entry.id} entry={entry} href={link(entry.id)} />
              ))}
              {view.data.nextCursor && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
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
                  }}
                >
                  More community stories
                </button>
              )}
            </>
          ) : view.mode === 'catchup' ? (
            <>
              <div className="community-heading community-welcome">
                <div>
                  <h1>You can join the story from here.</h1>
                  <p>
                    A short recap, a few familiar references, and a seat for you
                    in chat.
                  </p>
                </div>
                <img
                  src="/illustrations/memory-party.png"
                  alt=""
                  width={270}
                  height={180}
                />
              </div>
              {view.data.summary ? (
                <article className="panel content-stack community-recap">
                  <h2>{view.data.summary.title}</h2>
                  <p className="case-prose">{view.data.summary.body}</p>
                  <PublishedAt entry={view.data.summary} />
                  <SourceLinks entry={view.data.summary} link={link} />
                </article>
              ) : (
                <div className="panel">
                  <h2>No catch-up summary published yet.</h2>
                  <p>Browse the community’s approved updates below.</p>
                </div>
              )}
              <h2>A few things to know</h2>
              {!view.data.recent.length && (
                <p className="notice">
                  No other community updates are published yet.
                </p>
              )}
              {view.data.recent.map((entry) => (
                <EntryCard key={entry.id} entry={entry} href={link(entry.id)} />
              ))}
              <Link className="text-link" href={`/c/${slug}`} prefetch={false}>
                Explore all public Lore
              </Link>
            </>
          ) : (
            <article className="panel content-stack">
              <p className="record-meta">
                {publicationLabels[view.data.entry.kind]}
              </p>
              <h1>{view.data.entry.title}</h1>
              <PublishedAt entry={view.data.entry} />
              <p className="case-prose">{view.data.entry.body}</p>
              <SourceLinks entry={view.data.entry} link={link} />
              <Link className="text-link" href={`/c/${slug}`} prefetch={false}>
                Back to Community Lore
              </Link>
            </article>
          )}
        </>
      )}
    </div>
  );
}
export function PublishedAt({ entry }: { entry: PublicEntry }) {
  return (
    <p className="muted">
      <time dateTime={entry.publishedAt}>
        Published {new Date(entry.publishedAt).toISOString().slice(0, 10)} · UTC
      </time>
    </p>
  );
}
export function SourceLinks({
  entry,
  link,
}: {
  entry: PublicEntry;
  link: (id: string) => string;
}) {
  return entry.sources.length ? (
    <section>
      <h3>More context</h3>
      <ul>
        {entry.sources.map((s) => (
          <li key={s.id}>
            <Link className="text-link" href={link(s.id)} prefetch={false}>
              {s.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
export function EntryCard({
  entry,
  href,
}: {
  entry: PublicEntry;
  href: string;
}) {
  return (
    <article className="panel community-entry">
      <p className="record-meta">{publicationLabels[entry.kind]}</p>
      <h2>
        <Link href={href} prefetch={false}>
          {entry.title}
        </Link>
      </h2>
      <p className="case-prose">
        {Array.from(entry.body).slice(0, 240).join('')}
        {entry.body.length > 240 ? '…' : ''}
      </p>
      <PublishedAt entry={entry} />
    </article>
  );
}
