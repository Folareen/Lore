'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import {
  candidateKindLabels,
  candidateStatusSchema,
  reviewCandidateSchema,
  type AiStatus,
  type Candidate,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { useCandidates } from './candidates-context';
const failureLabels = {
  provider_unavailable:
    'Provider unavailable. Check the server key, quota and connection.',
  invalid_output: 'The response did not pass evidence validation.',
  source_unavailable: 'The source expired or was removed.',
  daily_limit: 'Daily call limit reached. Usage resets at midnight UTC.',
  disabled: 'Consent or channel access changed.',
};
export function CandidatesScreen() {
  const { selected, href } = useWorkspace();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR CALL, ALWAYS</p>
          <h1>Worth following up?</h1>
          <p>
            Chat moves fast. Review the possibilities before keeping a promise.
          </p>
        </div>
        <ClipboardCheck size={30} aria-hidden="true" />
      </div>
      {selected ? (
        <ReviewPanel key={selected.id} />
      ) : (
        <div className="empty-state">
          <h2>Choose your community first.</h2>
          <Link className="button primary" href={href('overview')}>
            Go to your channels
          </Link>
        </div>
      )}
    </>
  );
}
function ReviewPanel() {
  const { selected, preview } = useWorkspace();
  const { load, status: loadStatus, enable, analyze } = useCandidates();
  const [items, setItems] = useState<Candidate[]>([]);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [filter, setFilter] = useState<Candidate['status']>('pending');
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const channelId = selected!.id;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setCursor(null);
    Promise.all([
      load(channelId, filter, controller.signal),
      loadStatus(channelId, controller.signal),
    ])
      .then(([page, info]) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setStatus(info);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not load candidates.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // Reload on explicit changes; provider functions close over the current demo state.
  }, [channelId, filter, revision]);
  useEffect(() => {
    if (preview || !status?.enabled || busy || items.length > 50) return;
    const timer = setInterval(() => setRevision((value) => value + 1), 15_000);
    return () => clearInterval(timer);
  }, [preview, status?.enabled, busy, items.length]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
      setRevision((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not complete this action.',
      );
    } finally {
      setBusy(false);
    }
  }
  const active = status?.recentRuns.some((run) =>
    ['queued', 'processing'].includes(run.status),
  );
  return (
    <div className="content-stack">
      <section className="panel content-stack" aria-label="Extraction settings">
        <div className="panel-title">
          <h2>Catch possible follow-ups</h2>
          <span className="status purple">
            {preview ? 'Demo fixture' : status?.enabled ? 'Enabled' : 'Off'}
          </span>
        </div>
        <p className="panel-description">
          On Google’s free tier, inputs and outputs may be used to improve its
          products. When enabled, retained chat from this channel is sent to
          Google Gemini in small batches. Suggestions stay private to your team
          and expire with the original chat. Confirming one keeps its source as
          evidence.
        </p>
        {status && (
          <>
            <p className="muted">
              {status.model} · {status.dailyUsed}/{status.dailyLimit} calls
              today (UTC)
            </p>
            {!status.configured && (
              <p className="notice">
                Add GEMINI_API_KEY to the API’s local .env and restart the API
                to enable extraction.
              </p>
            )}
            {preview ? (
              <p className="notice">
                These are sample suggestions. No chat or credentials are sent to
                a provider.
              </p>
            ) : (
              <div className="button-row">
                {selected?.role === 'owner' ? (
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      (!status.enabled &&
                        (!status.configured || !selected.connected))
                    }
                    onClick={() =>
                      void action(() => enable(channelId, !status.enabled))
                    }
                  >
                    {status.enabled
                      ? 'Disable extraction'
                      : 'Enable Gemini for this channel'}
                  </button>
                ) : (
                  <p className="muted">
                    Only the channel owner can change extraction consent.
                  </p>
                )}
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !selected?.connected ||
                    !status.enabled ||
                    !status.configured ||
                    active ||
                    status.dailyUsed >= status.dailyLimit
                  }
                  onClick={() => void action(() => analyze(channelId))}
                >
                  {active ? 'Analyzing chat…' : 'Analyze new chat'}
                </button>
              </div>
            )}
            {!!status.recentRuns.length && (
              <details>
                <summary>Recent extractions</summary>
                <ul className="extraction-runs">
                  {status.recentRuns.map((run) => (
                    <li key={run.id}>
                      <span>
                        {new Date(run.createdAt).toLocaleString()} ·{' '}
                        {run.status} · {run.attempts} calls
                        {run.error ? ` · ${failureLabels[run.error]}` : ''}
                      </span>
                      {run.status === 'failed' && (
                        <button
                          className="button secondary"
                          disabled={
                            busy ||
                            !status.enabled ||
                            !selected?.connected ||
                            active ||
                            status.dailyUsed >= status.dailyLimit
                          }
                          onClick={() =>
                            void action(() => analyze(channelId, run.id))
                          }
                        >
                          Retry extraction
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
      <div className="button-row">
        <label className="field">
          Show
          <select
            disabled={busy}
            value={filter}
            onChange={(event) => {
              setItems([]);
              setFilter(candidateStatusSchema.parse(event.target.value));
            }}
          >
            <option value="pending">Needs review</option>
            <option value="confirmed">Confirmed</option>
            <option value="dismissed">Dismissed</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <button
          className="button secondary"
          disabled={loading || busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading candidates…</p>}
      {!loading && !items.length && !error && (
        <div className="empty-state">
          <ClipboardCheck size={28} aria-hidden="true" />
          <h2>
            {filter === 'pending'
              ? 'Nothing waiting on your call.'
              : 'No candidates here yet.'}
          </h2>
          <p>
            {filter === 'pending'
              ? 'New suggestions appear here after enabled extraction finds a possible follow-up. Nothing enters your brief automatically.'
              : 'Reviewed items keep the human decision; drafts disappear when their source expires.'}
          </p>
        </div>
      )}
      {items.map((candidate) => (
        <CandidateCard
          key={`${candidate.id}-${candidate.version}`}
          candidate={candidate}
          onReviewed={() => setRevision((value) => value + 1)}
        />
      ))}
      {cursor && (
        <button
          className="button secondary"
          disabled={busy || loading}
          onClick={() => {
            setBusy(true);
            void load(channelId, filter, undefined, cursor)
              .then((page) => {
                setItems((current) => [...current, ...page.items]);
                setCursor(page.nextCursor);
              })
              .catch((error: unknown) =>
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Could not load more candidates.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Load more
        </button>
      )}
    </div>
  );
}
function CandidateCard({
  candidate,
  onReviewed,
}: {
  candidate: Candidate;
  onReviewed: () => void;
}) {
  const { selected, href } = useWorkspace();
  const { confirm, dismiss } = useCandidates();
  const [wording, setWording] = useState(candidate.draft?.summary || '');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'confirm' | 'dismiss' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function review(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'dismiss') {
        if (!reason.trim())
          throw new Error('Add a reason for dismissing this suggestion.');
        await dismiss(candidate, reason.trim());
        onReviewed();
      } else {
        const input = reviewCandidateSchema.parse({
          wording,
          expectedVersion: candidate.version,
          requestId,
          ...(owner.trim() ? { ownerLabel: owner } : {}),
          ...(due.trim() ? { dueContext: due } : {}),
        });
        setSavedId(await confirm(candidate, input));
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not review this candidate.',
      );
    } finally {
      setBusy(false);
    }
  }
  const draft = candidate.draft;
  const loopId = savedId || candidate.confirmedOpenLoopId;
  return (
    <article
      className="panel content-stack candidate-card"
      aria-label={draft?.summary || 'Expired source'}
    >
      <div className="panel-title">
        <span className="eyebrow">
          {draft ? candidateKindLabels[draft.task_type] : 'Source unavailable'}
        </span>
        <span className="status purple">
          {savedId
            ? 'Confirmed by you'
            : candidate.status === 'pending'
              ? 'AI suggestion · Needs human review'
              : candidate.status}
        </span>
      </div>
      <h2>
        {draft?.summary ||
          'The original chat and draft are no longer retained.'}
      </h2>
      <p className="muted">
        {candidate.origin === 'demo_fixture' ? 'Demo fixture' : 'Live Twitch'} ·
        Gemini · {candidate.model}
      </p>
      {candidate.source.available ? (
        <div className="candidate-source">
          <h3>Original chat</h3>
          <blockquote>{candidate.source.text}</blockquote>
          {draft && (
            <p>
              <strong>Cited words:</strong> <q>{draft.source_quote}</q>
            </p>
          )}
        </div>
      ) : (
        <p className="notice">
          The original source expired or was removed. It cannot be newly
          confirmed.
        </p>
      )}
      {draft && (
        <>
          <div className="candidate-context">
            <div>
              <h3>Evidence gaps</h3>
              {draft.evidence_gaps.length ? (
                <ul>
                  {draft.evidence_gaps.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  None flagged by the model. Check the context yourself.
                </p>
              )}
            </div>
            <div>
              <h3>Uncertainties</h3>
              {draft.uncertainties.length ? (
                <ul>
                  {draft.uncertainties.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  None flagged by the model; this is still unconfirmed.
                </p>
              )}
            </div>
          </div>
          <p>
            <strong>Suggested next step:</strong> {draft.suggested_next_step}
          </p>
        </>
      )}
      {candidate.reviewedByTwitchUserId && (
        <p className="muted">
          Reviewed by Twitch user {candidate.reviewedByTwitchUserId}
          {candidate.reviewedAt
            ? ` · ${new Date(candidate.reviewedAt).toLocaleString()}`
            : ''}
          {candidate.reviewReason ? ` · ${candidate.reviewReason}` : ''}
        </p>
      )}
      {loopId ? (
        <p role="status">
          Promise confirmed.{' '}
          <Link
            href={`${href('streamer')}${href('streamer').includes('?') ? '&' : '?'}loop=${loopId}#loop-${loopId}`}
          >
            View saved promise
          </Link>{' '}
          · <Link href={href('brief')}>Open next-stream brief</Link>
        </p>
      ) : (
        candidate.status === 'pending' &&
        draft &&
        candidate.source.available && (
          <>
            {!selected?.connected && (
              <p className="notice">
                Reconnect the channel before reviewing suggestions.
              </p>
            )}
            <div className="button-row">
              <button
                className="button primary"
                disabled={busy || !selected?.connected}
                onClick={() => setMode('confirm')}
              >
                Review as promise
              </button>
              <button
                className="button secondary"
                disabled={busy || !selected?.connected}
                onClick={() => setMode('dismiss')}
              >
                Dismiss suggestion
              </button>
            </div>
            {mode && (
              <form
                className="content-stack"
                onSubmit={review}
                onChange={() => setRequestId(crypto.randomUUID())}
              >
                {mode === 'confirm' ? (
                  <>
                    <p className="notice">
                      Only confirm a real commitment. This saves a confirmed
                      promise and retains the original chat as team-only
                      evidence.
                    </p>
                    <label className="field">
                      Promise wording
                      <textarea
                        value={wording}
                        onChange={(event) => setWording(event.target.value)}
                        maxLength={2000}
                        required
                        disabled={busy}
                        rows={3}
                      />
                    </label>
                    <div className="promise-fields">
                      <label className="field">
                        Follow-up owner (optional)
                        <input
                          value={owner}
                          onChange={(event) => setOwner(event.target.value)}
                          maxLength={100}
                          disabled={busy}
                        />
                      </label>
                      <label className="field">
                        Due context (optional)
                        <input
                          value={due}
                          onChange={(event) => setDue(event.target.value)}
                          maxLength={200}
                          disabled={busy}
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <label className="field">
                    Why dismiss this suggestion?
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={1000}
                      required
                      rows={2}
                      disabled={busy}
                    />
                  </label>
                )}
                {error && (
                  <p className="notice error" role="alert">
                    {error}
                  </p>
                )}
                <div className="button-row">
                  <button
                    className={`button ${mode === 'confirm' ? 'primary' : 'danger'}`}
                    disabled={busy}
                  >
                    {busy
                      ? 'Saving…'
                      : mode === 'confirm'
                        ? 'Confirm promise'
                        : 'Confirm dismissal'}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setMode(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        )
      )}
    </article>
  );
}
