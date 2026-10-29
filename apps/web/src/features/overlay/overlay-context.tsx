'use client';
import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  overlaySettingsSchema,
  overlayTokenSchema,
  type OverlaySettings,
  type updateOverlaySchema,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { apiRequest, ApiError } from '../../lib/api';
const initial: OverlaySettings = {
  version: 0,
  enabled: false,
  mode: 'recap',
  entryIds: [],
  tokenActive: false,
};
type Api = {
  settings: (id: string, signal?: AbortSignal) => Promise<OverlaySettings>;
  save: (
    id: string,
    value: z.infer<typeof updateOverlaySchema>,
  ) => Promise<OverlaySettings>;
  token: (
    id: string,
    value: OverlaySettings,
    rotate: boolean,
  ) => Promise<{ settings: OverlaySettings; token: string | null }>;
};
const Context = createContext<Api | null>(null);
export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const { session, channels, preview } = useWorkspace(),
    router = useRouter();
  const [fixtures, setFixtures] = useState<Record<string, OverlaySettings>>({});
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
  ) {
    try {
      return await apiRequest(path, schema, {
        method,
        body,
        signal,
        csrfToken: method === 'GET' ? undefined : session.csrfToken,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        router.replace('/login?expired=1');
      throw e;
    }
  }
  function access(id: string, owner = false) {
    const c = channels.find((c) => c.id === id);
    if (!c || c.role === 'team' || (owner && c.role !== 'owner'))
      throw new Error('Overlay access unavailable.');
    return c;
  }
  const api: Api = {
    async settings(id, signal) {
      access(id);
      return preview
        ? (fixtures[id] ?? initial)
        : request(
            `/channels/${id}/overlay`,
            overlaySettingsSchema,
            'GET',
            undefined,
            signal,
          );
    },
    async save(id, input) {
      const c = access(id);
      if (!preview)
        return request(
          `/channels/${id}/overlay`,
          overlaySettingsSchema,
          'POST',
          input,
        );
      if (!c.connected) throw new Error('Reconnect the channel first.');
      const row = fixtures[id] ?? initial;
      if (input.expectedVersion !== row.version)
        throw new Error('Overlay changed. Reload before saving.');
      const next = {
        ...row,
        enabled: input.enabled,
        mode: input.mode,
        entryIds: input.entryIds,
        version: row.version + 1,
      };
      setFixtures((s) => ({ ...s, [id]: next }));
      return next;
    },
    async token(id, row, rotate) {
      access(id, true);
      if (!preview) {
        if (rotate)
          return request(
            `/channels/${id}/overlay-token/rotate`,
            overlayTokenSchema,
            'POST',
            { expectedVersion: row.version },
          );
        return {
          token: null,
          settings: await request(
            `/channels/${id}/overlay-token/revoke`,
            overlaySettingsSchema,
            'POST',
            { expectedVersion: row.version },
          ),
        };
      }
      // Demo links are deliberately not valid bearer credentials.
      const next = {
        ...row,
        version: row.version + 1,
        tokenActive: rotate,
        enabled: rotate ? row.enabled : false,
      };
      setFixtures((s) => ({ ...s, [id]: next }));
      return {
        settings: next,
        token: rotate ? 'demo-only-not-a-credential' : null,
      };
    },
  };
  return <Context.Provider value={api}>{children}</Context.Provider>;
}
export function useOverlay() {
  const value = useContext(Context);
  if (!value) throw new Error('Overlay provider required');
  return value;
}
