'use client';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '../../components/icon-button';
import { formatDateTime } from '../../lib/date-time';
import { useEffect, useState } from 'react';
import {
  ingestionStatusSchema,
  twitchEventTypes,
  moderationEventTypes,
  type Channel,
  type IngestionStatus,
} from '@lore/shared';
import { apiRequest, ApiError } from '../../lib/api';
import { useWorkspace } from './workspace-context';
import { useRouter } from 'next/navigation';

export function LiveCapture({ channel }: { channel: Channel }) {
  const { preview, session } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<IngestionStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(action?: 'start' | 'stop') {
    setBusy(true);
    setError('');
    try {
      setStatus(
        await apiRequest(
          `/channels/${channel.id}/ingestion${action ? `/${action}` : ''}`,
          ingestionStatusSchema,
          action ? { method: 'POST', csrfToken: session.csrfToken } : {},
        ),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        router.replace('/login?expired=1');
      setError(
        error instanceof Error
          ? error.message
          : 'Could not check live capture.',
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!open || preview || channel.role !== 'owner' || !channel.connected)
      return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void apiRequest(
        `/channels/${channel.id}/ingestion`,
        ingestionStatusSchema,
        { signal: controller.signal },
      )
        .then(setStatus)
        .catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          if (error instanceof ApiError && error.status === 401)
            router.replace('/login?expired=1');
          setError('Could not refresh capture status. Try again.');
        });
    }, 10_000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [open, preview, channel.id, channel.connected, channel.role, router]);
  const enabled =
    status?.subscriptions.filter((sub) => sub.status === 'enabled').length || 0;
  const ready =
    status?.requested &&
    !status.error &&
    twitchEventTypes
      .filter((type) => !moderationEventTypes.some((mod) => mod === type))
      .every((type) =>
        status.subscriptions.some(
          (sub) => sub.type === type && sub.status === 'enabled',
        ),
      );
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Live capture</h2>
      </div>
      <p className="panel-description">
        Capture new chat and stream events. Deleted or cleared chat is removed;
        earlier history isn’t imported.
      </p>
      {preview ? (
        <p className="notice">
          Demo fixture · Live capture is off in this preview.
        </p>
      ) : channel.role !== 'owner' ? (
        <p className="notice">
          Only the channel owner can manage live capture.
        </p>
      ) : !channel.connected ? (
        <p className="notice">
          Reconnect your channel before starting live capture.
        </p>
      ) : (
        <>
          {!open && (
            <button
              className="button secondary"
              onClick={() => {
                setOpen(true);
                void load();
              }}
            >
              Manage live capture
            </button>
          )}
          {open && (
            <div className="content-stack" aria-busy={busy}>
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              {busy && !status && <p role="status">Checking live capture…</p>}
              {status && (
                <>
                  <span className={`status ${ready ? '' : 'neutral'}`}>
                    {!status.requested
                      ? status.error === 'authorization_required'
                        ? 'Capture needs attention'
                        : 'Capture stopped'
                      : ready
                        ? 'Listening on Twitch'
                        : 'Waiting for Twitch'}
                  </span>
                  {!status.configured ? (
                    <p className="notice">
                      Live capture isn’t configured for this Lore instance yet.
                    </p>
                  ) : status.missingScopes.length > 0 ? (
                    <>
                      <p>
                        Allow Lore to read chat for your channel. This does not
                        grant permission to send chat messages or moderate
                        anyone.
                      </p>
                      <a
                        className="button primary"
                        href="/api/auth/twitch/capture"
                      >
                        Authorize chat capture on Twitch
                      </a>
                    </>
                  ) : (
                    <>
                      {status.error && (
                        <p className="notice error" role="alert">
                          {status.error === 'authorization_required'
                            ? 'Twitch previously rejected the connection. Retry capture, or reconnect your Twitch permissions if it fails again.'
                            : 'Twitch could not finish connecting. Check the connection and try again.'}
                        </p>
                      )}
                      {status.error === 'authorization_required' && (
                        <a
                          className="button secondary"
                          href="/api/auth/twitch/capture"
                        >
                          Reconnect Twitch permissions
                        </a>
                      )}
                      <details className="capture-details">
                        <summary>Connection details</summary>{' '}
                        <p>
                          {enabled} event connections ready (6 core; up to 3
                          optional moderation connections). {status.pending}{' '}
                          deliveries waiting; {status.failed} failed.
                        </p>
                        {status.lastReceivedAt && (
                          <p>
                            Last delivery:{' '}
                            {formatDateTime(status.lastReceivedAt)}
                          </p>
                        )}
                      </details>
                      <button
                        className={`button ${status.requested ? 'secondary' : 'primary'}`}
                        disabled={busy}
                        onClick={() =>
                          void load(status.requested ? 'stop' : 'start')
                        }
                      >
                        {busy
                          ? 'Updating…'
                          : status.requested
                            ? 'Stop capture'
                            : status.error === 'authorization_required'
                              ? 'Retry capture'
                              : 'Start capture'}
                      </button>
                    </>
                  )}
                </>
              )}
              <IconButton
                label="Refresh capture status"

                disabled={busy}
                onClick={() => void load()}
              >
                <RefreshCw size={18} aria-hidden="true" />
              </IconButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
