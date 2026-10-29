'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { addCaseEvidenceSchema, type CaseDetail } from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { useCases } from './cases-context';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function CaseEvidencePanel({
  record,
  editable,
  onChanged,
}: {
  record: CaseDetail;
  editable: boolean;
  onChanged: (record: CaseDetail) => void;
}) {
  const { preview } = useWorkspace();
  const { evidence, upload, removeEvidence, settings } = useCases();
  const [label, setLabel] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [storage, setStorage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    const controller = new AbortController();
    void settings(record.channelId, controller.signal)
      .then((info) => {
        if (!controller.signal.aborted) setStorage(info.storageConfigured);
      })
      .catch(() => {
        /* Retrieval settings also show configuration failures; text evidence remains usable. */
      });
    return () => controller.abort();
  }, [record.channelId]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (file) {
        if (
          file.size > 5 * 1024 * 1024 ||
          ![
            'image/png',
            'image/jpeg',
            'application/pdf',
            'text/plain',
          ].includes(file.type)
        )
          throw new Error('Choose a PNG, JPEG, PDF, or text file up to 5 MB.');
        onChanged(await upload(record, file, label, requestId.current));
      } else
        onChanged(
          await evidence(
            record,
            addCaseEvidenceSchema.parse({
              expectedVersion: record.version,
              requestId: requestId.current,
              label,
              excerpt,
              occurredAt: null,
              ...(sourceId.trim() ? { sourceEventId: sourceId.trim() } : {}),
            }),
          ),
        );
    } catch (error) {
      setError(
        error instanceof z.ZodError
          ? 'Add a label and a nonempty evidence excerpt.'
          : error instanceof Error
            ? error.message
            : 'Could not save evidence.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel content-stack">
      <h2>What’s in the file</h2>
      <p className="panel-description">
        Retained excerpts stay with this case when ordinary chat expires. File
        contents are not read by AI; add a text excerpt for context you want
        reviewed.
      </p>
      {!record.evidence.length && (
        <p className="notice">
          No evidence attached. Record gaps honestly; notes and files are not
          automatically verified facts.
        </p>
      )}
      {record.evidence.map((item) => (
        <article
          className="candidate-source content-stack"
          key={item.id}
          aria-label={item.label}
        >
          <div className="panel-title">
            <h3>{item.label}</h3>
            <span className="status">
              {item.removed
                ? 'Removed'
                : item.origin === 'demo_fixture'
                  ? 'Demo fixture'
                  : item.origin === 'live_twitch'
                    ? 'Live Twitch excerpt'
                    : 'Manual evidence'}
            </span>
          </div>
          {item.removed ? (
            <p className="muted">
              This evidence was removed. Its content is no longer retained here.
            </p>
          ) : (
            <>
              <p className="case-prose">{item.excerpt}</p>
              {item.sourceEventId && (
                <p className="muted">
                  Source {item.sourceEventId} · original{' '}
                  {item.originalAvailable
                    ? 'available'
                    : 'unavailable; retained excerpt preserved'}
                </p>
              )}
              {item.file && (
                <>
                  <p>
                    {item.file.name} · {Math.ceil(item.file.size / 1024)} KB
                  </p>
                  {item.file.available && !preview ? (
                    <a
                      className="button secondary"
                      href={`/api/channels/${record.channelId}/cases/${record.id}/files/${item.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download evidence file
                    </a>
                  ) : (
                    <p className="muted">
                      {preview
                        ? 'Demo file metadata only; no file download.'
                        : 'File upload incomplete or unavailable.'}
                    </p>
                  )}
                </>
              )}
              {editable && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setRemoving(item.id);
                    setReason('');
                  }}
                >
                  Remove evidence
                </button>
              )}
            </>
          )}
        </article>
      ))}
      {editable && (
        <details>
          <summary>Attach evidence</summary>
          <form
            className="content-stack evidence-form"
            onSubmit={save}
            onChange={() => {
              requestId.current = crypto.randomUUID();
            }}
          >
            <label className="field">
              Evidence label
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={150}
                required
                disabled={busy}
              />
            </label>
            <label className="field">
              Evidence file (optional)
              <input
                type="file"
                accept="image/png,image/jpeg,application/pdf,text/plain"
                disabled={busy || !storage}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            {!storage && (
              <p className="notice">
                R2 is not configured. Text evidence works now; configure R2 to
                attach files.
              </p>
            )}
            {!file && (
              <>
                <label className="field">
                  Evidence excerpt
                  <textarea
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    maxLength={4000}
                    required
                    rows={4}
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  Captured chat delivery ID (optional)
                  <input
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    maxLength={500}
                    disabled={busy || preview}
                  />
                </label>
                <p className="muted">
                  Without a delivery ID, this is a manual entry. A cited chat
                  excerpt must match available captured chat from this channel.
                </p>
              </>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Attaching…' : 'Retain evidence'}
            </button>
          </form>
        </details>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove retained evidence?"
          confirmLabel="Remove evidence"
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            if (!reason.trim()) {
              setError('Give a reason for removing this evidence.');
              return;
            }
            setBusy(true);
            setError('');
            void removeEvidence(record, removing, reason.trim())
              .then(onChanged)
              .catch((error: unknown) =>
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Could not remove evidence.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <p>
            The retained excerpt is cleared and any private R2 file is scheduled
            for deletion. The audit entry stays in the case.
          </p>
          <label className="field">
            Removal reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              required
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
