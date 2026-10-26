'use client';
import { createContext, useContext, useState } from 'react';
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
} from '@lore/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { previewPeople } from '../../lib/preview-data';
type Workspace = {
  session: Session;
  channels: Channel[];
  selected: Channel | undefined;
  preview: boolean;
  selectChannel: (id: string) => void;
  connect: () => Promise<void>;
  saveRetention: (days: number) => Promise<void>;
  disconnect: () => Promise<void>;
  loadMembers: (id: string, signal?: AbortSignal) => Promise<Membership[]>;
  grant: (input: GrantMembership) => Promise<void>;
  remove: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  href: (view: 'overview' | 'settings' | 'team' | 'account') => string;
};
const WorkspaceContext = createContext<Workspace | null>(null);
export function WorkspaceProvider({
  session,
  initialChannels,
  preview = false,
  children,
}: {
  session: Session;
  initialChannels: Channel[];
  preview?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [channels, setChannels] = useState(initialChannels);
  const [selectedId, setSelectedId] = useState(initialChannels[0]?.id);
  const [demoMembers, setDemoMembers] = useState(previewPeople);
  const selected = channels.find((channel) => channel.id === selectedId);
  const href = (view: 'overview' | 'settings' | 'team' | 'account') =>
    preview
      ? `/preview${view === 'overview' ? '' : `?view=${view}`}`
      : `/app${view === 'overview' ? '' : `/${view}`}`;
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
  return (
    <WorkspaceContext.Provider
      value={{
        session,
        channels,
        selected,
        preview,
        selectChannel: setSelectedId,
        connect,
        saveRetention,
        disconnect,
        loadMembers,
        grant,
        remove,
        logout,
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
