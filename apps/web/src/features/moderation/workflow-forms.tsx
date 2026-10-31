'use client';
import { Select } from '../../components/select';
import { useState } from 'react';
import type { ModerationDesk } from '@lore/shared';
export function AssigneeField({
  people,
  initial = null,
}: {
  people: ModerationDesk['assignees'];
  initial?: string | null;
}) {
  return (
    <label className="field">
      Assigned moderator
      <Select name="assigneeId" defaultValue={initial ?? ''}>
        <option value="">Unassigned</option>
        {initial && !people.some((p) => p.id === initial) && (
          <option value={initial}>
            Previous assignee · access unavailable
          </option>
        )}
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </Select>
    </label>
  );
}
export function WorkflowForm({
  children,
  label,
  onSave,
  onCancel,
}: {
  children: React.ReactNode;
  label: string;
  onSave: (data: FormData) => Promise<void>;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="content-stack workflow-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        void onSave(data)
          .catch((error: unknown) =>
            setError(
              error instanceof Error
                ? error.message
                : 'Could not save this change.',
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      <fieldset disabled={busy} className="content-stack">
        {children}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : label}
          </button>
          {onCancel && (
            <button
              className="button secondary"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
export function NoteField({
  label = 'Reason / progress note',
  initial = '',
}: {
  label?: string;
  initial?: string;
}) {
  return (
    <label className="field">
      {label}
      <textarea
        name="note"
        required
        maxLength={2000}
        rows={3}
        defaultValue={initial}
      />
    </label>
  );
}
export const value = (data: FormData, key: string) =>
  String(data.get(key) ?? '');
