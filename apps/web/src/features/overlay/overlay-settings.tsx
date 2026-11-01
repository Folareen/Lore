'use client';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '../../components/icon-button';
import { PageTitle } from '../../components/page-title';
import { Select } from '../../components/select';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  updateOverlaySchema,
  type ManagedPublication,
  type OverlaySettings,
  type OverlayDisplay,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { usePublications } from '../publications/publications-context';
import { useOverlay } from './overlay-context';
import { OverlayCard } from './overlay-display';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function OverlayScreen() {
  const { selected } = useWorkspace();
  if (!selected)
    return <p className="notice">Connect a channel to set up an overlay.</p>;
  if (selected.role === 'team')
    return (
      <p className="notice">Owners and moderators manage the stream overlay.</p>
    );
  return <OverlayDesk key={selected.id} />;
}
function OverlayDesk() {
  const { selected, preview, href } = useWorkspace(),
    api = useOverlay(),
    publications = usePublications();
  const channel = selected!;
  const [settings, setSettings] = useState<OverlaySettings | null>(null),
    [mode, setMode] = useState<OverlaySettings['mode']>('recap'),
    [ids, setIds] = useState<string[]>([]),
    [enabled, setEnabled] = useState(false),
    [entries, setEntries] = useState<ManagedPublication[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [url, setUrl] = useState(''),
    [confirm, setConfirm] = useState<'rotate' | 'revoke' | 'save' | null>(null),
    [revision, setRevision] = useState(0);
  const [setupOpen, setSetupOpen] = useState(true);
  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 851px)');
    if (!desktop) return;
    const sync = () => setSetupOpen(desktop.matches);
    sync();
    desktop.addEventListener('change', sync);
    return () => desktop.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setSettings(null);
    setUrl('');
    setError('');
    void Promise.all([
      api.settings(channel.id, c.signal),
      publications.list(channel.id, { status: 'published' }, c.signal),
    ])
      .then(([s, page]) => {
        if (c.signal.aborted) return;
        setSettings(s);
        setMode(s.mode);
        setIds(s.entryIds);
        setEnabled(s.enabled);
        setEntries(page.items);
        setCursor(page.nextCursor);
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : 'Overlay unavailable.');
      });
    return () => c.abort();
  }, [channel.id, revision]);
  const choices = entries.filter(
    (e) => e.kind === (mode === 'recap' ? 'summary' : 'commitment'),
  );
  const display: OverlayDisplay = {
    channel: channel.displayName,
    mode,
    items: ids.flatMap((id) => {
      const row = choices.find((e) => e.id === id);
      return row
        ? [
            {
              id: row.id,
              title: row.title,
              text: mode === 'recap' ? row.chatSummary : '',
            },
          ]
        : [];
    }),
  };
  const entryVersions = Object.fromEntries(
    choices
      .filter((entry) => ids.includes(entry.id))
      .map((entry) => [entry.id, entry.version]),
  );
  async function act() {
    if (!settings || !confirm) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (confirm === 'save') {
        const input = updateOverlaySchema.parse({
          expectedVersion: settings.version,
          enabled,
          mode,
          entryIds: ids,
          entryVersions,
        });
        setSettings(await api.save(channel.id, input));
        setNotice('Overlay selection approved and saved.');
      } else {
        const result = await api.token(
          channel.id,
          settings,
          confirm === 'rotate',
        );
        setSettings(result.settings);
        if (confirm === 'revoke') setEnabled(false);
        setUrl(
          result.token
            ? `${window.location.origin}/overlay/${encodeURIComponent(channel.slug)}#token=${result.token}`
            : '',
        );
        setNotice(
          confirm === 'rotate'
            ? 'New link created. Copy it now; it is only shown once.'
            : 'Overlay link revoked. OBS will clear on its next refresh.',
        );
      }
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update overlay.');
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor) return;
    setBusy(true);
    setError('');
    try {
      const page = await publications.list(channel.id, {
        status: 'published',
        cursor,
      });
      setEntries((s) => [...s, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load entries.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-stack">
      <div className="page-heading">
        <div>
          <PageTitle>Stream overlay</PageTitle>
          <p>Choose the Lore your audience sees in OBS.</p>
        </div>
        <Link className="button secondary" href={href('publications')}>
          Public stories
        </Link>
      </div>
      {preview && <p className="notice">Demo links cannot connect to OBS.</p>}
      {!channel.connected && (
        <p className="notice">
          Disconnected · the overlay is hidden. Reconnect to approve content and
          create a new link.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <IconButton
        label="Reload settings and entries"

        disabled={busy}
        onClick={() => {
          setRevision((v) => v + 1);
          setNotice('');
        }}
      >
        <RefreshCw size={18} aria-hidden="true" />
      </IconButton>
      {!settings && !error && <p role="status">Loading overlay…</p>}
      {settings && (
        <>
          <div className="overlay-desk-grid">
            <section className="panel overlay-panel">
              <h2>Choose what goes on screen</h2>
              <p>
                Choose published recaps or commitments. Private records are
                excluded.
              </p>
              <label className="overlay-field">
                Display
                <Select
                  value={mode}
                  disabled={busy || !channel.connected}
                  onValueChange={(e) => {
                    setMode(e === 'recap' ? 'recap' : 'open_loops');
                    setIds([]);
                  }}
                >
                  <option value="recap">Recap · select one</option>
                  <option value="open_loops">
                    Commitments · select up to three
                  </option>
                </Select>
              </label>
              <div className="overlay-entry-choices">
                {choices.map((row) => (
                  <label key={row.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(row.id)}
                      disabled={
                        busy ||
                        !channel.connected ||
                        (!ids.includes(row.id) &&
                          ids.length >= (mode === 'recap' ? 1 : 3))
                      }
                      onChange={(e) =>
                        setIds((s) =>
                          e.target.checked
                            ? [...s, row.id]
                            : s.filter((id) => id !== row.id),
                        )
                      }
                    />
                    <span>{row.title}</span>
                  </label>
                ))}
              </div>
              {!choices.length && (
                <p>
                  No published {mode === 'recap' ? 'recaps' : 'commitments'}{' '}
                  loaded. Publish one first, or load more entries.
                </p>
              )}
              {cursor && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void more()}
                >
                  Load more published entries
                </button>
              )}
              {ids.length > 0 && (
                <button
                  className="button secondary"
                  disabled={busy || !channel.connected}
                  onClick={() => setIds([])}
                >
                  Clear selection
                </button>
              )}
              {ids.some((id) => !choices.some((e) => e.id === id)) && (
                <p className="notice">
                  Some selected entries are unavailable or not loaded. Load more
                  or clear the selection before saving.
                </p>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={busy || !channel.connected}
                  onChange={(e) => setEnabled(e.target.checked)}
                />{' '}
                Show the approved selection on stream
              </label>
              <p>
                Withdrawing a story removes it from OBS. Commitments display
                their published titles.
              </p>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !channel.connected ||
                  !updateOverlaySchema.safeParse({
                    expectedVersion: settings.version,
                    enabled,
                    mode,
                    entryIds: ids,
                    entryVersions,
                  }).success ||
                  ids.some((id) => !choices.some((e) => e.id === id))
                }
                onClick={() => setConfirm('save')}
              >
                Review overlay selection
              </button>
            </section>
            <section className="panel overlay-panel">
              <h2>On-screen preview</h2>
              <p>
                Preview of your current selection. Save approval to update OBS.
              </p>
              <div className="obs-preview">
                {display.items.length ? (
                  <OverlayCard data={display} />
                ) : (
                  <p>
                    No content selected. The browser source stays transparent.
                  </p>
                )}
              </div>
            </section>
          </div>
          <details
            className="panel overlay-panel obs-setup"
            open={setupOpen}
            onToggle={(event) => {
              setSetupOpen(event.currentTarget.open);
              if (!event.currentTarget.open) setUrl('');
            }}
          >
            <summary>OBS browser source</summary>
            <div className="content-stack">
              <p>
                {settings.tokenActive
                  ? 'A private link is active.'
                  : 'No active link.'}{' '}
                {settings.enabled
                  ? 'The approved selection is enabled.'
                  : 'The overlay is hidden.'}
              </p>
              <p>
                Add a Browser Source in OBS, paste the link and set its size to
                720 × 720. Enable “Refresh browser source when scene becomes
                active.” The page background is transparent.
              </p>
              <p>
                The link grants access to approved overlay text only. Treat it
                as a credential. Creating a new link immediately invalidates the
                old one; it must be replaced in OBS.
              </p>
              {channel.role === 'owner' ? (
                <div className="overlay-actions">
                  <button
                    className="button secondary"
                    disabled={busy || !channel.connected}
                    onClick={() => setConfirm('rotate')}
                  >
                    {settings.tokenActive
                      ? 'Regenerate overlay link'
                      : 'Create overlay link'}
                  </button>
                  <button
                    className="button danger"
                    disabled={busy || !settings.tokenActive}
                    onClick={() => setConfirm('revoke')}
                  >
                    Revoke overlay link
                  </button>
                </div>
              ) : (
                <p className="notice">
                  Only the owner can create or revoke the browser-source link.
                </p>
              )}
              {url && (
                <>
                  <label className="overlay-field">
                    Copy-once browser-source URL
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <div className="overlay-actions">
                    <button
                      className="button secondary"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(url)
                          .then(() => setNotice('Link copied.'))
                          .catch(() =>
                            setError('Copy the selected URL manually.'),
                          )
                      }
                    >
                      Copy link
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setUrl('')}
                    >
                      Hide link
                    </button>
                  </div>
                </>
              )}
              <p>
                OBS refreshes every five seconds. Revoked links and unavailable
                content clear the display automatically.
              </p>
            </div>
          </details>
        </>
      )}
      {confirm && (
        <ConfirmDialog
          tone={confirm === 'save' ? 'primary' : 'danger'}
          title={
            confirm === 'save'
              ? 'Approve this overlay selection?'
              : confirm === 'rotate'
                ? 'Create a new overlay link?'
                : 'Revoke the overlay link?'
          }
          confirmLabel={
            confirm === 'save'
              ? 'Approve and save'
              : confirm === 'rotate'
                ? 'Create new link'
                : 'Revoke link'
          }
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void act()}
        >
          {confirm === 'save' ? (
            <>
              <p>
                {enabled
                  ? 'This selection will be shown to your stream audience.'
                  : 'The overlay will be hidden.'}
              </p>
              {display.items.length > 0 && <OverlayCard data={display} />}
            </>
          ) : (
            <p>
              Existing links stop working immediately. An already displayed
              overlay clears on refresh. You will need to update OBS after
              generating a new link.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
