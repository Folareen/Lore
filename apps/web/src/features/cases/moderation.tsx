'use client';
import { PageTitle } from '../../components/page-title';
import { Select } from '../../components/select';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, FolderOpen, Plus, RefreshCw } from 'lucide-react';
import {
  caseOutcomeLabels,
  caseStatusSchema,
  createCaseSchema,
  type CaseSummary,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { useCases } from './cases-context';
import { CaseForm } from './case-form';
export function ModerationScreen() {
  const { selected } = useWorkspace();
  const [draft, setDraft] = useState<{
    channelId: string;
    requestId: string;
  } | null>(null);
  const canManage = selected && ['owner', 'moderator'].includes(selected.role);
  return (
    <div className="moderation-page content-stack">
      <div className="page-heading">
        <div>
          <PageTitle>Moderation cases</PageTitle>
          <p>Review evidence, applicable rules and earlier decisions.</p>
        </div>
        {canManage && (
          <button
            className="button primary"
            disabled={!selected.connected}
            onClick={() =>
              setDraft({
                channelId: selected.id,
                requestId: crypto.randomUUID(),
              })
            }
          >
            <Plus size={16} aria-hidden="true" />
            New case
          </button>
        )}
      </div>
      {!selected ? (
        <p className="notice">Choose a channel first.</p>
      ) : !['owner', 'moderator'].includes(selected.role) ? (
        <p className="notice">
          Cases are private to owners and approved moderators.
        </p>
      ) : (
        <CasesList
          key={selected.id}
          requestId={draft?.channelId === selected.id ? draft.requestId : null}
          onCancel={() => setDraft(null)}
        />
      )}
    </div>
  );
}
function CasesList({
  requestId,
  onCancel,
}: {
  requestId: string | null;
  onCancel: () => void;
}) {
  const { selected, href } = useWorkspace();
  const { list, create, caseHref } = useCases();
  const router = useRouter();
  const [rows, setRows] = useState<CaseSummary[]>([]);
  const [filter, setFilter] = useState('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const channelId = selected!.id;
  useLiveRefresh(channelId, () => setRevision((value) => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void list(
      channelId,
      filter === 'all' ? {} : { status: caseStatusSchema.parse(filter) },
      controller.signal,
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setRows(page.items);
        setCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : 'Could not load cases.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [channelId, filter, revision]);
  return (
    <div className="content-stack">
      {!selected?.connected && (
        <p className="notice">
          This channel is disconnected. Saved cases are read-only.
        </p>
      )}
      <div className="cases-toolbar">
        <label className="field">
          Case status
          <Select
            value={filter}
            disabled={busy}
            onValueChange={(e) => {
              setRows([]);
              setFilter(e);
            }}
          >
            <option value="all">All cases</option>
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="decided">Decided</option>
          </Select>
        </label>
        <button
          className="button secondary"
          aria-label="Refresh cases"
          disabled={loading || busy}
          onClick={() => setRevision((r) => r + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
        <Link
          className="button secondary cases-shift-link"
          href={href('workflows')}
        >
          Shift desk
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {requestId && (
        <CaseForm
          label="Create case"
          onCancel={onCancel}
          onSave={async (fields) => {
            const record = await create(
              channelId,
              createCaseSchema.parse({ ...fields, requestId }),
            );
            onCancel();
            router.push(caseHref(record.id, channelId));
          }}
        />
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading cases…</p>}
      {!loading && !error && !rows.length && (
        <div className="empty-state cases-empty-state">
          <FolderOpen aria-hidden="true" />
          <h2>{filter === 'all' ? 'No cases yet' : 'No matching cases'}</h2>
          <p>
            {filter === 'all'
              ? 'Create a case to keep the incident, rule and evidence together.'
              : 'Try another status to find the case you need.'}
          </p>
        </div>
      )}
      <div className="content-stack">
        {rows.map((record) => (
          <Link
            className="panel case-list-row"
            href={caseHref(record.id, channelId)}
            key={record.id}
          >
            <div>
              <span className="record-meta">
                {record.origin === 'demo_fixture'
                  ? 'Demo fixture'
                  : 'Manual import'}{' '}
                · {record.ruleTitle} v{record.ruleVersion}
              </span>
              <h2>{record.title}</h2>
              <p className="muted">{record.subjectReference}</p>
            </div>
            <span className="status purple">
              {record.outcome
                ? caseOutcomeLabels[record.outcome]
                : record.status}
            </span>
          </Link>
        ))}
      </div>
      {cursor && (
        <button
          className="button secondary"
          disabled={busy || loading}
          onClick={() => {
            setBusy(true);
            void list(channelId, {
              ...(filter === 'all'
                ? {}
                : { status: caseStatusSchema.parse(filter) }),
              cursor,
            })
              .then((page) => {
                setRows((current) => [...current, ...page.items]);
                setCursor(page.nextCursor);
              })
              .catch((error: unknown) =>
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Could not load more cases.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Load more cases
        </button>
      )}
    </div>
  );
}
