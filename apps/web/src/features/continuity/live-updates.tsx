'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { useWorkspace } from '../workspace/workspace-context';
export function WorkspaceStream() {
  const { selected, preview } = useWorkspace();
  const pathname = usePathname();
  const dirty = useRef(false);
  const [pending, setPending] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  useEffect(() => {
    dirty.current = false;
    setPending(false);
    setConfirmRefresh(false);
  }, [pathname, selected?.id]);
  useEffect(() => {
    const edited = (event: Event) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        dirty.current = true;
    };
    document.addEventListener('input', edited, true);
    document.addEventListener('change', edited, true);
    return () => {
      document.removeEventListener('input', edited, true);
      document.removeEventListener('change', edited, true);
    };
  }, []);
  const [status, setStatus] = useState('Connecting live updates…');
  useEffect(() => {
    if (!selected || preview || typeof EventSource === 'undefined') return;
    const channelId = selected.id;
    const stream = new EventSource(`/api/channels/${channelId}/stream`);
    let last: number | undefined;
    stream.onopen = () => setStatus('Live updates connected');
    stream.onerror = () => setStatus('Reconnecting live updates…');
    stream.addEventListener('changed', (event) => {
      let data: unknown;
      try {
        data = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        return;
      }
      if (
        !data ||
        typeof data !== 'object' ||
        !('revision' in data) ||
        typeof data.revision !== 'number'
      )
        return;
      if (last !== undefined && last !== data.revision) {
        window.dispatchEvent(
          new CustomEvent('lore:workspace-consent', { detail: channelId }),
        );
        if (dirty.current) setPending(true);
        else
          window.dispatchEvent(
            new CustomEvent('lore:workspace-updated', { detail: channelId }),
          );
      }
      last = data.revision;
    });
    stream.addEventListener('revoked', () => {
      stream.close();
      window.location.assign('/app');
    });
    return () => stream.close();
  }, [selected?.id, preview]);
  return !preview && selected ? (
    <div className="workspace-stream">
      <p className="muted" aria-live="polite">
        {status}
      </p>
      {pending && (
        <div className="notice live-update-notice">
          <div role="status">
            <strong>New channel updates</strong>
            <p>Save any changes, then refresh to see the latest activity.</p>
          </div>
          <button
            className="button secondary compact"
            onClick={() => setConfirmRefresh(true)}
          >
            Refresh
          </button>
        </div>
      )}
      {confirmRefresh && (
        <ConfirmDialog
          title="Refresh this page?"
          confirmLabel="Refresh page"
          busy={false}
          onCancel={() => setConfirmRefresh(false)}
          onConfirm={() => window.location.reload()}
        >
          <p>Any unsaved changes will be lost. Cancel to keep editing.</p>
        </ConfirmDialog>
      )}
    </div>
  ) : null;
}
export function useLiveRefresh(
  channelId: string,
  refresh: () => void,
  consent = false,
) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });
  useEffect(() => {
    const changed = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === channelId)
        latest.current();
    };
    const name = consent ? 'lore:workspace-consent' : 'lore:workspace-updated';
    window.addEventListener(name, changed);
    return () => window.removeEventListener(name, changed);
  }, [channelId, consent]);
}
