'use client';
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { createOpenLoopSchema, type OpenLoop } from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
export function QuickCapture({
  channelId,
  disabled = false,
  onCreated,
}: {
  channelId: string;
  disabled?: boolean;
  onCreated?: (loop: OpenLoop) => void;
}) {
  const { captureLoop } = useWorkspace();
  const [wording, setWording] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [dueContext, setDueContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const requestId = useRef<string | undefined>(undefined);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaved('');
    requestId.current ||= crypto.randomUUID();
    const parsed = createOpenLoopSchema.safeParse({
      wording,
      ...(ownerLabel.trim() ? { ownerLabel } : {}),
      ...(dueContext.trim() ? { dueContext } : {}),
      requestId: requestId.current,
    });
    if (!parsed.success) {
      setError(
        'Add a promise of up to 2,000 characters. Keep the owner under 100 and the due context under 200 characters.',
      );
      return;
    }
    setBusy(true);
    try {
      const loop = await captureLoop(channelId, parsed.data);
      setWording('');
      setOwnerLabel('');
      setDueContext('');
      requestId.current = undefined;
      setSaved('Promise saved and confirmed.');
      onCreated?.(loop);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save this promise.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Save a promise</h2>
        <Plus size={19} aria-hidden="true" />
      </div>
      <p className="panel-description">
        Saving confirms this promise and keeps its wording as the source.
      </p>
      {disabled && (
        <p className="notice">
          Reconnect this channel to capture or update promises.
        </p>
      )}
      <form
        onSubmit={save}
        onChange={() => {
          requestId.current = undefined;
          setSaved('');
        }}
        className="content-stack"
      >
        <div className="field">
          <label htmlFor="promise-wording">What did we promise?</label>
          <textarea
            id="promise-wording"
            value={wording}
            onChange={(event) => setWording(event.target.value)}
            maxLength={2000}
            rows={3}
            required
            disabled={disabled || busy}
            placeholder="We’ll finish the community island tour next stream."
          />
        </div>
        <div className="promise-fields">
          <div className="field">
            <label htmlFor="promise-owner">
              Who’s following up? (optional)
            </label>
            <input
              id="promise-owner"
              value={ownerLabel}
              onChange={(event) => setOwnerLabel(event.target.value)}
              maxLength={100}
              disabled={disabled || busy}
              placeholder="A name or team"
            />
          </div>
          <div className="field">
            <label htmlFor="promise-due">
              When should we revisit it? (optional)
            </label>
            <input
              id="promise-due"
              value={dueContext}
              onChange={(event) => setDueContext(event.target.value)}
              maxLength={200}
              disabled={disabled || busy}
              placeholder="Next stream, Friday, after the update…"
            />
          </div>
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="inline-success" role="status">
            {saved}
          </p>
        )}
        <div>
          <button className="button primary" disabled={disabled || busy}>
            {busy ? 'Saving…' : 'Save promise'}
          </button>
        </div>
      </form>
    </section>
  );
}
