'use client';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, RefreshCw } from 'lucide-react';
import { openLoopLabels, type StreamBrief } from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
export function StreamBriefScreen() {
  const { selected, href } = useWorkspace();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Next-stream brief</h1>
          <p>Saved promises and source-linked changes for your next stream.</p>
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
  return (
    <div className="content-stack">
      <div className="list-toolbar">
        <p className="muted">
          Your saved promises, with in-progress work first.
        </p>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? 'Loading…' : 'Refresh brief'}
        </button>
      </div>
      {loading && <p role="status">Gathering your promises…</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {brief && (
        <>
          <p className="muted">
            {brief.activeCount} active{' '}
            {brief.activeCount === 1 ? 'promise' : 'promises'} · Updated{' '}
            {new Date(brief.generatedAt).toLocaleString()}
          </p>
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
            <ol className="brief-list">
              {brief.items.map((loop) => (
                <li key={loop.id} className="panel">
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
                    {loop.ownerLabel || 'Follow-up owner not set'} ·{' '}
                    {loop.dueContext || 'No due context set'}
                  </p>
                  <small className="muted">
                    {loop.origin === 'demo_fixture'
                      ? 'Demo fixture'
                      : loop.origin === 'live_twitch'
                        ? 'Live Twitch'
                        : 'Manual import'}{' '}
                    · Saved source: {loop.source.excerpt}
                  </small>
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
          {brief.context && (
            <section className="panel content-stack">
              <h2>
                Since{' '}
                {brief.context.basis === 'previous_stream_end'
                  ? 'the last stream ended'
                  : 'seven days ago'}
              </h2>
              <p className="muted">
                From {new Date(brief.context.since).toLocaleString()}. Only
                retained stream events can establish a previous-stream boundary.
              </p>
              <h3>Promise changes</h3>
              {brief.context.recentChanges.length ? (
                <ul>
                  {brief.context.recentChanges.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`${href('streamer')}${preview ? '&' : '?'}loop=${item.id}#loop-${item.id}`}
                      >
                        {item.wording}
                      </Link>{' '}
                      · {openLoopLabels[item.status]} ·{' '}
                      {new Date(item.updatedAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No saved promise changes in this period.</p>
              )}
              <h3>Published community developments</h3>
              {brief.context.community.length ? (
                <ul>
                  {brief.context.community.map((item) => (
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
              ) : (
                <p>
                  No currently published community developments in this period.
                </p>
              )}
              {brief.context.truncated && (
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
