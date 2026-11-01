'use client';
import { useState } from 'react';
import type { ManagedPublication } from '@lore/shared';
import { usePublications } from './publications-context';
export function StoryScreenshotEditor({
  record,
  disabled,
  onChanged,
}: {
  record: ManagedPublication;
  disabled: boolean;
  onChanged: () => void;
}) {
  const api = usePublications();
  const [file, setFile] = useState<File | null>(null),
    [alt, setAlt] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(remove = false) {
    setBusy(true);
    setError('');
    try {
      await api.screenshot(record, remove ? null : file, alt);
      onChanged();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save screenshot.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="candidate-source">
      <summary>
        {record.screenshot
          ? 'Replace or remove screenshot'
          : 'Attach a screenshot'}
      </summary>
      <div className="content-stack">
        <p className="muted">
          One screenshot per story. PNG, JPEG or WebP, up to 5 MB. Changes
          return the story to draft for publication review.
        </p>
        <label className="field">
          Screenshot
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled || busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label className="field">
          Describe the screenshot
          <input
            value={alt}
            maxLength={200}
            disabled={disabled || busy}
            onChange={(event) => setAlt(event.target.value)}
          />
          <span className="muted">
            Describe what viewers should notice. This is also used as
            alternative text.
          </span>
        </label>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            disabled={disabled || busy || !file || !alt.trim()}
            onClick={() => void save()}
          >
            {busy
              ? 'Saving…'
              : record.screenshot
                ? 'Replace screenshot'
                : 'Upload screenshot'}
          </button>
          {record.screenshot && (
            <button
              type="button"
              className="button secondary"
              disabled={disabled || busy}
              onClick={() => void save(true)}
            >
              Remove screenshot
            </button>
          )}
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
