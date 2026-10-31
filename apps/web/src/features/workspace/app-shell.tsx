'use client';
import { Select } from '../../components/select';
import Link from 'next/link';
import { DemoToolbar } from '../demo/demo-home';
import { WorkspaceStream } from '../continuity/live-updates';
import { OverlayProvider } from '../overlay/overlay-context';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MobileNavigation } from './mobile-navigation';
import {
  BookOpen,
  ClipboardCheck,
  ShieldCheck,
  Monitor,
  Home,
  Settings2,
  Users,
  UserRound,
  ArrowUpRight,
  Bookmark,
  ListChecks,
} from 'lucide-react';
import type { Channel, Session } from '@lore/shared';
import { PublicationsProvider } from '../publications/publications-context';
import { CasesProvider } from '../cases/cases-context';
import { ModerationProvider } from '../moderation/moderation-context';
import { CandidatesProvider } from '../candidates/candidates-context';
import { Brand } from '../../components/brand';
import { Avatar } from '../../components/avatar';
import { ThemeToggle } from '../../components/theme-control';
import { WorkspaceProvider, useWorkspace } from './workspace-context';
const navigation = [
  { view: 'overview', title: 'Overview', icon: Home },
  { view: 'streamer', title: 'Open loops', icon: Bookmark },
  { view: 'overlay', title: 'Stream overlay', icon: Monitor },
  { view: 'publications', title: 'Community publishing', icon: BookOpen },
  { view: 'moderation', title: 'Moderation cases', icon: ShieldCheck },
  { view: 'candidates', title: 'Needs review', icon: ClipboardCheck },
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
  const route = preview
    ? searchParams.get('view') || view || 'overview'
    : path.split('/')[2] || 'overview';
  const current = ['case', 'cases', 'workflows'].includes(route)
    ? 'moderation'
    : route === 'community'
      ? 'publications'
      : route;
  const title =
    route === 'guide'
      ? 'Demo guide'
      : route === 'chat'
        ? 'Chat simulation'
        : navigation.find((item) => item.view === current)?.title || 'Overview';
  const links = navigation
    .filter(
      (item) =>
        !['moderation', 'overlay'].includes(item.view) ||
        selected?.role === 'owner' ||
        selected?.role === 'moderator',
    )
    .map(({ view: item, title: label, icon: Icon }) => (
      <Link
        key={item}
        href={href(item)}
        aria-current={current === item ? 'page' : undefined}
      >
        <Icon size={19} />
        <span>{label}</span>
      </Link>
    ));
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <MobileNavigation user={session.user} preview={preview}>
          {links}
        </MobileNavigation>
        <nav aria-label="Community navigation">{links}</nav>
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
          <div className="current-page">{title}</div>
          <div className="topbar-actions">
            {channels.length > 0 && (
              <label className="channel-picker">
                <span className="sr-only">Selected channel</span>
                <Select
                  aria-label="Selected channel"
                  value={selected?.id || ''}
                  onValueChange={(event) => selectChannel(event)}
                >
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.displayName}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <ThemeToggle />
            <Avatar name={session.user.login} size={34} />
          </div>
        </header>
        <main id="main-content">
          {preview && (
            <div className="demo-session-bar">
              <span>
                <strong>Demo fixture</strong> · Simulated actions
              </span>
              <div className="demo-session-actions">
                <DemoToolbar />
                <Link href="/login">
                  Sign in <ArrowUpRight size={12} aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
          <WorkspaceStream />
          {children}
        </main>
      </div>
    </div>
  );
}
export function AppShell({
  session,
  channels,
  preview = false,
  fixtureBase = '/demo',
  view,
  children,
}: {
  session: Session;
  channels: Channel[];
  preview?: boolean;
  fixtureBase?: '/demo';
  view?: string;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider
      session={session}
      initialChannels={channels}
      preview={preview}
      fixtureBase={fixtureBase}
    >
      <PublicationsProvider>
        <OverlayProvider>
          <CasesProvider>
            <ModerationProvider>
              <CandidatesProvider>
                <Suspense
                  fallback={<p role="status">Loading your community…</p>}
                >
                  <Shell view={view}>{children}</Shell>
                </Suspense>
              </CandidatesProvider>
            </ModerationProvider>
          </CasesProvider>
        </OverlayProvider>
      </PublicationsProvider>
    </WorkspaceProvider>
  );
}
