'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  BookOpen,
  ChevronRight,
  Home,
  Settings2,
  Users,
  UserRound,
  ArrowUpRight,
  Bookmark,
  ListChecks,
} from 'lucide-react';
import type { Channel, Session } from '@lore/shared';
import { CandidatesProvider } from '../candidates/candidates-context';
import { Brand } from '../../components/brand';
import { Avatar } from '../../components/avatar';
import { ThemeToggle } from '../../components/theme-control';
import { WorkspaceProvider, useWorkspace } from './workspace-context';
const navigation = [
  { view: 'overview', title: 'Overview', icon: Home },
  { view: 'streamer', title: 'Open loops', icon: Bookmark },
  { view: 'candidates', title: 'Needs review', icon: BookOpen },
  { view: 'brief', title: 'Next-stream brief', icon: ListChecks },
  { view: 'settings', title: 'Channel settings', icon: Settings2 },
  { view: 'team', title: 'Your team', icon: Users },
  { view: 'account', title: 'Account', icon: UserRound },
] as const;
function Shell({
  children,
  view,
}: {
  children: React.ReactNode;
  view?: string;
}) {
  const { session, channels, selected, preview, selectChannel, href } =
    useWorkspace();
  const path = usePathname();
  const searchParams = useSearchParams();
  const current = preview
    ? searchParams.get('view') || view || 'overview'
    : path.split('/')[2] || 'overview';
  const title =
    navigation.find((item) => item.view === current)?.title || 'Overview';
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <p className="sidebar-label">YOUR COMMUNITY SPACE</p>
        <nav aria-label="Workspace navigation">
          {navigation.map(({ view: item, title: label, icon: Icon }) => (
            <Link
              key={item}
              href={href(item)}
              aria-current={current === item ? 'page' : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <BookOpen size={23} />
          <p>Good stories start here.</p>
          <small>A little context for the next stream.</small>
        </div>
        <div className="sidebar-account">
          <Avatar name={session.user.login} size={35} />
          <div>
            <strong>{session.user.displayName}</strong>
            <small>{preview ? 'Demo fixture' : 'Twitch account'}</small>
          </div>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="workspace-topbar">
          <div className="breadcrumb">
            <span>Your workspace</span>
            <ChevronRight size={13} />
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            {channels.length > 0 && (
              <label className="channel-picker">
                <span className="sr-only">Selected channel</span>
                <select
                  aria-label="Selected channel"
                  value={selected?.id || ''}
                  onChange={(event) => selectChannel(event.target.value)}
                >
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ThemeToggle />
            <Avatar name={session.user.login} size={34} />
          </div>
        </header>
        {preview && (
          <div className="preview-banner">
            <span>
              <strong>Demo fixture</strong> · Preview only. Changes reset on
              refresh.
            </span>
            <Link href="/login">
              Make it yours
              <ArrowUpRight size={12} />
            </Link>
          </div>
        )}
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
export function AppShell({
  session,
  channels,
  preview = false,
  view,
  children,
}: {
  session: Session;
  channels: Channel[];
  preview?: boolean;
  view?: string;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider
      session={session}
      initialChannels={channels}
      preview={preview}
    >
      <CandidatesProvider>
        <Suspense fallback={<p role="status">Loading your workspace…</p>}>
          <Shell view={view}>{children}</Shell>
        </Suspense>
      </CandidatesProvider>
    </WorkspaceProvider>
  );
}
