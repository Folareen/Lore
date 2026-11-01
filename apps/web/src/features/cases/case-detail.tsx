'use client';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  caseOutcomeLabels,
  updateCaseSchema,
  type CaseDetail,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { useCases } from './cases-context';
import { CaseForm } from './case-form';
import { CaseEvidencePanel } from './case-evidence';
import { CasePrecedents } from './case-precedents';
import { CaseWorkflowPanel } from '../moderation/moderator-desk';
export function CaseDetailScreen({
  id,
  channelId,
}: {
  id: string;
  channelId?: string;
}) {
  const { selected, channels, selectChannel, href } = useWorkspace();
  useEffect(() => {
    if (
      channelId &&
      selected?.id !== channelId &&
      channels.some((c) => c.id === channelId)
    )
      selectChannel(channelId);
  }, [channelId, selected?.id]);
  if (channelId && !channels.some((c) => c.id === channelId))
    return <p className="notice error">Channel unavailable.</p>;
  if (!selected || (channelId && selected.id !== channelId))
    return <p role="status">Selecting channel…</p>;
  if (!['owner', 'moderator'].includes(selected.role))
    return (
      <p className="notice">
        Cases are private to owners and approved moderators.
      </p>
    );
  return (
    <>
      <Link className="text-link" href={href('moderation')}>
        Back to cases
      </Link>
      <CaseFile key={`${selected.id}-${id}`} id={id} />
    </>
  );
}
function CaseFile({ id }: { id: string }) {
  const { selected } = useWorkspace();
  const { get, update } = useCases();
  const [record, setRecord] = useState<CaseDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const channelId = selected!.id;
  useLiveRefresh(channelId, () => setRevision((value) => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void get(channelId, id, controller.signal)
      .then((record) => {
        if (!controller.signal.aborted) setRecord(record);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not load this case.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [channelId, id, revision]);
  if (loading && !record) return <p role="status">Loading case…</p>;
  if (error)
    return (
      <div className="panel">
        <p className="notice error" role="alert">
          {error}
        </p>
        <button
          className="button secondary"
          onClick={() => setRevision((r) => r + 1)}
        >
          Refresh case
        </button>
      </div>
    );
  if (!record) return null;
  const editable = selected!.connected && record.status !== 'decided';
  return (
    <div className="content-stack">
      <div className="page-heading">
        <div>
          <p className="record-meta">
            Private moderation ·{' '}
            {record.origin === 'demo_fixture'
              ? 'Demo fixture'
              : record.origin === 'live_twitch'
                ? 'Twitch event import'
                : 'Manual import'}
          </p>
          <h1>{record.title}</h1>
          {record.origin === 'live_twitch' && (
            <p className="notice">
              Imported Twitch event · review the source evidence and record the
              applicable channel rule and version before deciding. External
              Twitch resolutions do not decide this Lore case.
            </p>
          )}
          <p>
            {record.subjectReference} ·{' '}
            <span className="status purple">{record.status}</span>
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((r) => r + 1)}
        >
          Refresh case
        </button>
      </div>
      <nav className="case-jump-nav" aria-label="Case sections">
        <a href="#case-incident">Incident &amp; rule</a>
        <a href="#case-evidence">Evidence</a>
        <a href="#case-decision">Review &amp; decision</a>
        <a href="#case-follow-up">Follow-up</a>
      </nav>
      {!selected?.connected && (
        <p className="notice">
          Reconnect the channel before changing this case.
        </p>
      )}
      {record.status === 'decided' && (
        <section className="panel content-stack">
          <h2>{caseOutcomeLabels[record.outcome!]} · Human decision</h2>
          <p className="case-prose">{record.rationale}</p>
          {record.followUp && (
            <p>
              <strong>Follow-up:</strong> {record.followUp}
            </p>
          )}
          <p className="muted">
            Recorded by Twitch user {record.decidedByTwitchUserId} ·{' '}
            {new Date(record.decidedAt!).toLocaleString()}
            {record.aiDisposition
              ? ` · AI suggestion ${record.aiDisposition}`
              : ''}
          </p>
          <p className="muted">
            This is the saved Lore decision. Any Twitch action must be performed
            separately.
          </p>
        </section>
      )}
      <section className="panel content-stack" id="case-incident">
        <div className="panel-title">
          <h2>The incident & appeal</h2>
          {editable && (
            <button
              className="button secondary"
              onClick={() => setEditing(!editing)}
            >
              Edit case
            </button>
          )}
        </div>
        <p className="muted">
          {record.incidentAt
            ? new Date(record.incidentAt).toLocaleString()
            : 'Incident time not recorded'}
        </p>
        <p className="case-prose">{record.incident}</p>
        <h3>Appeal</h3>
        <p className="case-prose">
          {record.appeal || 'No appeal text was supplied.'}
        </p>
        <div className="candidate-source">
          <h3>
            {record.ruleTitle} · version {record.ruleVersion}
          </h3>
          <p className="case-prose">{record.ruleText}</p>
        </div>
      </section>
      {editing && editable && (
        <CaseForm
          initial={record}
          label="Save case changes"
          onCancel={() => setEditing(false)}
          onSave={async (fields) => {
            setRecord(
              await update(
                record,
                updateCaseSchema.parse({
                  ...fields,
                  expectedVersion: record.version,
                  status:
                    record.status === 'open' ? 'reviewing' : record.status,
                }),
              ),
            );
            setEditing(false);
          }}
        />
      )}
      <div id="case-evidence">
        <CaseEvidencePanel
          key={`evidence-${record.version}`}
          record={record}
          editable={editable}
          onChanged={setRecord}
        />
      </div>
      <div id="case-decision">
        <CasePrecedents
          key={`review-${record.version}`}
          record={record}
          editable={editable}
          onDecided={setRecord}
        />
      </div>
      <details className="panel">
        <summary>Case history</summary>
        <ol className="case-history">
          {record.history.map((item) => (
            <li key={item.id}>
              <strong>{item.action.replaceAll('_', ' ')}</strong> · v
              {item.version}
              <p className="muted">
                Twitch user {item.actorTwitchUserId} ·{' '}
                {new Date(item.occurredAt).toLocaleString()}
              </p>
              {item.reason && <p className="case-prose">{item.reason}</p>}
            </li>
          ))}
        </ol>
      </details>
      <div id="case-follow-up">
        <CaseWorkflowPanel record={record} />
      </div>
    </div>
  );
}
