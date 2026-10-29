'use client';
import { useState } from 'react';
import { recordRuleChangeSchema, type ModerationDesk } from '@lore/shared';
import { useModeration } from './moderation-context';
import { WorkflowForm, value } from './workflow-forms';
export function RuleChanges({
  data,
  channelId,
  editable,
  onChanged,
  onMore,
  busy,
}: {
  data: ModerationDesk;
  channelId: string;
  editable: boolean;
  onChanged: () => void;
  onMore: () => void;
  busy: boolean;
}) {
  const api = useModeration();
  const [creating, setCreating] = useState(false),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return (
    <details className="panel content-stack">
      <summary>Channel rule changes</summary>
      <div className="content-stack">
        <p className="muted">
          Document an agreed rule change for future shifts. This record leaves
          earlier case snapshots intact and does not update Twitch rules.
        </p>
        {editable && (
          <button
            className="button secondary"
            onClick={() => {
              setRequestId(crypto.randomUUID());
              setCreating(!creating);
            }}
          >
            Document a rule change
          </button>
        )}
        {creating && (
          <WorkflowForm
            label="Save rule change"
            onCancel={() => setCreating(false)}
            onSave={async (f) => {
              await api.ruleChange(
                channelId,
                recordRuleChangeSchema.parse({
                  requestId,
                  title: value(f, 'title'),
                  previousVersion: value(f, 'previousVersion'),
                  version: value(f, 'version'),
                  ruleText: value(f, 'ruleText'),
                  changeSummary: value(f, 'changeSummary'),
                }),
              );
              setCreating(false);
              onChanged();
            }}
          >
            <label className="field">
              Rule title
              <input name="title" required maxLength={150} />
            </label>
            <label className="field">
              Previous rule version
              <input name="previousVersion" required maxLength={100} />
            </label>
            <label className="field">
              New rule version
              <input name="version" required maxLength={100} />
            </label>
            <label className="field">
              Updated rule text
              <textarea name="ruleText" required maxLength={2000} />
            </label>
            <label className="field">
              What changed and why?
              <textarea name="changeSummary" required maxLength={2000} />
            </label>
          </WorkflowForm>
        )}
        {!data.ruleChanges.length && (
          <p className="muted">No documented rule changes.</p>
        )}
        {data.ruleChanges.map((r) => (
          <article
            className="candidate-source content-stack"
            id={`rule-${r.id}`}
            key={r.id}
          >
            <h3>
              {r.title} · {r.previousVersion} → {r.version}
            </h3>
            <p className="case-prose">{r.changeSummary}</p>
            <p className="case-prose">{r.ruleText}</p>
            <p className="muted">
              Twitch user {r.actorTwitchUserId} ·{' '}
              {new Date(r.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
        {data.nextCursors.ruleChanges && (
          <button className="button secondary" disabled={busy} onClick={onMore}>
            Load older rule changes
          </button>
        )}
      </div>
    </details>
  );
}
