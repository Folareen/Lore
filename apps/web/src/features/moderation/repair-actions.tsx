'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  createRepairSchema,
  updateRepairSchema,
  repairTransitions,
  type CaseDetail,
  type ModerationDesk,
  type RepairAction,
} from '@lore/shared';
import { useCases } from '../cases/cases-context';
import { useModeration } from './moderation-context';
import {
  AssigneeField,
  NoteField,
  WorkflowForm,
  value,
} from './workflow-forms';
export function RepairActions({
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
  const [creating, setCreating] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const api = useModeration();
  const { caseHref } = useCases();
  return (
    <section className="content-stack" aria-label="Repair actions">
      <div className="panel-title">
        <h2>Repair & follow-through</h2>
        {record?.status === 'decided' && editable && (
          <button
            className="button secondary"
            onClick={() => {
              setRequestId(crypto.randomUUID());
              setCreating(!creating);
            }}
          >
            Agree an action
          </button>
        )}
      </div>
      <p className="muted">
        Human-agreed resolutions, re-entry conditions and follow-up. Assigning
        an action grants no additional access.
      </p>
      {record && record.status !== 'decided' && (
        <p className="notice">
          Record a human decision before agreeing repair actions.
        </p>
      )}
      {creating && record && (
        <WorkflowForm
          label="Save agreed action"
          onCancel={() => setCreating(false)}
          onSave={async (form) => {
            await api.createRepair(
              channelId,
              createRepairSchema.parse({
                requestId,
                caseId: record.id,
                title: value(form, 'title'),
                kind: value(form, 'kind'),
                agreement: value(form, 'agreement'),
                assigneeId: value(form, 'assigneeId') || null,
                dueAt: value(form, 'dueAt')
                  ? new Date(value(form, 'dueAt')).toISOString()
                  : null,
              }),
            );
            setCreating(false);
            onChanged();
          }}
        >
          <label className="field">
            Action title
            <input name="title" required maxLength={200} />
          </label>
          <label className="field">
            Action type
            <select name="kind">
              <option value="follow_up">Follow-up</option>
              <option value="repair">Community repair</option>
              <option value="re_entry">Re-entry condition</option>
            </select>
          </label>
          <label className="field">
            Agreed resolution or condition
            <textarea name="agreement" required maxLength={2000} rows={3} />
          </label>
          <AssigneeField people={data.assignees} />
          <label className="field">
            Due date & time (optional)
            <input name="dueAt" type="datetime-local" />
          </label>
          <p className="muted">
            Save only an agreement reached by people. This does not
            automatically restore access on Twitch.
          </p>
        </WorkflowForm>
      )}
      {!data.repairs.length && (
        <p className="notice">
          No agreed actions yet.
          {!record ? ' Open a decided case to create one.' : ''}
        </p>
      )}
      {data.repairs.map((action) => (
        <article
          className="panel content-stack"
          id={`repair-${action.id}`}
          key={`${action.id}-${action.version}`}
          aria-label={action.title}
        >
          <div className="panel-title">
            <h3>{action.title}</h3>
            <span className="status purple">
              {action.status.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="eyebrow">{action.kind.replaceAll('_', ' ')}</p>
          <p className="case-prose">{action.agreement}</p>
          <p className="muted">
            Assigned to{' '}
            {data.assignees.find((p) => p.id === action.assigneeId)
              ?.displayName ??
              (action.assigneeId
                ? 'previous moderator · access unavailable'
                : 'nobody yet')}
            {action.dueAt
              ? ` · Due ${new Date(action.dueAt).toLocaleString()}`
              : ''}
          </p>
          {action.completionNote && (
            <p className="case-prose">
              <strong>Final note:</strong> {action.completionNote}
            </p>
          )}
          {action.evidenceId && (
            <p className="muted">
              Completion cites retained evidence in the linked case.
            </p>
          )}
          <Link className="text-link" href={caseHref(action.caseId, channelId)}>
            Open source case
          </Link>
          {editable && !['completed', 'cancelled'].includes(action.status) && (
            <RepairUpdate
              action={action}
              record={record}
              people={data.assignees}
              onChanged={onChanged}
            />
          )}
        </article>
      ))}
    </section>
  );
}
function RepairUpdate({
  action,
  record,
  people,
  onChanged,
}: {
  action: RepairAction;
  record?: CaseDetail;
  people: ModerationDesk['assignees'];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const api = useModeration();
  if (!editing)
    return (
      <button className="button secondary" onClick={() => setEditing(true)}>
        Update action
      </button>
    );
  return (
    <WorkflowForm
      label="Save action update"
      onCancel={() => setEditing(false)}
      onSave={async (form) => {
        await api.updateRepair(
          action.channelId,
          action.id,
          updateRepairSchema.parse({
            expectedVersion: action.version,
            status: value(form, 'status'),
            assigneeId: value(form, 'assigneeId') || null,
            note: value(form, 'note'),
            evidenceId: value(form, 'evidenceId') || null,
          }),
        );
        setEditing(false);
        onChanged();
      }}
    >
      <label className="field">
        Action status
        <select name="status" defaultValue={action.status}>
          {[action.status, ...repairTransitions[action.status]].map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <AssigneeField people={people} initial={action.assigneeId} />
      <NoteField label="Progress, completion proof or cancellation reason" />
      {record && (
        <label className="field">
          Retained completion evidence (optional; completing only)
          <select name="evidenceId">
            <option value="">No evidence reference</option>
            {record.evidence
              .filter((e) => !e.removed && (!e.file || e.file.available))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
          </select>
        </label>
      )}
      <p className="muted">
        Completion and cancellation are final. Describe what was done; a saved
        update does not change the case decision.
      </p>
    </WorkflowForm>
  );
}
