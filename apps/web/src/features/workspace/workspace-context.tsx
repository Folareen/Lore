'use client';
import { useDemo } from '../demo/demo-seed-context';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  channelResponseSchema,
  membershipGrantResponseSchema,
  membershipResponseSchema,
  type Channel,
  type Membership,
  type Session,
  type GrantMembership,
  canTransitionOpenLoop,
  openLoopResponseSchema,
  openLoopPageSchema,
  openLoopHistorySchema,
  streamBriefSchema,
  type CreateOpenLoop,
  type OpenLoop,
  type OpenLoopHistory,
  type OpenLoopPage,
  type OpenLoopStatus,
  type TransitionOpenLoop,
  type StreamBrief,
} from '@lore/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { previewPeople } from '../../lib/preview-data';
import {
  fixtureHistory,
  previewBrief,
  previewOpenLoops,
} from '../../lib/preview-open-loops';
type Workspace = {
  recordPreviewReview: (loop: OpenLoop) => void;
  session: Session;
  channels: Channel[];
  selected: Channel | undefined;
  preview: boolean;
  fixtureBase: '/demo';
  selectChannel: (id: string) => void;
  connect: () => Promise<void>;
  saveRetention: (days: number) => Promise<void>;
  disconnect: () => Promise<void>;
  loadMembers: (id: string, signal?: AbortSignal) => Promise<Membership[]>;
  grant: (input: GrantMembership) => Promise<void>;
  remove: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  loadLoops: (
    channelId: string,
    options: { status?: OpenLoopStatus; cursor?: string },
    signal?: AbortSignal,
  ) => Promise<OpenLoopPage>;
  loadLoop: (
    channelId: string,
    loopId: string,
    signal?: AbortSignal,
  ) => Promise<OpenLoop>;
  captureLoop: (channelId: string, input: CreateOpenLoop) => Promise<OpenLoop>;
  transitionLoop: (
    channelId: string,
    loop: OpenLoop,
    input: TransitionOpenLoop,
  ) => Promise<OpenLoop>;
  loadLoopHistory: (
    channelId: string,
    loopId: string,
    signal?: AbortSignal,
  ) => Promise<OpenLoopHistory[]>;
  loadBrief: (channelId: string, signal?: AbortSignal) => Promise<StreamBrief>;
  href: (
    view:
      | 'overview'
      | 'streamer'
      | 'brief'
      | 'candidates'
      | 'moderation'
      | 'workflows'
      | 'overlay'
      | 'publications'
      | 'community'
      | 'settings'
      | 'team'
      | 'account',
  ) => string;
};
const WorkspaceContext = createContext<Workspace | null>(null);
export function WorkspaceProvider({
  session,
  initialChannels,
  preview = false,
  fixtureBase = '/demo',
  children,
}: {
  session: Session;
  initialChannels: Channel[];
  preview?: boolean;
  fixtureBase?: '/demo';
  children: React.ReactNode;
}) {
  const router = useRouter();
  const demo = useDemo()?.data;
  const [channels, setChannels] = useState(initialChannels);
  const [selectedId, setSelectedId] = useState(initialChannels[0]?.id);
  const [demoMembers, setDemoMembers] = useState(demo?.people ?? previewPeople);
  const [demoLoops, setDemoLoops] = useState<OpenLoop[]>(
    demo?.loops ?? previewOpenLoops,
  );
  const [demoHistory, setDemoHistory] = useState<
    Record<string, OpenLoopHistory[]>
  >(() =>
    Object.fromEntries(
      (demo?.loops ?? previewOpenLoops).map((loop) => [
        loop.id,
        fixtureHistory(loop),
      ]),
    ),
  );
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    const changed = () => {
      void apiRequest('/channels', z.array(channelResponseSchema), {
        signal: controller.signal,
      })
        .then((rows) => {
          if (!controller.signal.aborted) setChannels(rows);
        })
        .catch(() => {
          /* The stream handles access loss; retain current metadata during transient outages. */
        });
    };
    window.addEventListener('lore:workspace-consent', changed);
    return () => {
      controller.abort();
      window.removeEventListener('lore:workspace-consent', changed);
    };
  }, [preview]);
  const selected = channels.find((channel) => channel.id === selectedId);
  const href: Workspace['href'] = (view) =>
    preview
      ? `${fixtureBase}${view === 'overview' ? '' : `?view=${view}`}`
      : view === 'community'
        ? selected
          ? `/c/${selected.slug}`
          : '/app/publications'
        : `/app${view === 'overview' ? '' : `/${view === 'workflows' ? 'moderation/workflows' : view}`}`;
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
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        router.replace('/login?expired=1');
      throw error;
    }
  }
  function ownerChannel() {
    if (!selected || selected.role !== 'owner')
      throw new Error('Only the channel owner can make this change.');
    return selected;
  }
  async function connect() {
    if (preview) {
      const owned = channels.find((channel) => channel.role === 'owner');
      if (owned) {
        setChannels(
          channels.map((channel) =>
            channel.id === owned.id ? { ...channel, connected: true } : channel,
          ),
        );
        setSelectedId(owned.id);
      }
      return;
    }
    const channel = await request(
      '/channels/connect',
      channelResponseSchema,
      'POST',
      {},
    );
    setChannels((current) => [
      ...current.filter((item) => item.id !== channel.id),
      channel,
    ]);
    setSelectedId(channel.id);
  }
  async function saveRetention(days: number) {
    const channel = ownerChannel();
    const updated = preview
      ? { ...channel, chatRetentionDays: days }
      : await request(
          `/channels/${channel.id}/settings`,
          channelResponseSchema,
          'PATCH',
          { chatRetentionDays: days },
        );
    setChannels((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
  async function disconnect() {
    const channel = ownerChannel();
    if (!preview)
      await request(
        `/channels/${channel.id}/disconnect`,
        z.undefined(),
        'POST',
      );
    else setDemoMembers([]);
    setChannels((current) =>
      current.map((item) =>
        item.id === channel.id ? { ...item, connected: false } : item,
      ),
    );
  }
  async function loadMembers(id: string, signal?: AbortSignal) {
    if (preview) return id === initialChannels[0]?.id ? demoMembers : [];
    return request(
      `/channels/${id}/members`,
      z.array(membershipResponseSchema),
      'GET',
      undefined,
      signal,
    );
  }
  async function grant(input: GrantMembership) {
    const channel = ownerChannel();
    if (!preview) {
      await request(
        `/channels/${channel.id}/members`,
        membershipGrantResponseSchema,
        'POST',
        input,
      );
      return;
    }
    const person = previewPeople.find(
      (candidate) => candidate.twitchUserId === input.twitchUserId,
    );
    if (!person)
      throw new Error('In this preview, try Twitch user ID 200 or 300.');
    setDemoMembers((current) => [
      ...current.filter((item) => item.userId !== person.userId),
      { ...person, role: input.role },
    ]);
  }
  async function remove(userId: string) {
    const channel = ownerChannel();
    if (!preview)
      await request(
        `/channels/${channel.id}/members/${userId}`,
        z.undefined(),
        'DELETE',
      );
    else
      setDemoMembers((current) =>
        current.filter((person) => person.userId !== userId),
      );
  }
  async function logout() {
    if (preview) {
      router.push('/');
      return;
    }
    await request('/auth/logout', z.undefined(), 'POST');
    router.replace('/login');
    router.refresh();
  }
  async function loadLoops(
    channelId: string,
    options: { status?: OpenLoopStatus; cursor?: string },
    signal?: AbortSignal,
  ) {
    if (preview)
      return {
        items: demoLoops
          .filter(
            (loop) =>
              loop.channelId === channelId &&
              (!options.status || loop.status === options.status),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        nextCursor: null,
      };
    const query = new URLSearchParams({
      ...(options.status ? { status: options.status } : {}),
      ...(options.cursor ? { cursor: options.cursor } : {}),
    });
    return request(
      `/channels/${channelId}/open-loops?${query}`,
      openLoopPageSchema,
      'GET',
      undefined,
      signal,
    );
  }
  function requirePreviewConnection(channelId: string) {
    if (
      !channels.some((channel) => channel.id === channelId && channel.connected)
    )
      throw new Error('Reconnect the channel before changing open loops.');
  }
  async function loadLoop(
    channelId: string,
    loopId: string,
    signal?: AbortSignal,
  ) {
    if (!preview)
      return request(
        `/channels/${channelId}/open-loops/${loopId}`,
        openLoopResponseSchema,
        'GET',
        undefined,
        signal,
      );
    const loop = demoLoops.find(
      (item) => item.channelId === channelId && item.id === loopId,
    );
    if (!loop) throw new Error('Open loop not found.');
    return loop;
  }
  async function captureLoop(
    channelId: string,
    input: CreateOpenLoop,
  ): Promise<OpenLoop> {
    if (!preview)
      return request(
        `/channels/${channelId}/open-loops`,
        openLoopResponseSchema,
        'POST',
        input,
      );
    requirePreviewConnection(channelId);
    const now = new Date().toISOString();
    const loop: OpenLoop = {
      id: input.requestId,
      channelId,
      wording: input.wording,
      ownerLabel: input.ownerLabel || null,
      dueContext: input.dueContext || null,
      status: 'confirmed',
      version: 1,
      origin: 'demo_fixture',
      captureMethod: 'dashboard',
      createdAt: now,
      updatedAt: now,
      source: { excerpt: input.wording, originalAvailable: null },
    };
    setDemoLoops((current) => [
      loop,
      ...current.filter((item) => item.id !== loop.id),
    ]);
    setDemoHistory((current) => ({
      ...current,
      [loop.id]: [
        {
          version: 1,
          fromStatus: null,
          toStatus: 'confirmed',
          reason: null,
          actorTwitchUserId: session.user.twitchUserId,
          occurredAt: now,
        },
      ],
    }));
    return loop;
  }
  async function transitionLoop(
    channelId: string,
    loop: OpenLoop,
    input: TransitionOpenLoop,
  ) {
    if (!preview)
      return request(
        `/channels/${channelId}/open-loops/${loop.id}`,
        openLoopResponseSchema,
        'PATCH',
        input,
      );
    requirePreviewConnection(channelId);
    const saved = demoLoops.find(
      (item) => item.channelId === channelId && item.id === loop.id,
    );
    if (
      !saved ||
      saved.version !== input.expectedVersion ||
      !canTransitionOpenLoop(saved.status, input.status)
    )
      throw new Error('This open loop changed. Refresh before trying again.');
    if (
      ['fulfilled', 'cancelled'].includes(input.status) &&
      !input.reason?.trim()
    )
      throw new Error('Explain the completion or cancellation.');
    const now = new Date().toISOString();
    const updated = {
      ...saved,
      status: input.status,
      version: saved.version + 1,
      updatedAt: now,
    };
    setDemoLoops((current) =>
      current.map((item) => (item.id === loop.id ? updated : item)),
    );
    setDemoHistory((current) => ({
      ...current,
      [loop.id]: [
        ...(current[loop.id] || []),
        {
          version: updated.version,
          fromStatus: saved.status,
          toStatus: input.status,
          reason: input.reason || null,
          actorTwitchUserId: session.user.twitchUserId,
          occurredAt: now,
        },
      ],
    }));
    return updated;
  }
  async function loadLoopHistory(
    channelId: string,
    loopId: string,
    signal?: AbortSignal,
  ) {
    if (preview)
      return demoLoops.some(
        (loop) => loop.channelId === channelId && loop.id === loopId,
      )
        ? demoHistory[loopId] || []
        : [];
    return request(
      `/channels/${channelId}/open-loops/${loopId}/history`,
      z.array(openLoopHistorySchema),
      'GET',
      undefined,
      signal,
    );
  }
  async function loadBrief(channelId: string, signal?: AbortSignal) {
    if (preview) return previewBrief(channelId, demoLoops);
    return request(
      `/channels/${channelId}/brief`,
      streamBriefSchema,
      'GET',
      undefined,
      signal,
    );
  }
  return (
    <WorkspaceContext.Provider
      value={{
        session,
        channels,
        selected,
        preview,
        fixtureBase,
        selectChannel: setSelectedId,
        connect,
        saveRetention,
        disconnect,
        loadMembers,
        grant,
        remove,
        logout,
        loadLoops,
        loadLoop,
        captureLoop,
        transitionLoop,
        loadLoopHistory,
        loadBrief,
        recordPreviewReview: (loop) => {
          if (!preview) throw new Error('Open the demo to try this action');
          requirePreviewConnection(loop.channelId);
          setDemoLoops((current) => [
            loop,
            ...current.filter((item) => item.id !== loop.id),
          ]);
          setDemoHistory((current) => ({
            ...current,
            [loop.id]: [
              {
                version: 1,
                fromStatus: null,
                toStatus: 'confirmed',
                reason: null,
                actorTwitchUserId: session.user.twitchUserId,
                occurredAt: loop.createdAt,
              },
            ],
          }));
        },
        href,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('WorkspaceProvider is required');
  return context;
}
