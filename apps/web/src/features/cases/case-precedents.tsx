'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  caseAiSettingsSchema,
  caseOutcomeLabels,
  caseOutcomeSchema,
  decideCaseSchema,
  type CaseAiRun,
  type CaseDetail,
  type CaseRecommendation,
} from '@lore/shared';
import { z } from 'zod';
import { useWorkspace } from '../workspace/workspace-context';
import { useCases } from './cases-context';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function CasePrecedents({
  record,
  editable,
  onDecided,
}: {
  record: CaseDetail;
  editable: boolean;
  onDecided: (record: CaseDetail) => void;
}) {
  const { selected, preview } = useWorkspace();
  const { settings, consent, retrieve, precedents, caseHref } = useCases();
  const [info, setInfo] = useState<z.infer<typeof caseAiSettingsSchema> | null>(
    null,
  );
  const [run, setRun] = useState<CaseAiRun | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      settings(record.channelId, controller.signal),
      precedents(record, controller.signal),
    ])
      .then(([info, result]) => {
        if (controller.signal.aborted) return;
        setInfo(info);
        setRun(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not load precedent review.',
          );
      });
    return () => controller.abort();
  }, [record.id, record.version, revision]);
  useEffect(() => {
    if (!run || !['queued', 'processing'].includes(run.status)) return;
    const timer = setInterval(() => setRevision((r) => r + 1), 5000);
    return () => clearInterval(timer);
  }, [run?.status]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
      setRevision((r) => r + 1);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not complete precedent retrieval.',
      );
    } finally {
      setBusy(false);
    }
  }
  const active = run && ['queued', 'processing'].includes(run.status);
  return (
    <section className="panel content-stack">
      <h2>Earlier cases & recommendations</h2>
      <p className="panel-description">
        Potential precedents come from decided cases in this channel. Similarity
        helps find context; it does not establish guilt or require the same
        outcome.
      </p>
      {info && (
        <>
          <p className="muted">
            {preview
              ? 'Demo comparison · no model calls'
              : `${info.embeddingModel} · ${info.reasoningModel}`}{' '}
            · {info.dailyUsed}/{info.dailyLimit} shared AI calls today (UTC)
          </p>
          {preview ? (
            <p className="notice">
              Fixture comparisons and recommendations are illustrative, not
              generated from real moderation data.
            </p>
          ) : (
            <>
              <p className="notice">
                Case AI is a separate opt-in. It sends private case text and
                retained excerpts to Google Gemini for retrieval and
                recommendations. Uploaded file contents are not sent. On
                Google’s free tier, inputs and outputs may be used to improve
                its products.
              </p>
              {selected?.role === 'owner' ? (
                <button
                  className="button secondary"
                  disabled={
                    busy ||
                    (!info.enabled &&
                      (!info.embeddingsConfigured || !selected.connected))
                  }
                  onClick={() =>
                    void action(() => consent(record.channelId, !info.enabled))
                  }
                >
                  {info.enabled
                    ? 'Disable private case AI'
                    : 'Enable private case AI'}
                </button>
              ) : (
                <p className="muted">
                  Only the owner can enable private case AI.
                </p>
              )}
              {(!info.embeddingsConfigured || !info.reasoningConfigured) && (
                <p className="notice">
                  Configure GEMINI_API_KEY on the API to enable semantic
                  retrieval and reviewable recommendations.
                </p>
              )}
            </>
          )}
          <button
            className="button secondary"
            disabled={
              busy ||
              !selected?.connected ||
              !info.enabled ||
              !info.embeddingsConfigured ||
              Boolean(active) ||
              info.dailyUsed >= info.dailyLimit
            }
            onClick={() => void action(() => retrieve(record))}
          >
            {active
              ? 'Retrieving precedents…'
              : run
                ? 'Retrieve again'
                : 'Find potential precedents'}
          </button>
        </>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {run?.stale && (
        <p className="notice">
          This result belongs to an older case version or consent setting.
          Retrieve again for a current review.
        </p>
      )}
      {run?.status === 'failed' && (
        <p className="notice error" role="alert">
          {run.error === 'daily_limit'
            ? 'The daily call limit was reached. Usage resets at midnight UTC.'
            : run.error === 'invalid_output'
              ? 'The provider response did not pass validation. No recommendation was accepted.'
              : 'Precedent retrieval failed after bounded retries. Check provider credentials and quota, then retrieve again.'}
        </p>
      )}
      {run?.status === 'cancelled' && (
        <p className="notice">
          Retrieval stopped because consent, access or case context changed.
        </p>
      )}
      {run?.status === 'completed' && !run.stale && (
        <>
          <p className="muted">
            {run.indexedCount} of {run.eligibleCount} prior decisions indexed.
            {run.indexedCount < run.eligibleCount
              ? ' Some prior decisions are not indexed yet. Retrieve again to process the next batch or retry failed indexing.'
              : ''}
          </p>
          {!run.matches.length && (
            <p className="notice">
              No indexed prior decision met the similarity threshold. This does
              not prove that no relevant precedent exists.
            </p>
          )}
          {run.matches.map((match) => (
            <article
              className="candidate-source content-stack"
              key={match.case.id}
            >
              <div className="panel-title">
                <h3>
                  <Link href={caseHref(match.case.id, record.channelId)}>
                    {match.case.title}
                  </Link>
                </h3>
                <span className="status">
                  Similarity {Math.round(match.similarity * 100)}%
                </span>
              </div>
              <p>
                {match.case.ruleTitle} v{match.case.ruleVersion} ·{' '}
                {caseOutcomeLabels[match.case.outcome!]} ·{' '}
                {match.case.origin === 'demo_fixture'
                  ? 'Demo fixture'
                  : 'Manual import'}
              </p>
              <p className="case-prose">{match.incident}</p>
              <p className="case-prose">
                <strong>Human rationale:</strong> {match.rationale}
              </p>
              {match.followUp && (
                <p>
                  <strong>Follow-up:</strong> {match.followUp}
                </p>
              )}
            </article>
          ))}
        </>
      )}
      {run?.recommendation && !run.stale && (
        <div className="candidate-source content-stack">
          <h3>AI suggestion · Human review required</h3>
          <p className="case-prose">{run.recommendation.summary}</p>
          <p>
            <strong>Proposed outcome:</strong>{' '}
            {caseOutcomeLabels[run.recommendation.proposed_action]}
          </p>
          {run.recommendation.comparisons.map((comparison) => (
            <div key={comparison.case_id}>
              <Link href={caseHref(comparison.case_id, record.channelId)}>
                View cited precedent
              </Link>
              <p>
                <strong>Similarities:</strong> {comparison.similarities}
              </p>
              <p>
                <strong>Differences:</strong> {comparison.differences}
              </p>
            </div>
          ))}
          <h4>Evidence gaps</h4>
          {run.recommendation.evidence_gaps.length ? (
            <ul>
              {run.recommendation.evidence_gaps.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : (
            <p>None flagged by the model. Check the file yourself.</p>
          )}
          <h4>Uncertainties</h4>
          {run.recommendation.uncertainties.length ? (
            <ul>
              {run.recommendation.uncertainties.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : (
            <p>None flagged; this remains a suggestion.</p>
          )}
          <p>
            <strong>Next step:</strong> {run.recommendation.suggested_next_step}
          </p>
          <p className="muted">
            Source cases:{' '}
            {run.recommendation.source_record_ids.map((id, index) => (
              <span key={id}>
                {index ? ', ' : ''}
                <Link href={caseHref(id, record.channelId)}>
                  {id === record.id ? 'This case' : `Precedent ${index}`}
                </Link>
              </span>
            ))}
          </p>
        </div>
      )}
      {editable && (
        <DecisionForm
          record={record}
          recommendation={run && !run.stale ? run.recommendation : null}
          runId={run && !run.stale ? run.id : null}
          onDecided={onDecided}
        />
      )}
    </section>
  );
}
function DecisionForm({
  record,
  recommendation,
  runId,
  onDecided,
}: {
  record: CaseDetail;
  recommendation: CaseRecommendation | null;
  runId: string | null;
  onDecided: (record: CaseDetail) => void;
}) {
  const { decide } = useCases();
  const [outcome, setOutcome] =
    useState<z.infer<typeof caseOutcomeSchema>>('no_action');
  const [rationale, setRationale] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [disposition, setDisposition] = useState<
    'accepted' | 'modified' | 'rejected' | ''
  >('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    setDisposition('');
  }, [runId]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      onDecided(
        await decide(
          record,
          decideCaseSchema.parse({
            expectedVersion: record.version,
            requestId: requestId.current,
            outcome,
            rationale,
            followUp,
            aiRunId: recommendation ? runId : null,
            aiDisposition: recommendation ? disposition || null : null,
          }),
        ),
      );
    } catch (error) {
      setError(
        error instanceof z.ZodError
          ? 'Choose an outcome and add a clear decision rationale.'
          : error instanceof Error
            ? error.message
            : 'Could not save this decision.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="content-stack decision-form"
      onSubmit={(e) => {
        e.preventDefault();
        setConfirm(true);
      }}
      onChange={() => {
        requestId.current = crypto.randomUUID();
      }}
    >
      <h3>Your decision</h3>
      <p className="muted">
        Record your own conclusion and rationale. Saving makes this case
        read-only; later reviews should be new cases.
      </p>
      {recommendation && (
        <>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setOutcome(recommendation.proposed_action);
              setRationale(recommendation.summary);
              setFollowUp(recommendation.suggested_next_step);
              setDisposition('accepted');
              requestId.current = crypto.randomUUID();
            }}
          >
            Use recommendation as a draft
          </button>
          <label className="field">
            How did you review the AI suggestion?
            <select
              value={disposition}
              required
              onChange={(e) =>
                setDisposition(e.target.value as typeof disposition)
              }
              disabled={busy}
            >
              <option value="">Choose your assessment</option>
              <option value="accepted">Accept the suggested outcome</option>
              <option value="modified">Change the suggestion</option>
              <option value="rejected">Reject the suggestion</option>
            </select>
          </label>
        </>
      )}
      <label className="field">
        Decision
        <select
          value={outcome}
          onChange={(e) => {
            setOutcome(caseOutcomeSchema.parse(e.target.value));
            if (disposition === 'accepted') setDisposition('modified');
          }}
          disabled={busy}
        >
          {Object.entries(caseOutcomeLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Decision rationale
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          maxLength={3000}
          required
          rows={4}
          disabled={busy}
        />
      </label>
      <label className="field">
        Follow-up (optional)
        <textarea
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          maxLength={1000}
          rows={2}
          disabled={busy}
        />
      </label>
      {error && !confirm && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        Review human decision
      </button>
      {confirm && (
        <ConfirmDialog
          title="Save this human decision?"
          confirmLabel="Save human decision"
          busy={busy}
          onConfirm={() => void save()}
          onCancel={() => setConfirm(false)}
        >
          <p>
            {caseOutcomeLabels[outcome]} · This records your decision in Lore
            and preserves the audit trail. Twitch actions remain manual.
          </p>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </form>
  );
}
