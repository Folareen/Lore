'use client';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SummaryGenerator } from '../continuity/summary-generator';
import { z } from 'zod';
import {
  createPublicationSchema,
  summaryDraftSchema,
  editPublicationSchema,
  publicationActionSchema,
  publicationHistorySchema,
  catchupSettingsSchema,
  type ManagedPublication,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { usePublications } from './publications-context';
import { PublicationForm } from './publication-form';
import { publicationLabels } from './public-lore';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function PublicationsScreen() {
  const { selected } = useWorkspace();
  return selected ? (
    <PublishingDesk key={selected.id} />
  ) : (
    <p className="notice">Connect a channel to prepare Community Lore.</p>
  );
}
function PublishingDesk() {
  const api = usePublications(),
    { selected, preview, href } = useWorkspace();
  const channelId = selected!.id,
    reviewer = selected!.role !== 'team';
  const [rows, setRows] = useState<ManagedPublication[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [filter, setFilter] = useState('all'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [creating, setCreating] = useState(false),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [suggested, setSuggested] =
    useState<z.infer<typeof summaryDraftSchema>>();
  const refresh = () => setRevision((v) => v + 1);
  useLiveRefresh(channelId, () => setRevision((value) => value + 1));
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    void api
      .list(
        channelId,
        filter === 'all'
          ? {}
          : {
              status: z
                .enum(['draft', 'published', 'unpublished'])
                .parse(filter),
            },
        c.signal,
      )
      .then((p) => {
        if (!c.signal.aborted) {
          setRows(p.items);
          setCursor(p.nextCursor);
        }
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted) {
          setRows([]);
          setError(
            e instanceof Error ? e.message : 'Could not load publishing.',
          );
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [channelId, filter, revision]);
  return (
    <div className="content-stack">
      <div className="page-heading">
        <div>
          <h1>Community publishing</h1>
          <p>Prepare stories and recaps, then review them before publishing.</p>
        </div>
        <Link
          className="button secondary"
          href={preview ? href('community') : `/c/${selected!.slug}`}
          prefetch={false}
        >
          {preview ? 'Preview as a visitor' : 'Open public page'}
        </Link>
      </div>
      {!selected!.connected && (
        <p className="notice">
          Disconnected · public pages are unavailable. You can still withdraw or
          delete saved entries.
        </p>
      )}
      {!reviewer && (
        <p className="notice">
          You can prepare drafts. An owner or moderator reviews and publishes
          them.
        </p>
      )}
      <SummaryGenerator
        onUse={(draft) => {
          setSuggested(draft);
          setRequestId(crypto.randomUUID());
          setCreating(true);
        }}
      />
      <div className="button-row">
        <button
          className="button primary"
          disabled={!selected!.connected}
          onClick={() => {
            setSuggested(undefined);
            setRequestId(crypto.randomUUID());
            setCreating(true);
          }}
        >
          New community draft
        </button>
        <label className="field">
          Publication status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All entries</option>
            <option value="draft">Drafts</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </select>
        </label>
        <button
          className="button secondary"
          onClick={refresh}
          disabled={loading}
        >
          Refresh entries
        </button>
      </div>
      {creating && (
        <PublicationForm
          key={requestId}
          suggested={suggested}
          onCancel={() => setCreating(false)}
          onSave={async (fields) => {
            await api.create(
              channelId,
              createPublicationSchema.parse({ ...fields, requestId }),
            );
            setCreating(false);
            refresh();
          }}
        />
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading community entries…</p>}
      {!loading && !error && !rows.length && (
        <div className="panel">
          <h2>No community entries yet.</h2>
          <p>
            Start with a moment, a recurring chat reference, or a short catch-up
            summary.
          </p>
        </div>
      )}
      {!loading &&
        rows.map((r) => (
          <PublicationCard
            key={`${r.id}-${r.version}`}
            record={r}
            canReview={reviewer}
            connected={selected!.connected}
            onChanged={refresh}
          />
        ))}
      {cursor && (
        <button
          className="button secondary"
          onClick={() => {
            setLoading(true);
            void api
              .list(channelId, {
                ...(filter === 'all'
                  ? {}
                  : {
                      status: z
                        .enum(['draft', 'published', 'unpublished'])
                        .parse(filter),
                    }),
                cursor,
              })
              .then((p) => {
                setRows((s) => [...s, ...p.items]);
                setCursor(p.nextCursor);
              })
              .catch((e: unknown) =>
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Could not load more entries.',
                ),
              )
              .finally(() => setLoading(false));
          }}
        >
          Load older entries
        </button>
      )}
      {selected!.role === 'owner' && <CatchupSettings key={channelId} />}
    </div>
  );
}
function PublicationCard({
  record: r,
  canReview,
  connected,
  onChanged,
}: {
  record: ManagedPublication;
  canReview: boolean;
  connected: boolean;
  onChanged: () => void;
}) {
  const api = usePublications();
  const [editing, setEditing] = useState(false),
    [action, setAction] = useState<'publish' | 'unpublish' | 'delete' | null>(
      null,
    ),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [history, setHistory] = useState<
      z.infer<typeof publicationHistorySchema>[] | null
    >(null);
  return (
    <article className="panel content-stack" aria-label={r.title}>
      <div className="panel-title">
        <p className="record-meta">{publicationLabels[r.kind]}</p>
        <span className="status purple">{r.status}</span>
      </div>
      <h2>{r.title}</h2>
      <p className="case-prose">{r.body}</p>
      {r.kind === 'summary' && (
        <div className="candidate-source">
          <h3>Short chat wording</h3>
          <p className="case-prose">{r.chatSummary}</p>
        </div>
      )}
      <p className="muted">
        v{r.version}
        {r.publishedAt
          ? ` · Published ${new Date(r.publishedAt).toLocaleString()} by Twitch user ${r.approvedByTwitchUserId}`
          : ' · Private until publication review'}
        {r.sourceIds.length ? ` · ${r.sourceIds.length} public citations` : ''}
        {r.promiseId ? ' · Private promise drafting source' : ''}
      </p>
      {editing ? (
        <PublicationForm
          initial={r}
          onCancel={() => setEditing(false)}
          onSave={async (fields) => {
            await api.edit(
              r,
              editPublicationSchema.parse({
                ...fields,
                expectedVersion: r.version,
              }),
            );
            setEditing(false);
            onChanged();
          }}
        />
      ) : (
        <div className="button-row">
          <button
            className="button secondary"
            disabled={!connected || (r.status === 'published' && !canReview)}
            onClick={() => setEditing(true)}
          >
            Edit to draft
          </button>
          {canReview && r.status !== 'published' && (
            <button
              className="button primary"
              disabled={!connected}
              onClick={() => {
                setReason('');
                setError('');
                setAction('publish');
              }}
            >
              Review for publication
            </button>
          )}
          {canReview && r.status === 'published' && (
            <button
              className="button secondary"
              onClick={() => {
                setReason('');
                setError('');
                setAction('unpublish');
              }}
            >
              Unpublish
            </button>
          )}
          {(canReview || r.status === 'draft') && (
            <button
              className="button danger"
              onClick={() => {
                setReason('');
                setError('');
                setAction('delete');
              }}
            >
              Delete entry
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => {
              setError('');
              void api
                .history(r)
                .then(setHistory)
                .catch((e: unknown) =>
                  setError(
                    e instanceof Error ? e.message : 'Could not load history.',
                  ),
                );
            }}
          >
            Review history
          </button>
        </div>
      )}
      {error && !action && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {history && (
        <ol className="case-history">
          {history.map((h) => (
            <li key={h.id}>
              <strong>{h.action.replaceAll('_', ' ')}</strong> · v{h.version}
              <p className="muted">
                Twitch user {h.actorTwitchUserId} ·{' '}
                {new Date(h.occurredAt).toLocaleString()}
              </p>
              {h.reason && <p className="case-prose">{h.reason}</p>}
            </li>
          ))}
        </ol>
      )}
      {action && (
        <ConfirmDialog
          title={
            action === 'publish'
              ? 'Publish this exact wording?'
              : action === 'delete'
                ? 'Delete this community entry?'
                : 'Withdraw this entry?'
          }
          confirmLabel={
            action === 'publish'
              ? 'Approve & publish'
              : action === 'delete'
                ? 'Delete community entry'
                : 'Withdraw community entry'
          }
          busy={busy}
          onCancel={() => setAction(null)}
          onConfirm={() => {
            if (!reason.trim()) {
              setError('Record a review reason first.');
              return;
            }
            setBusy(true);
            setError('');
            void api
              .action(
                r,
                publicationActionSchema.parse({
                  expectedVersion: r.version,
                  action,
                  reason,
                }),
              )
              .then(() => {
                setAction(null);
                onChanged();
              })
              .catch((e: unknown) =>
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Could not save this review.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <h3>{r.title}</h3>
          <p className="case-prose">{r.body}</p>
          {r.chatSummary && (
            <p className="case-prose">
              <strong>Chat reply:</strong> {r.chatSummary}
            </p>
          )}
          <p>
            {action === 'publish'
              ? 'Visitors can read and copy this text. Confirm it contains only information your community agreed to share.'
              : action === 'delete'
                ? 'The entry’s text will be cleared. Dependent summaries will be withdrawn for review. This cannot be undone.'
                : 'This entry and any dependent published summaries will leave public pages and future catch-up replies.'}
          </p>
          {r.sourceIds.length > 0 && (
            <p>
              Confirm the {r.sourceIds.length} selected public sources still
              support this wording.
            </p>
          )}
          <label className="field">
            Publication review reason
            <textarea
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </article>
  );
}
function CatchupSettings() {
  const api = usePublications(),
    { selected, preview } = useWorkspace();
  const [state, setState] = useState<z.infer<
      typeof catchupSettingsSchema
    > | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    void api
      .settings(selected!.id, c.signal)
      .then((s) => {
        if (!c.signal.aborted) setState(s);
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Could not load chat settings.',
          );
      });
    return () => c.abort();
  }, [selected!.id, revision]);
  return (
    <section className="panel content-stack">
      <div className="panel-title">
        <h2>!catchup in Twitch chat</h2>
        <span className="status purple">
          {state?.enabled ? 'Enabled' : 'Off'}
        </span>
      </div>
      <p>
        Reply with the latest approved short recap, or a neutral response when
        none is published. Replies are posted as your connected broadcaster,
        only to this channel, at most once per minute.
      </p>
      <p className="muted">
        Live capture and explicit chat-sending permission are required. Stopping
        capture or disconnecting stops replies. A reply already being sent
        cannot be retracted.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!state ? (
        <p role="status">Loading chat readiness…</p>
      ) : (
        <>
          {preview ? (
            <p className="notice">
              Preview only · no messages are sent to Twitch.
            </p>
          ) : (
            <>
              {!state.configured && (
                <p className="notice">
                  Configure your Twitch application and EventSub in the README
                  first.
                </p>
              )}
              {state.missingScopes.length > 0 && (
                <>
                  <p className="muted">
                    Authorization needed: {state.missingScopes.join(', ')}
                  </p>
                  <a className="button secondary" href="/api/auth/twitch/chat">
                    Authorize chat replies with Twitch
                  </a>
                </>
              )}
              {!state.captureEnabled && (
                <p className="notice">
                  Start live capture in Channel settings first.
                </p>
              )}
            </>
          )}
          <button
            className="button secondary"
            disabled={
              preview ||
              busy ||
              (!state.enabled &&
                (!selected!.connected ||
                  !state.configured ||
                  !state.captureEnabled ||
                  state.missingScopes.length > 0))
            }
            onClick={() => {
              setBusy(true);
              setError('');
              void api
                .consent(selected!.id, !state.enabled)
                .then(() => setRevision((r) => r + 1))
                .catch((e: unknown) =>
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Could not update chat replies.',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {state.enabled
              ? 'Disable !catchup replies'
              : 'Enable !catchup replies'}
          </button>
          <button
            className="button secondary"
            onClick={() => setRevision((r) => r + 1)}
          >
            Refresh chat status
          </button>
          {state.recent.length > 0 && (
            <ul>
              {state.recent.map((r) => (
                <li key={r.id}>
                  {r.status} · {new Date(r.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
