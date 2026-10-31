'use client';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { type CaseDetail, type ModerationDesk } from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { useModeration } from './moderation-context';
import { ConsistencyReviews } from './consistency';
import { RepairActions } from './repair-actions';
import { Handoffs } from './handoffs';
import { RuleChanges } from './rule-changes';
export function ModeratorDeskScreen() {
  const { selected, href } = useWorkspace();
  return (
    <div className="content-stack">
      <Link className="text-link" href={href('moderation')}>
        Back to cases
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRIVATE MODERATOR DESK</p>
          <h1>Good context. Better handoffs.</h1>
          <p>
            Review the differences, follow through, and leave a clear next step.
          </p>
        </div>
      </div>
      {!selected ? (
        <p className="notice">Choose a channel first.</p>
      ) : !['owner', 'moderator'].includes(selected.role) ? (
        <p className="notice">
          This desk is private to owners and approved moderators.
        </p>
      ) : (
        <WorkflowDesk key={selected.id} />
      )}
    </div>
  );
}
export function CaseWorkflowPanel({ record }: { record: CaseDetail }) {
  const { selected } = useWorkspace();
  return selected && ['owner', 'moderator'].includes(selected.role) ? (
    <WorkflowDesk key={`${selected.id}-${record.id}`} record={record} />
  ) : null;
}
function WorkflowDesk({ record }: { record?: CaseDetail }) {
  const { selected, href } = useWorkspace(),
    api = useModeration();
  const [data, setData] = useState<ModerationDesk | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState<'handoffs' | 'flags' | 'repairs'>(
      record ? 'flags' : 'handoffs',
    );
  const [handoffRequest, setHandoffRequest] = useState(() =>
    crypto.randomUUID(),
  );
  const channelId = selected!.id,
    editable = selected!.connected;
  const refresh = () => setRevision((r) => r + 1);
  useLiveRefresh(channelId, () => setRevision((value) => value + 1));
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    void api
      .desk(channelId, record ? { caseId: record.id } : {}, c.signal)
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Could not load moderator work.',
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [channelId, record?.id, revision]);
  useEffect(() => {
    if (record && window.location.hash.startsWith('#repair-'))
      setTab('repairs');
  }, [record?.id]);
  useEffect(() => {
    if (!loading && record && window.location.hash) {
      const node = document.getElementById(window.location.hash.slice(1));
      node?.scrollIntoView?.();
    }
  }, [loading, tab, record?.id]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not complete the request.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function more(section: keyof ModerationDesk['nextCursors']) {
    if (!data) return;
    const cursor = data.nextCursors[section];
    if (!cursor) return;
    setBusy(true);
    setError('');
    try {
      const key = {
        repairs: 'repairCursor',
        flags: 'flagCursor',
        handoffs: 'handoffCursor',
        ruleChanges: 'ruleCursor',
        activity: 'activityCursor',
      }[section];
      const page = await api.desk(channelId, {
        ...(record ? { caseId: record.id } : {}),
        [key]: cursor,
      });
      setData((current) =>
        current
          ? {
              ...current,
              [section]: [...current[section], ...page[section]],
              nextCursors: {
                ...current.nextCursors,
                [section]: page.nextCursors[section],
              },
            }
          : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load older work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-stack">
      {record ? (
        <div className="panel-title">
          <h2>Reviews & follow-through</h2>
          <Link className="text-link" href={href('workflows')}>
            Open shift desk
          </Link>
        </div>
      ) : (
        <div className="button-row">
          <button
            className="button primary"
            disabled={!editable || busy || loading}
            onClick={() =>
              void run(async () => {
                await api.generate(channelId, handoffRequest);
                setHandoffRequest(crypto.randomUUID());
                setNotice('Handoff saved from current channel records.');
                setTab('handoffs');
              })
            }
          >
            Generate shift handoff
          </button>
          <button
            className="button secondary"
            disabled={!editable || busy || loading}
            onClick={() =>
              void run(async () => {
                const result = await api.scan(channelId);
                setNotice(
                  `${result.created} potential concerns added.${result.hasMore ? ' More comparisons remain; run again to continue.' : ''} Different outcomes alone do not establish inconsistency.`,
                );
                setTab('flags');
              })
            }
          >
            Compare documented outcomes
          </button>
        </div>
      )}
      {!editable && (
        <p className="notice">
          Disconnected channel · saved moderator work is read-only.
        </p>
      )}
      <div className="button-row" aria-label="Moderator desk sections">
        {(!record
          ? (['handoffs', 'flags', 'repairs'] as const)
          : (['flags', 'repairs'] as const)
        ).map((t) => (
          <button
            className="button secondary workflow-tab"
            aria-pressed={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {
              {
                handoffs: 'Handoffs',
                flags: 'Consistency reviews',
                repairs: 'Repair actions',
              }[t]
            }
          </button>
        ))}
        <button
          className="button secondary"
          disabled={loading || busy}
          onClick={refresh}
        >
          Refresh desk
        </button>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error} Refresh the desk before retrying a conflicting update.
        </p>
      )}
      {loading && <p role="status">Loading moderator work…</p>}
      {data && !loading && (
        <>
          {tab === 'handoffs' ? (
            <>
              <RuleChanges
                data={data}
                channelId={channelId}
                editable={editable}
                onChanged={refresh}
                onMore={() => void more('ruleChanges')}
                busy={busy}
              />
              <Handoffs data={data} editable={editable} onChanged={refresh} />
            </>
          ) : tab === 'flags' ? (
            <ConsistencyReviews
              data={data}
              record={record}
              channelId={channelId}
              editable={editable}
              onChanged={refresh}
            />
          ) : (
            <RepairActions
              data={data}
              record={record}
              channelId={channelId}
              editable={editable}
              onChanged={refresh}
            />
          )}{' '}
          {data.nextCursors[tab] && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void more(tab)}
            >
              Load older {tab === 'flags' ? 'reviews' : tab}
            </button>
          )}
          <details className="panel">
            <summary>Workflow history</summary>
            {data.activityTruncated && (
              <p className="notice">
                Showing the latest 100 entries. Earlier entries remain retained
                in the audit history.
              </p>
            )}
            <ol className="case-history">
              {data.activity.map((a) => (
                <li key={a.id}>
                  <strong>{a.action.replaceAll('_', ' ')}</strong>
                  <p className="muted">
                    Twitch user {a.actorTwitchUserId} ·{' '}
                    {new Date(a.occurredAt).toLocaleString()}
                  </p>
                  {a.assigneeId && (
                    <p className="muted">
                      Assigned moderator:{' '}
                      {data.assignees.find((p) => p.id === a.assigneeId)
                        ?.displayName ?? a.assigneeId}
                    </p>
                  )}
                  {a.note && <p className="case-prose">{a.note}</p>}
                </li>
              ))}
            </ol>
            {data.nextCursors.activity && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void more('activity')}
              >
                Load older workflow history
              </button>
            )}
            {!data.activity.length && (
              <p className="muted">No workflow changes yet.</p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
