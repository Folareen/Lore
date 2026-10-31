'use client';
import Link from 'next/link';
import { useState } from 'react';
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
import { QuickCapture } from '../open-loops/quick-capture';
export function Overview() {
  const { session, channels, selected, selectChannel, connect, href } =
    useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ownChannel = channels.find((channel) => channel.role === 'owner');
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
          <p className="eyebrow">Your workspace</p>
          <h1>Hey, {session.user.displayName}.</h1>
          <p>Pick a channel, save a promise or see what’s next.</p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="workspace-columns">
        <section className="panel">
          <div className="panel-title">
            <h2>Your channels</h2>
            <span className="count-tag">
              {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
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
                Connect your Twitch channel to set up your space and bring your
                team along.
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
                You have {selected.role === 'moderator' ? 'moderator' : 'team'}{' '}
                access. The channel owner manages roles and connections.
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
              <Link className="setup-step" href={href('team')}>
                <span className="step-icon">
                  <Link2 size={15} />
                </span>
                <div>
                  <strong>Add your team</strong>
                  <small>Grant moderators and team members access.</small>
                </div>
                <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </section>
      </div>
      {selected && (
        <div className="overview-capture">
          <QuickCapture
            key={selected.id}
            channelId={selected.id}
            disabled={!selected.connected}
          />
          <Link href={href('streamer')} className="button secondary">
            See your open loops
          </Link>
        </div>
      )}
      {selected && (
        <section className="overview-shortcuts" aria-label="Where to next">
          <Link href={href('brief')}>
            <Bookmark size={21} aria-hidden="true" />
            <span>
              <strong>Before you go live</strong>
              <small>Open your next-stream brief</small>
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
              <small>Prepare a community update</small>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </section>
      )}
    </>
  );
}
