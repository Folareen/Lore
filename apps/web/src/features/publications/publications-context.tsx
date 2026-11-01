'use client';
import { useDemo } from '../demo/demo-seed-context';
import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  publicationPageSchema,
  publicationTransitions,
  managedPublicationSchema,
  publicationHistorySchema,
  catchupSettingsSchema,
  publicFeedSchema,
  publicCatchupSchema,
  type ManagedPublication,
  type createPublicationSchema,
  type editPublicationSchema,
  type publicationActionSchema,
  type PublicFeed,
  type PublicCatchup,
} from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { apiRequest, ApiError } from '../../lib/api';
import {
  previewPublications,
  previewPublicEntry,
} from '../../lib/preview-publications';
type Query = {
  status?: 'draft' | 'published' | 'unpublished';
  cursor?: string;
};
type PublicationsWorkspace = {
  screenshot: (
    record: ManagedPublication,
    file: File | null,
    alt: string,
  ) => Promise<void>;
  imageHref: (channelId: string, entryId: string, imageId: string) => string;
  list: (
    channelId: string,
    query?: Query,
    signal?: AbortSignal,
  ) => Promise<z.infer<typeof publicationPageSchema>>;
  create: (
    channelId: string,
    input: z.infer<typeof createPublicationSchema>,
  ) => Promise<void>;
  edit: (
    record: ManagedPublication,
    input: z.infer<typeof editPublicationSchema>,
  ) => Promise<void>;
  action: (
    record: ManagedPublication,
    input: z.infer<typeof publicationActionSchema>,
  ) => Promise<void>;
  history: (
    record: ManagedPublication,
  ) => Promise<z.infer<typeof publicationHistorySchema>[]>;
  settings: (
    channelId: string,
    signal?: AbortSignal,
  ) => Promise<z.infer<typeof catchupSettingsSchema>>;
  consent: (channelId: string, enabled: boolean) => Promise<void>;
  publicFeed: (channelId: string) => PublicFeed;
  publicCatchup: (channelId: string) => PublicCatchup;
};
const Context = createContext<PublicationsWorkspace | null>(null);
export function PublicationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  const localImages = useRef(new Set<string>());
  useEffect(
    () => () => {
      for (const url of localImages.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const { session, channels, preview } = useWorkspace(),
    router = useRouter();
  const [entries, setEntries] = useState(
      useDemo()?.data.publications ?? previewPublications,
    ),
    [events, setEvents] = useState<
      Record<string, z.infer<typeof publicationHistorySchema>[]>
    >({});
  const [requests, setRequests] = useState<Record<string, string>>({});
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
  function access(id: string, mutation = false, review = false) {
    const c = channels.find((c) => c.id === id);
    if (!c || (c.role !== 'owner' && !c.connected))
      throw new Error('Channel unavailable.');
    if (mutation && !c.connected)
      throw new Error('Reconnect the channel first.');
    if (review && c.role === 'team')
      throw new Error('Owner or moderator review required.');
    return c;
  }
  function saved(r: ManagedPublication, version: number) {
    access(r.channelId);
    const current = entries.find(
      (e) =>
        e.id === r.id && e.channelId === r.channelId && e.status !== 'deleted',
    );
    if (!current || current.version !== version)
      throw new Error('Entry changed. Refresh before trying again.');
    return current;
  }
  function log(row: ManagedPublication, action: string, reason: string | null) {
    setEvents((s) => ({
      ...s,
      [row.id]: [
        ...(s[row.id] ?? []),
        {
          id: crypto.randomUUID(),
          version: row.version,
          action,
          reason,
          actorTwitchUserId: session.user.twitchUserId,
          occurredAt: new Date().toISOString(),
        },
      ],
    }));
  }
  function validateSources(channelId: string, ids: string[], id?: string) {
    if (
      ids.some(
        (source) =>
          source === id ||
          !entries.some(
            (e) =>
              e.id === source &&
              e.channelId === channelId &&
              e.status === 'published',
          ),
      )
    )
      throw new Error('Choose published sources from this channel.');
  }
  function invalidate(all: ManagedPublication[], id: string) {
    const affected = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of all)
        if (!affected.has(e.id) && e.sourceIds.some((s) => affected.has(s))) {
          affected.add(e.id);
          changed = true;
        }
    }
    return all.map((e) =>
      e.id !== id && affected.has(e.id) && e.status === 'published'
        ? {
            ...e,
            status: 'unpublished' as const,
            version: e.version + 1,
            publishedAt: null,
            approvedByTwitchUserId: null,
          }
        : e,
    );
  }
  const published = (channelId: string) =>
    entries
      .filter((e) => e.channelId === channelId && e.status === 'published')
      .sort(
        (a, b) =>
          (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') ||
          b.id.localeCompare(a.id),
      );
  function channel(channelId: string) {
    const c = channels.find((c) => c.id === channelId);
    if (!c) throw new Error('Channel unavailable.');
    return { slug: c.slug, displayName: c.displayName };
  }
  return (
    <Context.Provider
      value={{
        imageHref: (channelId, entryId, imageId) =>
          preview
            ? (images[imageId] ?? '')
            : `/api/channels/${channelId}/publications/${entryId}/screenshot/${imageId}`,
        screenshot: async (record, file, alt) => {
          if (!preview) {
            const data = new FormData();
            data.set('expectedVersion', String(record.version));
            data.set('alt', alt);
            if (file) data.set('file', file);
            await request(
              `/channels/${record.channelId}/publications/${record.id}/screenshot`,
              managedPublicationSchema,
              file ? 'POST' : 'DELETE',
              file ? data : { expectedVersion: record.version },
            );
            return;
          }
          const old = saved(record, record.version);
          access(old.channelId, true, old.status === 'published');
          let screenshot = null;
          if (file) {
            if (
              !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
              file.size > 5 * 1024 * 1024 ||
              !file.size ||
              !alt.trim()
            )
              throw new Error('Choose an image up to 5 MB and describe it.');
            const id = crypto.randomUUID();
            const url = URL.createObjectURL(file);
            localImages.current.add(url);
            setImages((current) => ({ ...current, [id]: url }));
            screenshot = { id, alt: alt.trim() };
          }
          const next: ManagedPublication = {
            ...old,
            screenshot,
            status: 'draft',
            version: old.version + 1,
            approvedByTwitchUserId: null,
            publishedAt: null,
            updatedAt: new Date().toISOString(),
          };
          setEntries((current) =>
            invalidate(current, old.id).map((entry) =>
              entry.id === old.id ? next : entry,
            ),
          );
          log(
            next,
            screenshot ? 'screenshot_attached' : 'screenshot_removed',
            null,
          );
        },
        list: async (id, query = {}, signal) => {
          if (!preview)
            return request(
              `/channels/${id}/publications?${new URLSearchParams(query)}`,
              publicationPageSchema,
              'GET',
              undefined,
              signal,
            );
          access(id);
          return {
            items: entries.filter(
              (e) =>
                e.channelId === id &&
                e.status !== 'deleted' &&
                (!query.status || e.status === query.status),
            ),
            nextCursor: null,
          };
        },
        create: async (id, input) => {
          if (!preview) {
            await request(
              `/channels/${id}/publications`,
              managedPublicationSchema,
              'POST',
              input,
            );
            return;
          }
          access(id, true);
          validateSources(id, input.sourceIds);
          if (requests[input.requestId]) {
            if (requests[input.requestId] !== JSON.stringify(input))
              throw new Error('Request ID already used.');
            return;
          }
          setRequests((r) => ({
            ...r,
            [input.requestId]: JSON.stringify(input),
          }));
          const { requestId, ...fields } = input;
          void requestId;
          const row: ManagedPublication = {
            ...fields,
            id: crypto.randomUUID(),
            channelId: id,
            status: 'draft',
            version: 1,
            approvedByTwitchUserId: null,
            publishedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setEntries((s) => [row, ...s]);
          log(row, 'draft_created', null);
        },
        edit: async (record, input) => {
          if (!preview) {
            await request(
              `/channels/${record.channelId}/publications/${record.id}`,
              managedPublicationSchema,
              'PATCH',
              input,
            );
            return;
          }
          const old = saved(record, input.expectedVersion);
          access(old.channelId, true, old.status === 'published');
          validateSources(old.channelId, input.sourceIds, old.id);
          const { expectedVersion, ...fields } = input;
          void expectedVersion;
          const next = {
            ...old,
            ...fields,
            status: 'draft' as const,
            version: old.version + 1,
            approvedByTwitchUserId: null,
            publishedAt: null,
            updatedAt: new Date().toISOString(),
          };
          setEntries((s) =>
            invalidate(s, old.id).map((e) => (e.id === old.id ? next : e)),
          );
          log(next, 'edited_to_draft', null);
        },
        action: async (record, input) => {
          if (!preview) {
            await request(
              `/channels/${record.channelId}/publications/${record.id}/review`,
              managedPublicationSchema,
              'POST',
              input,
            );
            return;
          }
          const old = saved(record, input.expectedVersion);
          if (!publicationTransitions[old.status].includes(input.action))
            throw new Error('Publication transition is unavailable.');
          const c = access(
            old.channelId,
            input.action === 'publish',
            input.action !== 'delete' || old.status !== 'draft',
          );
          if (c.role === 'team' && old.status !== 'draft')
            throw new Error('Owner or moderator review required.');
          if (input.action === 'publish')
            validateSources(old.channelId, old.sourceIds, old.id);
          const next: ManagedPublication = {
            ...old,
            status:
              input.action === 'publish'
                ? 'published'
                : input.action === 'delete'
                  ? 'deleted'
                  : 'unpublished',
            version: old.version + 1,
            publishedAt:
              input.action === 'publish' ? new Date().toISOString() : null,
            approvedByTwitchUserId:
              input.action === 'publish' ? session.user.twitchUserId : null,
            updatedAt: new Date().toISOString(),
            ...(input.action === 'delete'
              ? {
                  body: '',
                  title: '',
                  chatSummary: '',
                  promiseId: null,
                  sourceIds: [],
                }
              : {}),
          };
          setEntries((s) =>
            (input.action === 'publish' ? s : invalidate(s, old.id)).map((e) =>
              e.id === old.id ? next : e,
            ),
          );
          log(next, input.action, input.reason);
        },
        history: async (r) =>
          preview
            ? (events[r.id] ?? [])
            : (
                await request(
                  `/channels/${r.channelId}/publications/${r.id}`,
                  z.strictObject({
                    entry: managedPublicationSchema,
                    history: z.array(publicationHistorySchema),
                  }),
                )
              ).history,
        settings: async (id, signal) => {
          if (!preview)
            return request(
              `/channels/${id}/catchup/settings`,
              catchupSettingsSchema,
              'GET',
              undefined,
              signal,
            );
          access(id, false, true);
          return {
            enabled: false,
            captureEnabled: false,
            configured: false,
            missingScopes: ['user:write:chat'],
            recent: [],
          };
        },
        consent: async (id, enabled) => {
          if (preview)
            throw new Error(
              'Chat sending is unavailable in a fixture preview.',
            );
          await request(
            `/channels/${id}/catchup/settings`,
            catchupSettingsSchema,
            'POST',
            { enabled },
          );
        },
        publicFeed: (id) =>
          publicFeedSchema.parse({
            channel: channel(id),
            items: published(id).map((e) => previewPublicEntry(e, entries)),
            nextCursor: null,
          }),
        publicCatchup: (id) => {
          const all = published(id);
          return publicCatchupSchema.parse({
            channel: channel(id),
            summary: all.find((e) => e.kind === 'summary')
              ? previewPublicEntry(
                  all.find((e) => e.kind === 'summary')!,
                  entries,
                )
              : null,
            recent: all
              .filter((e) => e.kind !== 'summary')
              .slice(0, 10)
              .map((e) => previewPublicEntry(e, entries)),
          });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePublications() {
  const value = useContext(Context);
  if (!value) throw new Error('PublicationsProvider required');
  return value;
}
