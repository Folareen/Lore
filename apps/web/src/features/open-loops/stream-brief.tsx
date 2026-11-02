'use client';
import { IconButton } from '../../components/icon-button';
import { formatDateTime } from '../../lib/date-time';
import { PageTitle } from '../../components/page-title';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, RefreshCw } from 'lucide-react';
import { openLoopLabels, type StreamBrief } from '@lore/shared';
import { useOptionalPublications } from '../publications/publications-context';
import { useWorkspace } from '../workspace/workspace-context';
export function StreamBriefScreen() {
  const { selected, href } = useWorkspace();
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>Next-stream brief</PageTitle>
          <p>
            Pick up where you left off. Your active promises and recent updates,
            in one place.
          </p>
        </div>
        <Link className="button secondary" href={href('streamer')}>
          Manage promises
        </Link>
      </div>
      {selected ? (
        <Brief key={selected.id} channelId={selected.id} />
      ) : (
        <div className="empty-state">
          <ListChecks size={30} />
          <h2>Choose a channel to see its brief.</h2>
          <Link className="button primary" href={href('overview')}>
            Go to your channels
          </Link>
        </div>
      )}
    </>
  );
}
function Brief({ channelId }: { channelId: string }) {
  const { loadBrief, href, preview } = useWorkspace();
  const publications = useOptionalPublications();
  const [brief, setBrief] = useState<StreamBrief>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useLiveRefresh(channelId, () => setRevision((value) => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setBrief(undefined);
    void loadBrief(channelId, controller.signal)
      .then((brief) => {
        if (!controller.signal.aborted) setBrief(brief);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not load your next-stream brief.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [channelId, loadBrief, revision]);
  const baseContext = brief?.context;
  const context =
    preview && baseContext
      ? {
          ...baseContext,
          community: (publications?.publicFeed(channelId).items ?? [])
            .filter(
              (entry) =>
                entry.kind !== 'summary' &&
                entry.publishedAt >= baseContext.since,
            )
            .slice(0, 20)
            .map(({ id, title, body, publishedAt }) => ({
              id,
              title,
              body,
              publishedAt,
            })),
        }
      : baseContext;
  return (
    <div className="content-stack">
      <div className="brief-toolbar">
        <p className="muted">
          {brief
            ? `${brief.activeCount} active ${brief.activeCount === 1 ? 'promise' : 'promises'}`
            : 'Your active promises'}
        </p>
        <IconButton
          label="Refresh brief"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </IconButton>
      </div>
      {loading && <p role="status">Gathering your promises…</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {brief && (
        <>
          {brief.items.length === 0 ? (
            <div className="empty-state">
              <ListChecks size={28} />
              <h2>A clear slate.</h2>
              <p>
                No confirmed, in-progress or postponed promises to bring into
                the next stream.
              </p>
              <Link className="button primary" href={href('streamer')}>
                Capture a promise
              </Link>
            </div>
          ) : (
            <ol className="brief-list" aria-label="Active promises">
              {brief.items.map((loop) => (
                <li key={loop.id} className="brief-record">
                  <span className="status purple">
                    {openLoopLabels[loop.status]}
                  </span>
                  <h2>
                    <Link
                      href={`${href('streamer')}${preview ? '&' : '?'}loop=${loop.id}#loop-${loop.id}`}
                    >
                      {loop.wording}
                    </Link>
                  </h2>
                  <p>
                    {[loop.ownerLabel, loop.dueContext]
                      .filter(Boolean)
                      .join(' · ') || 'Ready to plan'}
                  </p>
                  <details className="brief-source">
                    <summary>Saved source</summary>
                    <p className="muted">
                      {loop.origin === 'demo_fixture'
                        ? 'Demo fixture'
                        : loop.origin === 'live_twitch'
                          ? 'Live Twitch'
                          : 'Manual import'}{' '}
                      · {loop.source.excerpt}
                    </p>
                  </details>
                </li>
              ))}
            </ol>
          )}
          {brief.activeCount > brief.items.length && (
            <p className="notice">
              Showing the first {brief.items.length} promises.{' '}
              <Link href={href('streamer')}>See all promises</Link>.
            </p>
          )}
          {context && (
            <section className="panel content-stack brief-context">
              <h2>
                {preview ? (
                  'Recent sample activity'
                ) : (
                  <>
                    Since{' '}
                    {context.basis === 'previous_stream_end'
                      ? 'the last stream ended'
                      : 'seven days ago'}
                  </>
                )}
              </h2>
              <p className="muted">From {formatDateTime(context.since)}.</p>
              {!context.recentChanges.length && !context.community.length && (
                <p className="muted">
                  No new promise changes or public stories in this period.
                </p>
              )}
              {context.recentChanges.length > 0 && (
                <>
                  <h3>Promise changes</h3>
                  <ul aria-label="Recent promise changes">
                    {context.recentChanges.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`${href('streamer')}${preview ? '&' : '?'}loop=${item.id}#loop-${item.id}`}
                        >
                          {item.wording}
                        </Link>{' '}
                        · {openLoopLabels[item.status]} ·{' '}
                        {formatDateTime(item.updatedAt)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {context.community.length > 0 && (
                <>
                  <h3>Community updates</h3>
                  <ul aria-label="Recent community stories">
                    {context.community.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={
                            preview
                              ? `${href('community')}&entry=${item.id}`
                              : `${href('community')}/entries/${item.id}`
                          }
                        >
                          {item.title}
                        </Link>
                        <p className="case-prose">{item.body}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {context.truncated && (
                <p className="notice">
                  Showing up to 20 promise changes and 10 public developments.
                  Open the source pages for more.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
