'use client';
import { SectionTabs } from '../../components/section-tabs';
import { useSearchParams } from 'next/navigation';
import { FeatureControls } from '../continuity/feature-controls';
import { Select } from '../../components/select';
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
  type PublicationFields,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { usePublications } from './publications-context';
import { PublicationForm } from './publication-form';
import { publicationLabels } from './public-lore';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function PublicationsScreen() {
  const { selected, channels, selectChannel } = useWorkspace();
  const params = useSearchParams();
  const channelId = params.get('channel');
  const [openedChannel, setOpenedChannel] = useState<string | null>(null);
  useEffect(() => {
    if (
      channelId &&
      openedChannel !== channelId &&
      channels.some((channel) => channel.id === channelId)
    ) {
      if (selected?.id !== channelId) selectChannel(channelId);
      setOpenedChannel(channelId);
    }
  }, [channelId, openedChannel, selected?.id, channels, selectChannel]);
  if (channelId && !channels.some((channel) => channel.id === channelId))
    return <p className="notice error">Channel unavailable.</p>;
  if (channelId && openedChannel !== channelId && selected?.id !== channelId)
    return <p role="status">Selecting channel…</p>;
  const parsedPromise = z.uuid().safeParse(params.get('promise'));
  const promiseId =
    parsedPromise.success && (!channelId || selected?.id === channelId)
      ? parsedPromise.data
      : undefined;
  return selected ? (
    <PublishingDesk
      key={`${selected.id}-${promiseId ?? ''}`}
      promiseId={promiseId}
    />
  ) : (
    <p className="notice">Connect a channel to prepare Community Lore.</p>
  );
}
function PublishingDesk({ promiseId }: { promiseId?: string }) {
  const api = usePublications(),
    { selected, preview, href } = useWorkspace();
  const [sourcePromiseId, setSourcePromiseId] = useState(promiseId);
  const [tab, setTab] = useState('stories');
  const [draftKind, setDraftKind] =
    useState<PublicationFields['kind']>('milestone');
  const channelId = selected!.id,
    reviewer = selected!.role !== 'team';
  const [rows, setRows] = useState<ManagedPublication[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [filter, setFilter] = useState('all'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [creating, setCreating] = useState(Boolean(sourcePromiseId)),
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
          <h1>Public stories</h1>
          <p>
            Share community moments. Review each draft before anyone can see it.
          </p>
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
      <SectionTabs
        label="Publishing tasks"
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            value: 'stories',
            label: 'Stories & drafts',
            content: (
              <div className="content-stack">
                <div className="list-toolbar">
                  <button
                    className="button primary"
                    disabled={!selected!.connected || creating}
                    onClick={() => {
                      setSuggested(undefined);
                      setSourcePromiseId(undefined);
                      setDraftKind('milestone');
                      setRequestId(crypto.randomUUID());
                      setCreating(true);
                    }}
                  >
                    New story
                  </button>
                  <label className="field">
                    Publication status
                    <Select value={filter} onValueChange={(e) => setFilter(e)}>
                      <option value="all">All entries</option>
                      <option value="draft">Drafts</option>
                      <option value="published">Published</option>
                      <option value="unpublished">Unpublished</option>
                    </Select>
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
                    initialKind={draftKind}
                    sourcePromiseId={sourcePromiseId}
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
                    <h2>Your first story starts here.</h2>
                    <p>
                      Choose New story to share a moment or update a promise. It
                      stays private until an owner or moderator publishes it.
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
              </div>
            ),
          },
          {
            value: 'recap',
            label: 'Create a recap',
            content: (
              <div className="content-stack">
                <div className="task-intro">
                  <h2>Bring newcomers up to speed</h2>
                  <p>
                    Publish stories first, then combine their approved public
                    text into a recap. A published recap supplies the short
                    wording for !catchup.
                  </p>
                </div>
                <SummaryGenerator
                  canUseDraft={!creating}
                  onUse={(draft) => {
                    setSuggested(draft);
                    setSourcePromiseId(undefined);
                    setRequestId(crypto.randomUUID());
                    setCreating(true);
                    setTab('stories');
                  }}
                />
                {creating && (
                  <p className="notice">
                    You have an unsaved story draft. Save or cancel it in
                    Stories &amp; drafts before starting another.
                  </p>
                )}
                <button
                  className="button secondary"
                  disabled={!selected!.connected || creating}
                  onClick={() => {
                    setSuggested(undefined);
                    setSourcePromiseId(undefined);
                    setDraftKind('summary');
                    setRequestId(crypto.randomUUID());
                    setCreating(true);
                    setTab('stories');
                  }}
                >
                  Write a recap yourself
                </button>
              </div>
            ),
          },
          ...(selected!.role === 'owner'
            ? [
                {
                  value: 'chat',
                  label: 'Twitch replies',
                  content: (
                    <div className="content-stack">
                      <CatchupSettings key={channelId} />
                      <FeatureControls only={['promiseConfirmationsEnabled']} />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
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
  const { selected, preview, href } = useWorkspace();
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
      <p className="muted publication-date">
        {r.publishedAt
          ? `Published ${new Date(r.publishedAt).toLocaleDateString()}`
          : 'Private draft · not visible to viewers'}
        {r.sourceIds.length
          ? ` · ${r.sourceIds.length} public ${r.sourceIds.length === 1 ? 'source' : 'sources'}`
          : ''}
      </p>
      <details className="publication-details">
        <summary>Publication details</summary>
        <p className="muted">
          v{r.version}
          {r.publishedAt
            ? ` · Published ${new Date(r.publishedAt).toLocaleString()} by Twitch user ${r.approvedByTwitchUserId}`
            : ' · Private until publication review'}
          {r.sourceIds.length
            ? ` · ${r.sourceIds.length} public citations`
            : ''}
          {r.promiseId ? ' · Private promise drafting source' : ''}
        </p>
      </details>
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
            {r.status === 'published' ? 'Edit as draft' : 'Edit draft'}
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
          {r.status === 'published' && selected && (
            <Link
              className="text-link"
              href={
                preview
                  ? `${href('community')}&entry=${r.id}`
                  : `/c/${selected.slug}/entries/${r.id}`
              }
              prefetch={false}
            >
              View public story ↗
            </Link>
          )}
          <details className="record-more">
            <summary>More actions</summary>
            <div className="button-row">
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
                        e instanceof Error
                          ? e.message
                          : 'Could not load history.',
                      ),
                    );
                }}
              >
                Review history
              </button>
            </div>
          </details>
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
          tone={action === 'publish' ? 'primary' : 'danger'}
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
    { selected, preview, href } = useWorkspace();
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
        Turn on capture, authorize sending, then enable replies below. These
        permissions are separate from sign-in. Stopping capture stops replies.
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
                    Twitch permission is needed to send replies as your
                    broadcaster account.
                  </p>
                  <a className="button secondary" href="/api/auth/twitch/chat">
                    Authorize chat replies with Twitch
                  </a>
                </>
              )}
              {!state.captureEnabled && (
                <p className="notice">
                  Live capture is off.{' '}
                  <Link className="text-link" href={href('settings')}>
                    Open capture settings →
                  </Link>
                </p>
              )}
            </>
          )}
          <div className="button-row">
            <button
              className="button primary"
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
          </div>
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
