'use client';
import { Select } from '../../components/select';
import type { z } from 'zod';
import { useEffect, useState } from 'react';
import {
  publicationFieldsSchema,
  twitchClipIdFromUrl,
  type ManagedPublication,
  summaryDraftSchema,
  type PublicationFields,
  type OpenLoop,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { usePublications } from './publications-context';
import { publicationLabels } from './public-lore';
import { WorkflowForm } from '../moderation/workflow-forms';
export function PublicationForm({
  initial,
  suggested,
  sourcePromiseId,
  initialKind = 'milestone',
  onSave,
  onCancel,
}: {
  sourcePromiseId?: string;
  initialKind?: PublicationFields['kind'];
  initial?: ManagedPublication;
  suggested?: z.infer<typeof summaryDraftSchema>;
  onSave: (fields: PublicationFields) => Promise<void>;
  onCancel: () => void;
}) {
  const api = usePublications(),
    { selected, loadLoops, loadLoop } = useWorkspace();
  const [kind, setKind] = useState(
      initial?.kind ?? (suggested ? 'summary' : initialKind),
    ),
    [title, setTitle] = useState(initial?.title ?? suggested?.title ?? ''),
    [body, setBody] = useState(initial?.body ?? suggested?.body ?? ''),
    [clipUrl, setClipUrl] = useState(
      initial?.clipId ? `https://clips.twitch.tv/${initial.clipId}` : '',
    ),
    [chatSummary, setChatSummary] = useState(
      initial?.chatSummary ?? suggested?.chatSummary ?? '',
    ),
    [sources, setSources] = useState(
      new Set(initial?.sourceIds ?? suggested?.sourceIds ?? []),
    );
  const [choices, setChoices] = useState<ManagedPublication[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [promises, setPromises] = useState<OpenLoop[]>([]),
    [promiseCursor, setPromiseCursor] = useState<string | null>(null),
    [promiseId, setPromiseId] = useState(
      initial?.promiseId ?? sourcePromiseId ?? '',
    ),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const channelId = selected!.id;
  useEffect(() => {
    const c = new AbortController();
    void Promise.all([
      api.list(channelId, { status: 'published' }, c.signal),
      loadLoops(channelId, {}, c.signal),
    ])
      .then(async ([page, loops]) => {
        if (
          sourcePromiseId &&
          !loops.items.some((p) => p.id === sourcePromiseId)
        ) {
          const promise = await loadLoop(channelId, sourcePromiseId, c.signal);
          loops = { ...loops, items: [promise, ...loops.items] };
        }
        if (!c.signal.aborted) {
          setChoices(page.items);
          setCursor(page.nextCursor);
          setPromises(loops.items.filter((p) => p.status !== 'candidate'));
          setPromiseCursor(loops.nextCursor);
        }
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Could not load source choices.',
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [channelId]);
  return (
    <div className="panel content-stack" id="publication-draft">
      <h2>{initial ? 'Edit draft' : 'New story draft'}</h2>
      <p className="muted">
        Write for someone new. Leave private case details out. Saving creates an
        unpublished draft.
      </p>
      {suggested && (
        <p className="notice">
          Gemini draft · verify every claim and source. Saving does not publish
          it.
        </p>
      )}
      <WorkflowForm
        label="Save community draft"
        onCancel={onCancel}
        onSave={async () =>
          onSave(
            publicationFieldsSchema.parse({
              kind,
              title,
              body,
              clipId: twitchClipIdFromUrl(clipUrl),
              chatSummary: kind === 'summary' ? chatSummary : '',
              sourceIds: [...sources],
              promiseId: promiseId || null,
            }),
          )
        }
      >
        <details
          className="draft-promise-source"
          open={Boolean(sourcePromiseId) || undefined}
        >
          <summary>Start from a promise (optional)</summary>
          <div className="content-stack">
            <p className="muted">
              Use the wording as a starting point, then edit it for viewers.
              Team-only evidence stays private.
            </p>
            <label className="field">
              Confirmed promise (optional)
              <Select value={promiseId} onValueChange={(e) => setPromiseId(e)}>
                <option value="">No promise source</option>
                {promiseId !== '' &&
                  !promises.some((p) => p.id === promiseId) && (
                    <option value={promiseId}>
                      Previously selected promise
                    </option>
                  )}
                {promises.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.wording}
                  </option>
                ))}
              </Select>
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={!promises.some((p) => p.id === promiseId)}
              onClick={() => {
                const p = promises.find((p) => p.id === promiseId);
                if (p) {
                  setKind('commitment');
                  setTitle(p.wording.slice(0, 180));
                  setBody(
                    `${p.wording}\n\nUpdate: ${p.status.replaceAll('_', ' ')}`,
                  );
                }
              }}
            >
              Use promise wording as a draft
            </button>
            {promiseCursor && (
              <button
                type="button"
                className="button secondary"
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  void loadLoops(channelId, { cursor: promiseCursor })
                    .then((p) => {
                      setPromises((s) => [
                        ...s,
                        ...p.items.filter((p) => p.status !== 'candidate'),
                      ]);
                      setPromiseCursor(p.nextCursor);
                    })
                    .catch((e: unknown) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Could not load promises.',
                      ),
                    )
                    .finally(() => setLoading(false));
                }}
              >
                More promise choices
              </button>
            )}
          </div>
        </details>
        <label className="field">
          Entry type
          <Select
            value={kind}
            onValueChange={(e) =>
              setKind(publicationFieldsSchema.shape.kind.parse(e))
            }
          >
            {Object.entries(publicationLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="field">
          Public title
          <input
            required
            maxLength={180}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          Public story
          <textarea
            required
            rows={6}
            maxLength={6000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label className="field">
          Twitch clip link (optional)
          <input
            type="url"
            value={clipUrl}
            maxLength={500}
            placeholder="https://clips.twitch.tv/…"
            onChange={(event) => setClipUrl(event.target.value)}
          />
          <span className="muted">
            Paste a clip link. It will be included in publication review.{' '}
            {initial
              ? 'Manage the screenshot in the story review.'
              : 'Save this draft to attach a screenshot.'}
          </span>
        </label>
        {kind === 'summary' && (
          <label className="field">
            Short !catchup reply
            <textarea
              required
              maxLength={360}
              rows={3}
              value={chatSummary}
              onChange={(e) => setChatSummary(e.target.value)}
            />
            <span className="muted">
              Up to 360 characters. This wording is also reviewed before chat
              can use it.
            </span>
          </label>
        )}
        <details className="candidate-source">
          <summary>Published sources (optional)</summary>
          <div className="content-stack">
            <p className="muted">
              Cite published stories that support this draft. These are the only
              sources visitors can follow.
            </p>
            {loading && <p role="status">Loading source choices…</p>}
            {sources.size > 0 && (
              <div className="button-row">
                <span>{sources.size} public sources selected</span>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setSources(new Set())}
                >
                  Clear selected sources
                </button>
              </div>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {choices
              .filter((e) => e.id !== initial?.id)
              .map((e) => (
                <label className="publication-choice" key={e.id}>
                  <input
                    type="checkbox"
                    checked={sources.has(e.id)}
                    onChange={(event) =>
                      setSources((s) => {
                        const next = new Set(s);
                        if (event.target.checked) next.add(e.id);
                        else next.delete(e.id);
                        return next;
                      })
                    }
                  />
                  {e.title}
                </label>
              ))}
            {cursor && (
              <button
                className="button secondary"
                type="button"
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  void api
                    .list(channelId, { status: 'published', cursor })
                    .then((p) => {
                      setChoices((s) => [...s, ...p.items]);
                      setCursor(p.nextCursor);
                    })
                    .catch((e: unknown) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Could not load sources.',
                      ),
                    )
                    .finally(() => setLoading(false));
                }}
              >
                More published source choices
              </button>
            )}
          </div>
        </details>
      </WorkflowForm>
    </div>
  );
}
