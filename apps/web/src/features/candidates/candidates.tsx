'use client';
import { IconButton } from '../../components/icon-button';
import { formatDateTime } from '../../lib/date-time';
import { PageTitle } from '../../components/page-title';
import { RecordDialog } from '../../components/record-dialog';
import { Select } from '../../components/select';
import { useLiveRefresh } from '../continuity/live-updates';
import { MicrophonePanel } from '../continuity/microphone';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
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
          <PageTitle>Suggestions</PageTitle>
          <p>Check the source before confirming a promise.</p>
        </div>
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
  useLiveRefresh(channelId, () => setRevision((value) => value + 1));
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
      <details className="task-disclosure" id="chat-suggestions">
        <summary>Find suggestions in chat</summary>
        <section
          className="panel content-stack"
          aria-label="Extraction settings"
        >
          <div className="panel-title">
            <h2>Chat suggestions</h2>
            <span className="status purple">
              {preview ? 'Demo fixture' : status?.enabled ? 'Enabled' : 'Off'}
            </span>
          </div>
          <p className="panel-description">
            Gemini reviews retained chat when enabled. Suggestions stay private
            and need human confirmation. Google may use free-tier inputs and
            outputs to improve its products.
          </p>
          {status && (
            <>
              <p className="muted">
                {status.model} · {status.dailyUsed}/{status.dailyLimit} calls
                today (UTC)
              </p>
              {!status.configured && (
                <p className="notice">
                  Gemini is unavailable for this Lore instance. Its AI
                  configuration needs attention.
                </p>
              )}
              {preview ? (
                <p className="notice">
                  These are sample suggestions. No chat or credentials are sent
                  to a provider.
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
                        ? 'Disable chat suggestions'
                        : 'Enable chat suggestions'}
                    </button>
                  ) : (
                    <p className="muted">
                      Only the channel owner can enable chat suggestions.
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
                  <summary>Analysis history</summary>
                  <ul className="extraction-runs">
                    {status.recentRuns.map((run) => (
                      <li key={run.id}>
                        <span>
                          {formatDateTime(run.createdAt)} · {run.status} ·{' '}
                          {run.attempts} {run.attempts === 1 ? 'call' : 'calls'}
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
                            Retry analysis
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
      </details>
      <MicrophonePanel />
      <div className="list-toolbar">
        <label className="field">
          Show
          <Select
            disabled={busy}
            value={filter}
            onValueChange={(event) => {
              setItems([]);
              setFilter(candidateStatusSchema.parse(event));
            }}
          >
            <option value="pending">Needs review</option>
            <option value="confirmed">Confirmed</option>
            <option value="dismissed">Dismissed</option>
            <option value="expired">Expired</option>
          </Select>
        </label>
        <IconButton
          label="Refresh suggestions"
          disabled={loading || busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </IconButton>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading suggestions…</p>}
      {!loading && !items.length && !error && (
        <div className="empty-state">
          <ClipboardCheck size={28} aria-hidden="true" />
          <h2>
            {filter === 'pending'
              ? 'Nothing waiting on your call.'
              : 'No suggestions here yet.'}
          </h2>
          <p>
            {filter === 'pending'
              ? 'Open Find suggestions in chat to analyze retained messages, or record a microphone follow-up. Review each suggestion before it becomes a promise.'
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
  const [reviewOpen, setReviewOpen] = useState(false);
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
      className="candidate-card queue-record"
      aria-label={draft?.summary || 'Expired source'}
    >
      <div className="panel-title">
        <span className="record-meta">
          {draft ? candidateKindLabels[draft.task_type] : 'Source unavailable'}
        </span>
        <span className="status purple">
          {savedId
            ? 'Confirmed by you'
            : candidate.status === 'pending'
              ? 'Needs review'
              : candidate.status}
        </span>
      </div>
      <h2>
        {draft?.summary ||
          'The original chat and draft are no longer retained.'}
      </h2>
      <div className="candidate-row-footer">
        <span className="muted">
          {candidate.origin === 'demo_fixture' ? 'Demo fixture' : 'Twitch chat'}{' '}
          · AI suggestion
        </span>
        <button
          className="button secondary"
          onClick={() => setReviewOpen(true)}
        >
          Review suggestion
        </button>
      </div>
      <RecordDialog
        open={reviewOpen}
        title="Review suggestion"
        busy={busy}
        onClose={() => setReviewOpen(false)}
      >
        <h3 className="review-subject">
          {draft?.summary || 'Source unavailable'}
        </h3>
        <p className="muted">
          {candidate.origin === 'demo_fixture' ? 'Demo fixture' : 'Live Twitch'}{' '}
          · Gemini · {candidate.model}
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
                <h3>Missing context</h3>
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
                <h3>What to check</h3>
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
              ? ` · ${formatDateTime(candidate.reviewedAt)}`
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
                          autoFocus
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
                        autoFocus
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
      </RecordDialog>
    </article>
  );
}
