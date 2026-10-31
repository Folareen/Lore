'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
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
}: {
  onUse: (draft: z.infer<typeof summaryDraftSchema>) => void;
}) {
  const { selected, session, preview, href } = useWorkspace();
  const [open, setOpen] = useState(false),
    [sources, setSources] = useState<ManagedPublication[]>([]),
    [chosen, setChosen] = useState<string[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [draft, setDraft] = useState<z.infer<typeof summaryDraftSchema>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const { settings, error: consentError } = useFeatureSettings(open);
  useEffect(() => {
    if (!open || !selected || preview) return;
    const c = new AbortController();
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
      });
    return () => c.abort();
  }, [open, selected?.id, preview]);
  return (
    <details
      className="panel content-stack"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Draft a catch-up summary with Gemini</summary>
      {open && (
        <>
          <p>
            Choose 1–10 already-published entries. Gemini receives only these
            public texts. Review the result, edit it and save it as a draft
            before publication approval.
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
                <p className="notice">
                  The owner must enable public summary AI in{' '}
                  <Link href={href('settings')}>
                    Additional channel capabilities
                  </Link>
                  .
                </p>
              )}
              <fieldset className="source-choices" disabled={busy}>
                <legend>Approved public sources</legend>
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
                  <p className="eyebrow">Gemini draft · not published</p>
                  <h3>{draft.title}</h3>
                  <p className="case-prose">{draft.body}</p>
                  <p>Suggested chat wording: {draft.chatSummary}</p>
                  <button
                    className="button primary"
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
