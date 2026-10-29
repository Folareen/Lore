'use client';
import { useState } from 'react';
import { z } from 'zod';
import type { CreateCase } from '@lore/shared';
export type CaseFields = Omit<CreateCase, 'requestId'>;
export const emptyCaseFields: CaseFields = {
  title: '',
  subjectReference: '',
  incident: '',
  appeal: '',
  incidentAt: null,
  ruleTitle: '',
  ruleVersion: '',
  ruleText: '',
};
export function CaseForm({
  initial = emptyCaseFields,
  label,
  onSave,
  onCancel,
}: {
  initial?: CaseFields;
  label: string;
  onSave: (input: CaseFields) => Promise<void>;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<CaseFields>(() => ({
    title: initial.title,
    subjectReference: initial.subjectReference,
    incident: initial.incident,
    appeal: initial.appeal,
    incidentAt: initial.incidentAt,
    ruleTitle: initial.ruleTitle,
    ruleVersion: initial.ruleVersion,
    ruleText: initial.ruleText,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = (
    name: keyof Omit<CaseFields, 'incidentAt'>,
    title: string,
    max: number,
    rows?: number,
    required = true,
  ) => (
    <label className="field" key={name}>
      {title}
      {rows ? (
        <textarea
          value={fields[name]}
          onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
          maxLength={max}
          rows={rows}
          required={required}
          disabled={busy}
        />
      ) : (
        <input
          value={fields[name]}
          onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
          maxLength={max}
          required={required}
          disabled={busy}
        />
      )}
    </label>
  );
  return (
    <form
      className="panel content-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await onSave(fields);
        } catch (error) {
          setError(
            error instanceof z.ZodError
              ? 'Complete the required fields with valid text and check their lengths.'
              : error instanceof Error
                ? error.message
                : 'Could not save this case.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{label}</h2>
      <p className="muted">
        Private to the channel owner and approved moderators. Manual entries
        keep their origin label.
      </p>
      {text('title', 'Case title', 200)}
      {text('subjectReference', 'Subject reference', 150)}
      {text('incident', 'Incident details', 4000, 4)}
      {text('appeal', 'Appeal text (optional)', 4000, 3, false)}
      <label className="field">
        Incident time (optional)
        <input
          type="datetime-local"
          value={fields.incidentAt ? localDate(fields.incidentAt) : ''}
          disabled={busy}
          onChange={(e) =>
            setFields({
              ...fields,
              incidentAt: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
            })
          }
        />
      </label>
      <div className="promise-fields">
        {text('ruleTitle', 'Channel rule', 150)}
        {text('ruleVersion', 'Rule version', 100)}
      </div>
      {text('ruleText', 'Rule text at the time', 2000, 3)}
      <p className="muted">
        This snapshot stays with the case so later rule changes do not rewrite
        its context.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : label}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
function localDate(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
