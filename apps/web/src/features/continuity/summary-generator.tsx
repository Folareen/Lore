'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FeatureControls } from './feature-controls';
import { z } from 'zod';
import {
  publicationPageSchema,
  summaryDraftSchema,
  type ManagedPublication,
} from '@lore/shared';
import { apiRequest } from '../../lib/api';
import { useWorkspace } from '../workspace/workspace-context';
import { useFeatureSettings } from './feature-settings';
export function SummaryGenerator({
  onUse,
  canUseDraft = true,
}: {
  onUse: (draft: z.infer<typeof summaryDraftSchema>) => void;
  canUseDraft?: boolean;
}) {
  const { selected, session, preview, href } = useWorkspace();
  const [open, setOpen] = useState(true),
    [sources, setSources] = useState<ManagedPublication[]>([]),
    [chosen, setChosen] = useState<string[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [draft, setDraft] = useState<z.infer<typeof summaryDraftSchema>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const { settings, error: consentError } = useFeatureSettings(open);
  useEffect(() => {
    if (!open || !selected || preview) return;
    const c = new AbortController();
    setLoading(true);
    void apiRequest(
      `/channels/${selected.id}/publications?status=published`,
      publicationPageSchema,
      { signal: c.signal },
    )
      .then((p) => {
        if (!c.signal.aborted) {
          setSources(p.items);
          setCursor(p.nextCursor);
        }
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Could not load public sources.',
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [open, selected?.id, preview]);
  return (
    <details
      className="panel content-stack"
      open
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Draft a recap with Gemini</summary>
      {open && (
        <>
          <p>
            Choose 1–10 already-published entries. Gemini receives only these
            public texts. Review the result, edit it and save it as a draft
            before publication approval. Google may use free-tier inputs and
            outputs to improve its products.
          </p>
          {preview ? (
            <p className="notice">
              Demo fixture · model calls are disabled. Prepare or edit a sample
              summary using the normal draft form.
            </p>
          ) : (
            <>
              {(error || consentError) && (
                <p role="alert" className="notice error">
                  {error || consentError}
                </p>
              )}
              {!settings?.publicSummaryAiEnabled && (
                <FeatureControls only={['publicSummaryAiEnabled']} expanded />
              )}
              <fieldset className="source-choices" disabled={busy}>
                <legend>Approved public sources</legend>
                {loading && <p role="status">Loading published stories…</p>}
                {!loading && !sources.length && (
                  <p className="notice">
                    No published sources loaded.{' '}
                    <Link href={href('publications')}>
                      Publish a story first →
                    </Link>
                  </p>
                )}
                {sources.map((source) => (
                  <label key={source.id} className="field">
                    <span>
                      <input
                        type="checkbox"
                        checked={chosen.includes(source.id)}
                        disabled={
                          !chosen.includes(source.id) && chosen.length >= 10
                        }
                        onChange={(e) => {
                          setDraft(undefined);
                          setChosen((ids) =>
                            e.target.checked
                              ? [...ids, source.id]
                              : ids.filter((id) => id !== source.id),
                          );
                        }}
                      />{' '}
                      {source.title}
                    </span>
                  </label>
                ))}
              </fieldset>
              {cursor && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const p = await apiRequest(
                        `/channels/${selected!.id}/publications?status=published&cursor=${cursor}`,
                        publicationPageSchema,
                      );
                      setSources((rows) => [...rows, ...p.items]);
                      setCursor(p.nextCursor);
                    } catch {
                      setError('Could not load more public sources.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Load more public sources
                </button>
              )}
              <button
                className="button secondary"
                disabled={
                  busy ||
                  !chosen.length ||
                  !settings?.publicSummaryAiEnabled ||
                  !selected?.connected
                }
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  setDraft(undefined);
                  try {
                    setDraft(
                      await apiRequest(
                        `/channels/${selected!.id}/publications/ai-draft`,
                        summaryDraftSchema,
                        {
                          method: 'POST',
                          csrfToken: session.csrfToken,
                          body: { sourceIds: chosen },
                        },
                      ),
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Could not generate the summary.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? 'Preparing a reviewable draft…'
                  : 'Generate summary draft'}
              </button>
              {draft && (
                <article className="content-stack">
                  <p className="record-meta">Gemini draft · not published</p>
                  <h3>{draft.title}</h3>
                  <p className="case-prose">{draft.body}</p>
                  <p>Suggested chat wording: {draft.chatSummary}</p>
                  <button
                    className="button primary"
                    disabled={!canUseDraft}
                    onClick={() => onUse(draft)}
                  >
                    Use as editable draft
                  </button>
                </article>
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
