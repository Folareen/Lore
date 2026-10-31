'use client';
import { Select } from '../../components/select';
import { useState } from 'react';
import Link from 'next/link';
import {
  updateHandoffTaskSchema,
  type Handoff,
  type HandoffItem,
  type ModerationDesk,
} from '@lore/shared';
import { useCases } from '../cases/cases-context';
import { useWorkspace } from '../workspace/workspace-context';
import { useModeration } from './moderation-context';
import {
  AssigneeField,
  NoteField,
  WorkflowForm,
  value,
} from './workflow-forms';
export function Handoffs({
  data,
  editable,
  onChanged,
}: {
  data: ModerationDesk;
  editable: boolean;
  onChanged: () => void;
}) {
  return (
    <section className="content-stack" aria-label="Moderator handoffs">
      <h2>Leave the next shift in the loop.</h2>
      <p className="muted">
        Snapshots carry unresolved cases, open reviews and pending actions. Each
        new shift starts with pending tasks; responsibility and the latest note
        carry forward. Resolving a handoff task only resolves that shift’s task.
      </p>
      {!data.handoffs.length && (
        <p className="notice">
          No handoff yet. Generate one from the channel’s saved records.
        </p>
      )}
      {data.handoffs.map((h, index) => (
        <HandoffBundle
          key={h.id}
          handoff={h}
          people={data.assignees}
          editable={editable}
          onChanged={onChanged}
          latest={index === 0}
        />
      ))}
    </section>
  );
}
function HandoffBundle({
  handoff: h,
  people,
  editable,
  onChanged,
  latest,
}: {
  handoff: Handoff;
  people: ModerationDesk['assignees'];
  editable: boolean;
  onChanged: () => void;
  latest: boolean;
}) {
  const { caseHref } = useCases();
  const { href } = useWorkspace();
  const unresolved = h.items.filter((i) => i.status !== 'resolved').length;
  return (
    <details className="panel content-stack" open={latest}>
      <summary className="workflow-summary">
        <strong>Shift · {new Date(h.periodEnd).toLocaleString()}</strong>
        <span className="status purple">
          {unresolved ? `${unresolved} outstanding` : 'All tasks resolved'}
        </span>
      </summary>
      <div className="content-stack">
        <p>{h.summary}</p>
        <p className="muted">
          Changes since {new Date(h.periodStart).toLocaleString()} · Generated
          by Twitch user {h.createdByTwitchUserId}. This is a saved snapshot;
          open sources for their current state.
        </p>
        {h.truncated && (
          <p className="notice">
            This handoff reached its source limit. Check the case, review and
            repair lists for work outside this snapshot.
          </p>
        )}
        <div className="workflow-comparison">
          <section className="candidate-source">
            <h3>Recent human decisions</h3>
            {!h.recentDecisions.length && (
              <p className="muted">No new decisions in this period.</p>
            )}
            {h.recentDecisions.map((c) => (
              <p key={c.id}>
                <Link className="text-link" href={caseHref(c.id, h.channelId)}>
                  {c.title}
                </Link>{' '}
                · {c.outcome?.replaceAll('_', ' ')}
              </p>
            ))}
          </section>
          <section className="candidate-source">
            <h3>Rule context in changed cases</h3>
            <p className="muted">
              Documented case snapshots, not a rule-change ledger.
            </p>
            {!h.ruleContexts.length && (
              <p className="muted">No changed case snapshots in this period.</p>
            )}
            {h.ruleContexts.map((r) => (
              <p key={r.caseId}>
                <Link
                  className="text-link"
                  href={caseHref(r.caseId, h.channelId)}
                >
                  {r.title} · v{r.version}
                </Link>
              </p>
            ))}
          </section>
        </div>
        <section className="candidate-source content-stack">
          <h3>Documented rule changes</h3>
          {!h.ruleChanges.length && (
            <p className="muted">No rule changes recorded in this period.</p>
          )}
          {h.ruleChanges.map((r) => (
            <article key={r.id}>
              <h4>
                {r.title} · {r.previousVersion} → {r.version}
              </h4>
              <p className="case-prose">{r.changeSummary}</p>
              <p className="case-prose">{r.ruleText}</p>
              <Link
                className="text-link"
                href={`${href('workflows')}#rule-${r.id}`}
              >
                Source rule-change record
              </Link>
            </article>
          ))}
        </section>
        {!h.items.length && (
          <p className="notice">No pending work at generation time.</p>
        )}
        {h.items.map((item) => (
          <Task
            key={`${item.id}-${item.version}`}
            item={item}
            people={people}
            editable={editable}
            onChanged={onChanged}
          />
        ))}
      </div>
    </details>
  );
}
function Task({
  item,
  people,
  editable,
  onChanged,
}: {
  item: HandoffItem;
  people: ModerationDesk['assignees'];
  editable: boolean;
  onChanged: () => void;
}) {
  const api = useModeration(),
    { caseHref } = useCases();
  const [editing, setEditing] = useState(false);
  const source =
    caseHref(item.caseId, item.channelId) +
    (item.sourceType === 'case' ? '' : `#${item.sourceType}-${item.sourceId}`);
  return (
    <article className="candidate-source content-stack" aria-label={item.title}>
      <div className="panel-title">
        <h3>{item.title}</h3>
        <span className="status purple">{item.status}</span>
      </div>
      <p className="muted">
        {item.sourceType} · source v{item.sourceVersion} ·{' '}
        {people.find((p) => p.id === item.assigneeId)?.displayName ??
          (item.assigneeId
            ? 'Previous assignee · access unavailable'
            : 'Unassigned')}
      </p>
      {item.note && <p className="case-prose">{item.note}</p>}
      <Link className="text-link" href={source}>
        Open source record
      </Link>
      {editable &&
        item.status !== 'resolved' &&
        (!editing ? (
          <button className="button secondary" onClick={() => setEditing(true)}>
            Update handoff task
          </button>
        ) : (
          <WorkflowForm
            label="Save handoff task"
            onCancel={() => setEditing(false)}
            onSave={async (form) => {
              await api.task(
                item.channelId,
                item.handoffId,
                item.id,
                updateHandoffTaskSchema.parse({
                  expectedVersion: item.version,
                  status: value(form, 'status'),
                  assigneeId: value(form, 'assigneeId') || null,
                  note: value(form, 'note'),
                }),
              );
              setEditing(false);
              onChanged();
            }}
          >
            <label className="field">
              Task status
              <Select name="status" defaultValue={item.status}>
                {item.status === 'pending' && (
                  <option value="pending">Pending</option>
                )}
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved for this shift</option>
              </Select>
            </label>
            <AssigneeField people={people} initial={item.assigneeId} />
            <NoteField
              label="Handoff note / resolution"
              initial={item.note ?? ''}
            />
          </WorkflowForm>
        ))}
    </article>
  );
}
