'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  caseOutcomeLabels,
  createFlagSchema,
  reviewFlagSchema,
  type CaseDetail,
  type CaseSummary,
  type ConsistencyFlag,
  type ModerationDesk,
} from '@lore/shared';
import { useCases } from '../cases/cases-context';
import { useModeration } from './moderation-context';
import { NoteField, WorkflowForm, value } from './workflow-forms';
export function ConsistencyReviews({
  data,
  record,
  channelId,
  editable,
  onChanged,
}: {
  data: ModerationDesk;
  record?: CaseDetail;
  channelId: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const api = useModeration(),
    cases = useCases();
  const [creating, setCreating] = useState(false),
    [options, setOptions] = useState<CaseSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!creating) return;
    const c = new AbortController();
    setBusy(true);
    void cases
      .list(channelId, {}, c.signal)
      .then((page) => {
        if (!c.signal.aborted) {
          setOptions(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Could not load case choices.',
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [channelId, creating]);
  return (
    <section className="content-stack" aria-label="Consistency reviews">
      <div className="panel-title">
        <h2>Consistency review</h2>
        {editable && (
          <button
            className="button secondary"
            onClick={() => {
              setRequestId(crypto.randomUUID());
              setError('');
              setCreating(!creating);
            }}
          >
            Raise a concern
          </button>
        )}
      </div>
      <p className="muted">
        A different outcome can be justified. Check rule version, severity,
        context and available evidence before drawing a conclusion. Reviews
        preserve the original decision.
      </p>
      {creating && (
        <WorkflowForm
          label="Create review flag"
          onCancel={() => setCreating(false)}
          onSave={async (form) => {
            await api.createFlag(
              channelId,
              createFlagSchema.parse({
                requestId,
                caseId: record?.id ?? value(form, 'caseId'),
                comparedCaseId: value(form, 'comparedCaseId') || null,
                concern: value(form, 'note'),
              }),
            );
            setCreating(false);
            onChanged();
          }}
        >
          {!record && (
            <label className="field">
              Case to review
              <select name="caseId" required>
                <option value="">Choose a case</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Compare with (optional)
            <select name="comparedCaseId">
              <option value="">Concern about this case only</option>
              {options
                .filter((c) => c.id !== record?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c.ruleTitle} v{c.ruleVersion}
                  </option>
                ))}
            </select>
          </label>
          <NoteField label="Concern or missing rationale" />
          {busy && <p role="status">Loading case choices…</p>}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {cursor && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void cases
                  .list(channelId, { cursor })
                  .then((p) => {
                    setOptions((o) => [...o, ...p.items]);
                    setCursor(p.nextCursor);
                  })
                  .catch((e: unknown) =>
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Could not load more cases.',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Load more case choices
            </button>
          )}
        </WorkflowForm>
      )}
      {!data.flags.length && (
        <p className="notice">No consistency concerns recorded.</p>
      )}
      {data.flags.map((flag) => (
        <FlagCard
          key={`${flag.id}-${flag.version}`}
          flag={flag}
          editable={editable}
          onChanged={onChanged}
        />
      ))}
    </section>
  );
}
function FlagCard({
  flag,
  editable,
  onChanged,
}: {
  flag: ConsistencyFlag;
  editable: boolean;
  onChanged: () => void;
}) {
  const api = useModeration(),
    cases = useCases();
  const [editing, setEditing] = useState(false);
  return (
    <article
      className="panel content-stack"
      id={`flag-${flag.id}`}
      aria-label="Consistency concern"
    >
      <div className="panel-title">
        <h3>Potential inconsistency · {flag.status}</h3>
        <span className="record-meta">
          {flag.origin === 'human'
            ? 'Human concern'
            : 'Documented outcome comparison'}
        </span>
      </div>
      <p className="case-prose">{flag.concern}</p>
      <div className="workflow-comparison">
        <CaseContext
          id={flag.caseId}
          channelId={flag.channelId}
          version={flag.caseVersion}
        />
        {flag.comparedCaseId && (
          <CaseContext
            id={flag.comparedCaseId}
            channelId={flag.channelId}
            version={flag.comparedVersion!}
          />
        )}
      </div>
      {flag.reviewNote && (
        <div className="candidate-source">
          <p className="case-prose">
            <strong>Review note:</strong> {flag.reviewNote}
          </p>
          {flag.severityContext && (
            <p className="case-prose">
              <strong>Severity & context:</strong> {flag.severityContext}
            </p>
          )}
          {flag.evidenceContext && (
            <p className="case-prose">
              <strong>Evidence differences:</strong> {flag.evidenceContext}
            </p>
          )}
          <p className="muted">
            Reviewed by Twitch user {flag.reviewedByTwitchUserId} ·{' '}
            {new Date(flag.reviewedAt!).toLocaleString()}
          </p>
        </div>
      )}
      <Link
        className="text-link"
        href={cases.caseHref(flag.caseId, flag.channelId)}
      >
        Open case & evidence
      </Link>
      {editable &&
        flag.status === 'open' &&
        (!editing ? (
          <button className="button secondary" onClick={() => setEditing(true)}>
            Review concern
          </button>
        ) : (
          <WorkflowForm
            label="Record human review"
            onCancel={() => setEditing(false)}
            onSave={async (form) => {
              await api.review(
                flag.channelId,
                flag.id,
                reviewFlagSchema.parse({
                  expectedVersion: flag.version,
                  status: value(form, 'status'),
                  note: value(form, 'note'),
                  severityContext: value(form, 'severityContext'),
                  evidenceContext: value(form, 'evidenceContext'),
                }),
              );
              setEditing(false);
              onChanged();
            }}
          >
            <label className="field">
              Review outcome
              <select name="status">
                <option value="open">Annotate · keep open</option>
                <option value="confirmed">Confirm concern</option>
                <option value="dismissed">Dismiss concern</option>
              </select>
            </label>
            <NoteField
              label="Review rationale"
              initial={flag.reviewNote ?? ''}
            />
            <label className="field">
              Severity & context differences
              <textarea
                name="severityContext"
                maxLength={1000}
                defaultValue={flag.severityContext}
              />
            </label>
            <label className="field">
              Evidence differences or gaps
              <textarea
                name="evidenceContext"
                maxLength={1000}
                defaultValue={flag.evidenceContext}
              />
            </label>
            <p className="muted">
              Confirming or dismissing ends this review. Any later case decision
              requires its own human review.
            </p>
          </WorkflowForm>
        ))}
    </article>
  );
}
function CaseContext({
  id,
  channelId,
  version,
}: {
  id: string;
  channelId: string;
  version: number;
}) {
  const { get, caseHref } = useCases();
  const [record, setRecord] = useState<CaseDetail | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    void get(channelId, id, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setRecord(r);
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : 'Case unavailable.');
      });
    return () => c.abort();
  }, [id, channelId]);
  if (error) return <p className="notice error">{error}</p>;
  if (!record) return <p role="status">Loading source case…</p>;
  return (
    <div className="candidate-source content-stack">
      <Link className="text-link" href={caseHref(id, channelId)}>
        {record.title}
      </Link>
      <p className="muted">
        {record.ruleTitle} · rule v{record.ruleVersion} · case v{version}
        {record.version !== version
          ? ' · Case changed since flag was raised; review current evidence.'
          : ''}
      </p>
      <p className="case-prose">{record.ruleText}</p>
      <p className="case-prose">{record.incident}</p>
      <p>
        <strong>
          {record.outcome ? caseOutcomeLabels[record.outcome] : record.status}
        </strong>{' '}
        · {record.rationale ?? 'No final human rationale yet.'}
      </p>
      <p className="muted">
        {record.evidence.filter((e) => !e.removed).length} retained evidence
        items. Open the case to inspect sources.
      </p>
    </div>
  );
}
