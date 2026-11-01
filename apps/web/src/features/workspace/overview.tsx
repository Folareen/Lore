'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Link2,
  Radio,
  Settings2,
  Users,
  Plus,
  Bookmark,
} from 'lucide-react';
import { useWorkspace } from './workspace-context';
import { Avatar } from '../../components/avatar';
import { TwitchMark } from '../../components/brand';
import type { StreamBrief } from '@lore/shared';
import { QuickCapture } from '../open-loops/quick-capture';
import { useLiveRefresh } from '../continuity/live-updates';
type TeamProgress =
  | { channelId: string; status: 'ready'; count: number }
  | { channelId: string; status: 'loading' | 'error' };
export function Overview() {
  const {
    session,
    channels,
    selected,
    selectChannel,
    connect,
    href,
    loadMembers,
  } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ownChannel = channels.find((channel) => channel.role === 'owner');
  const teamChannelId =
    selected?.role === 'owner' && selected.connected ? selected.id : undefined;
  const [teamProgress, setTeamProgress] = useState<TeamProgress | null>(null);
  const [revision, setRevision] = useState(0);
  useLiveRefresh(teamChannelId ?? '', () => setRevision((value) => value + 1));
  useEffect(() => {
    if (!teamChannelId) return;
    const controller = new AbortController();
    setTeamProgress({ channelId: teamChannelId, status: 'loading' });
    void loadMembers(teamChannelId, controller.signal)
      .then((members) => {
        if (!controller.signal.aborted)
          setTeamProgress({
            channelId: teamChannelId,
            status: 'ready',
            count: members.length,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setTeamProgress({ channelId: teamChannelId, status: 'error' });
      });
    return () => controller.abort();
  }, [teamChannelId, loadMembers, revision]);
  const progress =
    teamProgress?.channelId === teamChannelId ? teamProgress : null;
  const hasTeam = progress?.status === 'ready' && progress.count > 0;
  async function connectChannel() {
    setBusy(true);
    setError('');
    try {
      await connect();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not connect your channel.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Hey, {session.user.displayName}.</h1>
          <p>
            {selected
              ? `Here’s what’s next for ${selected.displayName}.`
              : 'Let’s get your channel ready.'}
          </p>
        </div>
        {selected && (
          <Link href={href('brief')} className="button primary">
            Open next-stream brief <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      {selected && <OverviewBrief key={selected.id} channelId={selected.id} />}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <section className="overview-shortcuts" aria-label="Where to next">
          <Link href={href('candidates')}>
            <Bookmark size={21} aria-hidden="true" />
            <span>
              <strong>Review suggestions</strong>
              <small>Check possible follow-ups from chat</small>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          {selected.role !== 'team' && (
            <Link href={href('workflows')}>
              <Users size={21} aria-hidden="true" />
              <span>
                <strong>Taking over a shift?</strong>
                <small>Read your team’s handoff</small>
              </span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          )}
          <Link href={href('publications')}>
            <Radio size={21} aria-hidden="true" />
            <span>
              <strong>Something worth sharing?</strong>
              <small>Draft a public story</small>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </section>
      )}
      <details
        className="task-disclosure overview-setup"
        open={!selected || undefined}
      >
        <summary>Channels &amp; setup</summary>
        <div className="workspace-columns">
          <section className="panel">
            <div className="panel-title">
              <h2>Your channels</h2>
              <span className="count-tag">
                {channels.length}{' '}
                {channels.length === 1 ? 'channel' : 'channels'}
              </span>
            </div>
            {channels.length ? (
              <>
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    className={`channel-row ${selected?.id === channel.id ? 'selected' : ''}`}
                    aria-pressed={selected?.id === channel.id}
                    onClick={() => selectChannel(channel.id)}
                  >
                    <Avatar name={channel.displayName} size={44} />
                    <div className="channel-info">
                      <strong>{channel.displayName}</strong>
                      <small>
                        {channel.role === 'owner'
                          ? 'Your channel'
                          : `You’re a ${channel.role === 'team' ? 'team member' : 'moderator'}`}
                      </small>
                    </div>
                    <span
                      className={`status ${channel.connected ? '' : 'neutral'}`}
                    >
                      <i />
                      {channel.connected ? 'Connected' : 'Disconnected'}
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
                <div className="channel-actions">
                  <Link href={href('settings')} className="button secondary">
                    <Settings2 size={16} />
                    Channel settings
                  </Link>
                  {selected?.role === 'owner' && (
                    <Link href={href('team')} className="button secondary">
                      <Users size={16} />
                      Manage team
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Radio size={30} />
                <h2>A home for your channel.</h2>
                <p>
                  Connect your Twitch channel to set up your space and bring
                  your team along.
                </p>
              </div>
            )}
            {(!ownChannel || !ownChannel.connected) && (
              <div className="panel-footer">
                <p>
                  {ownChannel
                    ? 'Ready for another chapter?'
                    : 'Connect the channel on your Twitch account.'}
                </p>
                <button
                  className="button primary compact"
                  disabled={busy}
                  onClick={connectChannel}
                >
                  {busy ? (
                    'Connecting…'
                  ) : (
                    <>
                      <Plus size={15} />
                      {ownChannel ? 'Reconnect' : 'Connect channel'}
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>
                {selected && selected.role !== 'owner'
                  ? 'Your access'
                  : 'Get set up'}
              </h2>
            </div>
            {selected && selected.role !== 'owner' ? (
              <div className="content-stack">
                <p>
                  You have{' '}
                  {selected.role === 'moderator' ? 'moderator' : 'team'} access.
                  The channel owner manages roles and connections.
                </p>
                <Link className="button secondary" href={href('brief')}>
                  Open the next-stream brief
                </Link>
                <Link className="text-link" href={href('candidates')}>
                  Review suggestions →
                </Link>
              </div>
            ) : (
              <div className="setup-list">
                <div
                  className={`setup-step ${ownChannel?.connected ? 'done' : ''}`}
                >
                  <span className="step-icon">
                    {ownChannel?.connected ? (
                      <Check size={16} />
                    ) : (
                      <TwitchMark size={16} />
                    )}
                  </span>
                  <div>
                    <strong>Connect your Twitch</strong>
                    <small>
                      {ownChannel?.connected
                        ? 'Channel linked'
                        : 'Use your own Twitch channel.'}
                    </small>
                  </div>
                </div>
                <Link className="setup-step" href={href('settings')}>
                  <span className="step-icon">
                    <Settings2 size={15} />
                  </span>
                  <div>
                    <strong>Set your preferences</strong>
                    <small>Capture, retention and feature settings.</small>
                  </div>
                  <ArrowUpRight size={14} />
                </Link>
                <Link
                  className={`setup-step ${hasTeam ? 'done' : ''}`}
                  href={href('team')}
                >
                  <span className="step-icon">
                    {hasTeam ? <Check size={16} /> : <Link2 size={15} />}
                  </span>
                  <div>
                    <strong>
                      {hasTeam
                        ? 'Team added'
                        : teamChannelId && progress?.status !== 'ready'
                          ? 'Team access'
                          : 'Add your team'}
                    </strong>
                    <small>
                      {hasTeam
                        ? `${progress.count} ${progress.count === 1 ? 'teammate has' : 'teammates have'} access.`
                        : progress?.status === 'error'
                          ? 'Open Teams to check access.'
                          : teamChannelId && progress?.status !== 'ready'
                            ? 'Checking team access…'
                            : 'Grant moderators and team members access.'}
                    </small>
                  </div>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            )}
          </section>
        </div>
      </details>
      {selected && (
        <details className="task-disclosure overview-capture">
          <summary>Save a promise</summary>
          <QuickCapture
            key={selected.id}
            channelId={selected.id}
            disabled={!selected.connected}
          />
          <Link href={href('streamer')} className="button secondary">
            See all promises
          </Link>
        </details>
      )}
    </>
  );
}

function OverviewBrief({ channelId }: { channelId: string }) {
  const { loadBrief, href, preview } = useWorkspace();
  const [brief, setBrief] = useState<StreamBrief>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useLiveRefresh(channelId, () => setRevision((value) => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    void loadBrief(channelId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setBrief(data);
          setError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            'Could not load your promises. Open the brief to try again.',
          );
      });
    return () => controller.abort();
  }, [channelId, loadBrief, revision]);
  return (
    <section className="panel home-brief" aria-label="Active promises">
      <div className="panel-title">
        <h2>Still on the list</h2>
        {brief && <span className="count-tag">{brief.activeCount} active</span>}
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : !brief ? (
        <p role="status">Loading your promises…</p>
      ) : brief.items.length ? (
        <ul className="home-promises">
          {brief.items.slice(0, 3).map((item) => (
            <li key={item.id}>
              <Link
                href={`${href('streamer')}${preview ? '&' : '?'}loop=${item.id}#loop-${item.id}`}
              >
                <Bookmark size={18} aria-hidden="true" />
                <span>{item.wording}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="home-empty">
          <Bookmark size={28} aria-hidden="true" />
          <div>
            <h3>No active promises yet</h3>
            <p>Save a commitment, or review a suggestion from chat.</p>
          </div>
        </div>
      )}
      <div className="button-row">
        <Link className="text-link" href={href('streamer')}>
          All promises →
        </Link>
        <Link className="text-link" href={href('candidates')}>
          Review suggestions →
        </Link>
      </div>
    </section>
  );
}
