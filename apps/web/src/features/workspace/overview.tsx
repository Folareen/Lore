'use client';
import Image from 'next/image';
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
} from 'lucide-react';
import { useWorkspace } from './workspace-context';
import { Avatar } from '../../components/avatar';
import { TwitchMark } from '../../components/brand';
export function Overview() {
  const { session, channels, selected, preview, selectChannel, connect, href } =
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
          <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
          <h1>Hey, {session.user.displayName}.</h1>
          <p>A little setup now. A little less to forget next stream.</p>
        </div>
        <span>
          {preview ? 'A look around Lore' : 'Your community, your space'}
        </span>
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
            <h2>Make yourself at home</h2>
          </div>
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
                    ? 'You’re connected. Nice.'
                    : 'Your channel, right here.'}
                </small>
              </div>
            </div>
            <Link
              className={`setup-step ${selected ? 'done' : ''}`}
              href={href('settings')}
            >
              <span className="step-icon">
                <Settings2 size={15} />
              </span>
              <div>
                <strong>Set your preferences</strong>
                <small>Keep things on your terms.</small>
              </div>
              <ArrowUpRight size={14} />
            </Link>
            <Link className="setup-step" href={href('team')}>
              <span className="step-icon">
                <Link2 size={15} />
              </span>
              <div>
                <strong>Bring your people</strong>
                <small>A familiar face goes a long way.</small>
              </div>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>
      </div>
      <section className="workspace-note">
        <Image
          src="/illustrations/memory-party.png"
          alt=""
          width="168"
          height="120"
        />
        <div>
          <h2>The best bits are still ahead.</h2>
          <p>
            Your channel and team are the foundation. Promise tracking,
            moderator handoffs, and approved community stories are coming next.
            We’ll keep them connected, from capture to screen.
          </p>
        </div>
      </section>
    </>
  );
}
