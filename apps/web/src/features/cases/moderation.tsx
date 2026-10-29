'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, Plus } from 'lucide-react';
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
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTEXT BEFORE THE CALL</p>
          <h1>A fairer place to review.</h1>
          <p>
            Case files, retained evidence, and the reasoning behind each human
            decision.
          </p>
        </div>
        <FolderOpen size={30} aria-hidden="true" />
      </div>
      {!selected ? (
        <p className="notice">Choose a channel first.</p>
      ) : !['owner', 'moderator'].includes(selected.role) ? (
        <p className="notice">
          Cases are private to owners and approved moderators.
        </p>
      ) : (
        <CasesList key={selected.id} />
      )}
    </>
  );
}
function CasesList() {
  const { selected } = useWorkspace();
  const { list, create, caseHref } = useCases();
  const router = useRouter();
  const [rows, setRows] = useState<CaseSummary[]>([]);
  const [filter, setFilter] = useState('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const channelId = selected!.id;
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
      <div className="button-row">
        <button
          className="button primary"
          disabled={!selected?.connected}
          onClick={() => {
            setRequestId(crypto.randomUUID());
            setCreating(true);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          New case
        </button>
        <label className="field">
          Case status
          <select
            value={filter}
            disabled={busy}
            onChange={(e) => {
              setRows([]);
              setFilter(e.target.value);
            }}
          >
            <option value="all">All cases</option>
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="decided">Decided</option>
          </select>
        </label>
        <button
          className="button secondary"
          disabled={loading || busy}
          onClick={() => setRevision((r) => r + 1)}
        >
          Refresh cases
        </button>
      </div>
      {creating && (
        <CaseForm
          label="Create case"
          onCancel={() => setCreating(false)}
          onSave={async (fields) => {
            const record = await create(
              channelId,
              createCaseSchema.parse({ ...fields, requestId }),
            );
            setCreating(false);
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
        <div className="empty-state">
          <FolderOpen aria-hidden="true" />
          <h2>No cases here yet.</h2>
          <p>
            Start with what happened, the rule in effect, and the evidence you
            actually have.
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
              <span className="eyebrow">
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
