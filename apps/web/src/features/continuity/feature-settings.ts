'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  continuitySettingsSchema,
  type ContinuitySettings,
} from '@lore/shared';
import { apiRequest } from '../../lib/api';
import { useWorkspace } from '../workspace/workspace-context';
import { useLiveRefresh } from './live-updates';
export function useFeatureSettings(active: boolean) {
  const { selected, session, preview } = useWorkspace();
  const [settings, setSettings] = useState<ContinuitySettings>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useLiveRefresh(selected?.id ?? '', refresh, true);
  useEffect(() => {
    if (!active || !selected || preview) return;
    const c = new AbortController();
    setError('');
    void apiRequest(
      `/channels/${selected.id}/features`,
      continuitySettingsSchema,
      { signal: c.signal },
    )
      .then((data) => {
        if (!c.signal.aborted) setSettings(data);
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted) {
          setSettings(undefined);
          setError(e instanceof Error ? e.message : 'Could not load consent.');
        }
      });
    return () => c.abort();
  }, [active, selected?.id, preview, revision]);
  async function configure(
    feature:
      | 'moderationImportsEnabled'
      | 'promiseConfirmationsEnabled'
      | 'publicSummaryAiEnabled'
      | 'microphoneEnabled',
    enabled: boolean,
  ) {
    if (!selected || preview) return;
    setBusy(true);
    setError('');
    try {
      setSettings(
        await apiRequest(
          `/channels/${selected.id}/features`,
          continuitySettingsSchema,
          {
            method: 'POST',
            csrfToken: session.csrfToken,
            body: { feature, enabled },
          },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change consent.');
    } finally {
      setBusy(false);
    }
  }
  return { settings, error, busy, configure, refresh };
}
