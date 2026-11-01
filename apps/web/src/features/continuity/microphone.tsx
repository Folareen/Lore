'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FeatureControls } from './feature-controls';
import { z } from 'zod';
import { microphoneCaptureSchema, type MicrophoneCapture } from '@lore/shared';
import { apiRequest } from '../../lib/api';
import { useWorkspace } from '../workspace/workspace-context';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { useFeatureSettings } from './feature-settings';
import { useLiveRefresh } from './live-updates';

export function encodeMicrophoneWav(samples: Float32Array) {
  const count = Math.min(samples.length, 480000),
    bytes = new ArrayBuffer(44 + count * 2),
    view = new DataView(bytes);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
export function MicrophonePanel() {
  const { selected } = useWorkspace();
  return selected ? <MicrophoneCapturePanel key={selected.id} /> : null;
}
function MicrophoneCapturePanel() {
  const { selected, session, preview } = useWorkspace();
  const [open, setOpen] = useState(false),
    [phase, setPhase] = useState<
      'idle' | 'permission' | 'recording' | 'encoding' | 'sending'
    >('idle'),
    [clip, setClip] = useState<Blob>(),
    [clipUrl, setClipUrl] = useState(''),
    [captures, setCaptures] = useState<MicrophoneCapture[]>([]),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null),
    media = useRef<MediaStream | null>(null),
    alive = useRef(true),
    attempt = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { settings, error: settingsError } = useFeatureSettings(open);
  const channelId = selected!.id;
  const canRecord = useRef(false);
  useEffect(() => {
    canRecord.current = Boolean(
      open && settings?.microphoneEnabled && selected?.connected,
    );
  }, [open, settings?.microphoneEnabled, selected?.connected]);
  useLiveRefresh(channelId, () => setRevision((v) => v + 1));
  const stop = (cancel = false) => {
    if (cancel) {
      attempt.current += 1;
      if (alive.current) setPhase('idle');
    }
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    media.current?.getTracks().forEach((track) => track.stop());
  };
  useEffect(() => {
    alive.current = true;
    const hidden = () => {
      if (document.hidden) stop(true);
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false;
      stop(true);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (!settings?.microphoneEnabled) {
      stop(true);
      setClip(undefined);
      setCaptures([]);
    }
  }, [settings?.microphoneEnabled]);
  useEffect(() => {
    if (!clip) {
      setClipUrl('');
      return;
    }
    const url = URL.createObjectURL(clip);
    setClipUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clip]);
  useEffect(() => {
    if (!open || preview) return;
    const c = new AbortController();
    void apiRequest(
      `/channels/${channelId}/microphone`,
      z.array(microphoneCaptureSchema),
      { signal: c.signal },
    )
      .then((rows) => {
        if (!c.signal.aborted) setCaptures(rows);
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load microphone suggestions.',
          );
      });
    return () => c.abort();
  }, [channelId, open, preview, revision]);
  async function record() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError(
        'This browser cannot record a microphone here. Use HTTPS or localhost and a supported browser.',
      );
      return;
    }
    setError('');
    setClip(undefined);
    setPhase('permission');
    const recordingAttempt = ++attempt.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (
        !alive.current ||
        recordingAttempt !== attempt.current ||
        !canRecord.current ||
        document.hidden
      ) {
        if (alive.current && recordingAttempt === attempt.current)
          setPhase('idle');
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      media.current = stream;
      const chunks: Blob[] = [],
        recording = new MediaRecorder(stream);
      recorder.current = recording;
      recording.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onerror = () => {
        stop(true);
        if (alive.current) {
          setError('Recording failed. Try again or use dashboard capture.');
          setPhase('idle');
        }
      };
      recording.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!alive.current || recordingAttempt !== attempt.current) return;
        if (!canRecord.current) {
          setPhase('idle');
          return;
        }
        setPhase('encoding');
        try {
          const context = new AudioContext();
          let decoded: AudioBuffer;
          try {
            decoded = await context.decodeAudioData(
              await new Blob(chunks, {
                type: recording.mimeType,
              }).arrayBuffer(),
            );
          } finally {
            await context.close();
          }
          const output = new OfflineAudioContext(
            1,
            Math.max(1, Math.min(480000, Math.ceil(decoded.duration * 16000))),
            16000,
          );
          const source = output.createBufferSource();
          source.buffer = decoded;
          source.connect(output.destination);
          source.start();
          const normalized = await output.startRendering();
          if (
            alive.current &&
            recordingAttempt === attempt.current &&
            canRecord.current
          )
            setClip(encodeMicrophoneWav(normalized.getChannelData(0)));
        } catch {
          if (alive.current && recordingAttempt === attempt.current)
            setError(
              'Could not prepare this audio clip. Nothing was sent. Try again.',
            );
        } finally {
          if (alive.current && recordingAttempt === attempt.current)
            setPhase('idle');
        }
      };
      recording.start();
      setPhase('recording');
      timer.current = setTimeout(() => stop(), 30000);
    } catch {
      if (recordingAttempt !== attempt.current) return;
      media.current?.getTracks().forEach((track) => track.stop());
      if (alive.current) {
        setPhase('idle');
        setError(
          'Microphone access was not available. Allow it for this site or use dashboard capture.',
        );
      }
    }
  }
  const busy = phase !== 'idle';
  return (
    <details
      className="panel content-stack"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (!event.currentTarget.open) {
          canRecord.current = false;
          stop(true);
        }
      }}
    >
      <summary>Microphone follow-ups</summary>
      {open && (
        <>
          <p>
            Record up to 30 seconds, listen back, then explicitly send the clip
            to Gemini. Lore does not store raw audio. Transcripts are
            AI-generated and may be wrong; suggestions stay unconfirmed until a
            person reviews them.
          </p>
          <p className="muted">
            Recording stops when this panel closes, the tab is hidden or you
            leave this channel. Transcripts follow channel retention. Google may
            use free-tier inputs and outputs to improve its products.
          </p>
          {preview ? (
            <p className="notice">
              Demo fixture · microphone recording and provider calls are
              disabled. Review a seeded suggestion below to try the confirmation
              workflow.
            </p>
          ) : (
            <>
              {(error || settingsError) && (
                <p role="alert" className="notice error">
                  {error || settingsError}
                </p>
              )}
              {!settings?.microphoneEnabled && (
                <FeatureControls only={['microphoneEnabled']} expanded />
              )}
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={
                    busy || !settings?.microphoneEnabled || !selected?.connected
                  }
                  onClick={() => void record()}
                >
                  Start recording
                </button>
                {phase === 'recording' && (
                  <button className="button primary" onClick={() => stop()}>
                    Stop recording
                  </button>
                )}
              </div>
              {busy && (
                <p role="status">
                  {phase === 'recording'
                    ? 'Recording · stops automatically after 30 seconds'
                    : phase === 'sending'
                      ? 'Transcribing and finding suggestions…'
                      : phase === 'permission'
                        ? 'Waiting for microphone permission…'
                        : 'Preparing your clip…'}
                </p>
              )}
              {clip && (
                <div className="content-stack">
                  <audio
                    controls
                    src={clipUrl}
                    aria-label="Recorded clip preview"
                  />
                  <div className="button-row">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setClip(undefined)}
                    >
                      Discard clip
                    </button>
                    <button
                      className="button primary"
                      disabled={busy || !settings?.microphoneEnabled}
                      onClick={async () => {
                        setPhase('sending');
                        setError('');
                        const body = new FormData();
                        body.append('audio', clip, 'microphone.wav');
                        try {
                          await apiRequest(
                            `/channels/${channelId}/microphone`,
                            microphoneCaptureSchema,
                            {
                              method: 'POST',
                              csrfToken: session.csrfToken,
                              body,
                            },
                          );
                          if (alive.current) {
                            setClip(undefined);
                            setRevision((v) => v + 1);
                          }
                        } catch (e) {
                          if (alive.current)
                            setError(
                              e instanceof Error
                                ? e.message
                                : 'Could not transcribe the clip.',
                            );
                        } finally {
                          if (alive.current) setPhase('idle');
                        }
                      }}
                    >
                      Transcribe and find suggestions
                    </button>
                  </div>
                </div>
              )}
              <p className="muted">
                Showing the 10 most recent retained microphone captures.
              </p>
              {captures.map((capture) => (
                <VoiceReview
                  key={capture.id}
                  capture={capture}
                  onReviewed={() => setRevision((v) => v + 1)}
                />
              ))}
            </>
          )}
        </>
      )}
    </details>
  );
}
function VoiceReview({
  capture,
  onReviewed,
}: {
  capture: MicrophoneCapture;
  onReviewed: () => void;
}) {
  return (
    <section className="content-stack">
      <p className="record-meta">Gemini · microphone transcript · unverified</p>
      <p className="case-prose">
        {capture.transcript ?? 'Transcript unavailable'}
      </p>
      <p className="muted">
        {capture.model} · expires {new Date(capture.expiresAt).toLocaleString()}
      </p>
      {!capture.drafts?.length && <p>No reviewable follow-ups found.</p>}
      {capture.drafts?.map((draft, index) => (
        <VoiceSuggestion
          key={index}
          capture={capture}
          index={index}
          onReviewed={onReviewed}
          draft={draft}
        />
      ))}
    </section>
  );
}
function VoiceSuggestion({
  capture,
  index,
  onReviewed,
  draft,
}: {
  capture: MicrophoneCapture;
  index: number;
  onReviewed: () => void;
  draft: NonNullable<MicrophoneCapture['drafts']>[number];
}) {
  const { selected, session, href } = useWorkspace();
  const [wording, setWording] = useState(draft.summary),
    [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const decision = capture.decisions[String(index)];
  async function review(action: 'confirm' | 'dismiss') {
    setBusy(true);
    setError('');
    try {
      await apiRequest(
        `/channels/${selected!.id}/microphone/${capture.id}/${index}`,
        z.object({
          status: z.enum(['confirmed', 'dismissed']),
          openLoopId: z.uuid().nullable(),
        }),
        {
          method: 'POST',
          csrfToken: session.csrfToken,
          body: action === 'confirm' ? { action, wording } : { action, reason },
        },
      );
      setConfirm(false);
      onReviewed();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not review the suggestion.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="panel content-stack" aria-label={draft.summary}>
      <h3>{draft.summary}</h3>
      <blockquote>{draft.source_quote}</blockquote>
      <p>
        Evidence gaps:{' '}
        {draft.evidence_gaps.join(' · ') ||
          'None supplied; verify the transcript.'}
      </p>
      <p>
        Uncertainties:{' '}
        {draft.uncertainties.join(' · ') ||
          'None supplied; human review still required.'}
      </p>
      <p>{draft.suggested_next_step}</p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {decision ? (
        <p className="notice">
          {decision.status}
          {decision.openLoopId && (
            <>
              {' '}
              · <Link href={href('brief')}>Open the brief</Link>
            </>
          )}
        </p>
      ) : (
        <>
          <label className="field">
            Confirmed wording
            <input
              value={wording}
              onChange={(e) => setWording(e.target.value)}
              maxLength={2000}
              disabled={busy}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || !wording.trim() || !selected?.connected}
            onClick={() => setConfirm(true)}
          >
            Review microphone suggestion
          </button>
          <label className="field">
            Dismissal reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              disabled={busy}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || !reason.trim() || !selected?.connected}
            onClick={() => void review('dismiss')}
          >
            Dismiss microphone suggestion
          </button>
        </>
      )}
      {confirm && (
        <ConfirmDialog
          tone="primary"
          title="Confirm this microphone suggestion?"
          confirmLabel="Save confirmed promise"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => review('confirm')}
        >
          <p>
            Verify the transcript before confirming. This saves a promise and a
            separate retained source excerpt; it does not send to Twitch.
          </p>
          <p>{wording}</p>
        </ConfirmDialog>
      )}
    </article>
  );
}
