'use client';
import { Select } from '../../components/select';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, RefreshCw } from 'lucide-react';
import {
  openLoopLabels,
  openLoopStatusSchema,
  openLoopTransitions,
  transitionOpenLoopSchema,
  type OpenLoop,
  type OpenLoopHistory,
  type OpenLoopStatus,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { QuickCapture } from './quick-capture';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function OpenLoopsScreen({ focusId }: { focusId?: string }) {
  const { selected, href } = useWorkspace();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Promises</h1>
          <p>Keep track of what you said you’d do.</p>
        </div>
        <Link className="button secondary" href={href('brief')}>
          Next-stream brief
        </Link>
      </div>
      {selected ? (
        <LoopsPanel
          key={selected.id}
          channelId={selected.id}
          connected={selected.connected}
          focusId={focusId}
        />
      ) : (
        <div className="empty-state">
          <Bookmark size={30} />
          <h2>Choose your community first.</h2>
          <p>Connect a channel to start capturing promises.</p>
          <Link className="button primary" href={href('overview')}>
            Go to your channels
          </Link>
        </div>
      )}
    </>
  );
}
function LoopsPanel({
  channelId,
  connected,
  focusId,
}: {
  channelId: string;
  connected: boolean;
  focusId?: string;
}) {
  const { loadLoops, loadLoop } = useWorkspace();
  const [items, setItems] = useState<OpenLoop[]>([]);
  const [filter, setFilter] = useState<OpenLoopStatus | 'all'>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useLiveRefresh(channelId, () => setRevision((value) => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setItems([]);
    setCursor(null);
    void loadLoops(
      channelId,
      { ...(filter === 'all' ? {} : { status: filter }) },
      controller.signal,
    )
      .then(async (page) => {
        if (
          filter === 'all' &&
          focusId &&
          !page.items.some((item) => item.id === focusId)
        ) {
          const focused = await loadLoop(channelId, focusId, controller.signal);
          page = { ...page, items: [focused, ...page.items] };
        }
        if (!controller.signal.aborted) {
          setItems(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : 'Could not load promises.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [channelId, filter, focusId, loadLoops, loadLoop, revision]);
  async function more() {
    if (!cursor) return;
    setBusy(true);
    setError('');
    try {
      const page = await loadLoops(channelId, {
        ...(filter === 'all' ? {} : { status: filter }),
        cursor,
      });
      setItems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not load more promises.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-stack">
      <details className="task-disclosure new-promise" id="new-promise">
        <summary>New promise</summary>
        <QuickCapture
          channelId={channelId}
          disabled={!connected}
          onCreated={(loop) => {
            if (filter !== 'all' && filter !== 'confirmed') setFilter('all');
            else
              setItems((current) => [
                loop,
                ...current.filter((item) => item.id !== loop.id),
              ]);
          }}
        />
        <section className="promise-guide">
          <Bookmark size={21} aria-hidden="true" />
          <p>
            With live capture on, the broadcaster and Twitch moderators can use{' '}
            <code>!promise your commitment</code> to save a confirmed promise.
          </p>
        </section>
      </details>
      <div className="promise-toolbar">
        <div className="field">
          <label htmlFor="promise-filter">Show promises</label>
          <Select
            id="promise-filter"
            value={filter}
            onValueChange={(event) =>
              setFilter(event as OpenLoopStatus | 'all')
            }
            disabled={busy}
          >
            <option value="all">All statuses</option>
            {openLoopStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {openLoopLabels[status]}
              </option>
            ))}
          </Select>
        </div>
        <button
          className="button secondary"
          aria-label="Refresh promises"
          disabled={loading || busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      </div>
      {loading && <p role="status">Loading your promises…</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <Bookmark size={28} />
          <h2>No promises here yet.</h2>
          <p>
            {filter === 'candidate'
              ? 'AI suggestions stay in Suggestions until you confirm them.'
              : 'Choose New promise to save a commitment, or try another status.'}
          </p>
        </div>
      )}
      {items.map((loop) => (
        <OpenLoopCard
          key={`${loop.id}-${loop.version}`}
          loop={loop}
          disabled={!connected || busy}
          onUpdated={(updated) =>
            setItems((current) =>
              current
                .map((item) => (item.id === updated.id ? updated : item))
                .filter((item) => filter === 'all' || item.status === filter),
            )
          }
        />
      ))}
      {cursor && (
        <div>
          <button
            className="button secondary"
            disabled={busy || loading}
            onClick={() => void more()}
          >
            {busy ? 'Loading…' : 'Load more promises'}
          </button>
        </div>
      )}
    </div>
  );
}
function OpenLoopCard({
  loop,
  disabled,
  onUpdated,
}: {
  loop: OpenLoop;
  disabled: boolean;
  onUpdated: (loop: OpenLoop) => void;
}) {
  const { transitionLoop, loadLoopHistory, href, preview } = useWorkspace();
  const next = openLoopTransitions[loop.status];
  const [target, setTarget] = useState<OpenLoopStatus | ''>(next[0] || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState<OpenLoopHistory[]>();
  async function update() {
    const parsed = transitionOpenLoopSchema.safeParse({
      status: target,
      expectedVersion: loop.version,
      ...(reason.trim() ? { reason } : {}),
    });
    if (!parsed.success) {
      setError('Add a reason before completing or cancelling this promise.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onUpdated(await transitionLoop(loop.channelId, loop, parsed.data));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not update this promise.',
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  async function showHistory() {
    setBusy(true);
    setError('');
    try {
      setHistory(await loadLoopHistory(loop.channelId, loop.id));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not load promise history.',
      );
    } finally {
      setBusy(false);
    }
  }
  const terminal = target === 'fulfilled' || target === 'cancelled';
  return (
    <article
      id={`loop-${loop.id}`}
      className="panel promise-card"
      aria-label={loop.wording}
    >
      <div className="promise-meta">
        <span
          className={`status ${loop.status === 'fulfilled' ? '' : 'purple'}`}
        >
          {openLoopLabels[loop.status]}
        </span>
        <small>
          {loop.origin === 'demo_fixture'
            ? 'Demo fixture'
            : loop.origin === 'live_twitch'
              ? 'Live Twitch'
              : 'Saved in Lore'}{' '}
          ·{' '}
          {loop.captureMethod === 'ai_review'
            ? 'AI-reviewed capture'
            : loop.captureMethod === 'chat_command'
              ? 'Chat command'
              : 'Manual entry'}
        </small>
      </div>
      <h2 className="promise-wording">{loop.wording}</h2>
      {(loop.ownerLabel || loop.dueContext) && (
        <p className="muted">
          {[
            loop.ownerLabel ? `Following up: ${loop.ownerLabel}` : '',
            loop.dueContext,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {loop.status !== 'candidate' && !disabled && (
        <Link
          className="text-link promise-publish-link"
          href={`${href('publications')}${preview ? '&' : '?'}promise=${loop.id}&channel=${loop.channelId}#publication-draft`}
        >
          Create public story →
        </Link>
      )}
      <details className="promise-source">
        <summary>Source and history</summary>
        <p className="muted">Retained source excerpt</p>
        <blockquote>{loop.source.excerpt}</blockquote>
        {loop.source.originalAvailable === false && (
          <p className="notice">
            The original chat source was removed or expired. The excerpt kept
            with this confirmed promise remains available to your team.
          </p>
        )}
        <button
          className="button secondary compact"
          disabled={busy}
          onClick={() => void showHistory()}
        >
          {busy ? 'Loading…' : 'Load history'}
        </button>
        {history && (
          <ol className="promise-history">
            {history.map((entry) => (
              <li key={entry.version}>
                <strong>{openLoopLabels[entry.toStatus]}</strong>
                <span>
                  Twitch user {entry.actorTwitchUserId} ·{' '}
                  {new Date(entry.occurredAt).toLocaleString()}
                </span>
                {entry.reason && <p>{entry.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </details>
      {next.length > 0 && (
        <details className="promise-update">
          <summary>Change status</summary>
          <form
            className="promise-transition"
            onSubmit={(event) => {
              event.preventDefault();
              if (target === 'cancelled' && reason.trim()) setConfirm(true);
              else void update();
            }}
          >
            <div className="field">
              <label htmlFor={`status-${loop.id}`}>Next status</label>
              <Select
                id={`status-${loop.id}`}
                value={target}
                onValueChange={(event) => setTarget(event as OpenLoopStatus)}
                disabled={busy || disabled}
              >
                {next.map((status) => (
                  <option key={status} value={status}>
                    {openLoopLabels[status]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="field">
              <label htmlFor={`reason-${loop.id}`}>
                {terminal ? 'Reason (required)' : 'Update note (optional)'}
              </label>
              <textarea
                id={`reason-${loop.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required={terminal}
                maxLength={2000}
                rows={2}
                disabled={busy || disabled}
              />
            </div>
            <div>
              <button className="button secondary" disabled={busy || disabled}>
                {busy ? 'Updating…' : 'Update promise'}
              </button>
            </div>
          </form>
        </details>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          title="Cancel this promise?"
          confirmLabel="Cancel promise"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void update()}
        >
          <p>{reason}</p>
          <p>The wording and this reason stay in your team’s history.</p>
        </ConfirmDialog>
      )}
    </article>
  );
}
