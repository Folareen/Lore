'use client';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '../../components/icon-button';
import { formatDateTime } from '../../lib/date-time';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { retentionStatusSchema, type Channel } from '@lore/shared';
import { z } from 'zod';
import { apiRequest, ApiError } from '../../lib/api';
import { useWorkspace } from './workspace-context';
export function RetentionStatus({ channel }: { channel: Channel }) {
  const { preview, session } = useWorkspace(),
    router = useRouter();
  const sequence = useRef(0);
  const [status, setStatus] = useState<z.infer<
      typeof retentionStatusSchema
    > | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (preview || channel.role !== 'owner') return;
    const current = ++sequence.current;
    const controller = new AbortController();
    void apiRequest(
      `/channels/${channel.id}/retention`,
      retentionStatusSchema,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted && current === sequence.current) {
          setStatus(value);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted || current !== sequence.current) return;
        if (e instanceof ApiError && e.status === 401)
          router.replace('/login?expired=1');
        setError(
          'Could not load retention status. Retry to check the purge worker.',
        );
      });
    const timer = setTimeout(() => setRevision((v) => v + 1), 30000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [channel.id, channel.chatRetentionDays, revision, preview, channel.role]);
  if (channel.role !== 'owner') return null;
  if (preview)
    return (
      <p className="notice">
        Demo fixture · retention is simulated. No ordinary live chat is stored
        by this preview.
      </p>
    );
  async function purge() {
    const current = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const next = await apiRequest(
        `/channels/${channel.id}/retention/purge`,
        retentionStatusSchema,
        { method: 'POST', body: {}, csrfToken: session.csrfToken },
      );
      if (current === sequence.current) setStatus(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        router.replace('/login?expired=1');
      setError(e instanceof Error ? e.message : 'Purge failed. Try again.');
    } finally {
      setBusy(false);
    }
  }
  const stale =
    status?.lastPurgedAt &&
    Date.now() - Date.parse(status.lastPurgedAt) > 120000;
  return (
    <section className="panel content-stack" aria-label="Retention status">
      <div className="panel-title">
        <h2>Ordinary chat cleanup</h2>
      </div>
      <p>
        Expired ordinary chat and unconfirmed AI wording are removed. Confirmed
        promise and case evidence are retained separately.
      </p>
      {error && <p className="notice error">{error}</p>}
      {!status && !error && <p role="status">Checking retention worker…</p>}
      {status && (
        <>
          <p>
            {status.capturedMessages} stored chat messages ·{' '}
            {status.expiredMessages} awaiting expiry cleanup.
          </p>
          <p>
            Last successful purge:{' '}
            {status.lastPurgedAt
              ? formatDateTime(status.lastPurgedAt)
              : 'not recorded yet'}
            .
          </p>
          {stale && (
            <p className="notice">
              No successful purge in over two minutes. Check the worker and
              Redis connection, then retry.
            </p>
          )}
        </>
      )}
      <div className="button-row">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void purge()}
        >
          {busy ? 'Purging…' : 'Purge expired chat now'}
        </button>
        <IconButton
          label="Refresh retention status"
          disabled={busy}
          onClick={() => {
            setError('');
            setRevision((v) => v + 1);
          }}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <p className="muted">
        Runs automatically every minute. Shortening retention also purges
        expired chat immediately; raising it later cannot restore deleted chat
        or extend earlier deadlines.
      </p>
    </section>
  );
}
