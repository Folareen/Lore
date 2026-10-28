'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, Link2, Radio } from 'lucide-react';
import type { Channel } from '@lore/shared';
import { useWorkspace } from './workspace-context';
import { Avatar } from '../../components/avatar';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { LiveCapture } from './live-capture';
export function ChannelSettings() {
  const { selected, href } = useWorkspace();
  if (!selected)
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Channel settings</h1>
            <p>A few preferences to make this space yours.</p>
          </div>
        </div>
        <div className="empty-state">
          <Radio size={30} />
          <h2>Let’s start with a channel.</h2>
          <p>Connect your Twitch channel before setting its preferences.</p>
          <Link href={href('overview')} className="button primary">
            Go to your channels
          </Link>
        </div>
      </>
    );
  return <SettingsPanel key={selected.id} channel={selected} />;
}
function SettingsPanel({ channel }: { channel: Channel }) {
  const { saveRetention, disconnect, connect } = useWorkspace();
  const [days, setDays] = useState(channel.chatRetentionDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const owner = channel.role === 'owner';
  const reconnectLabel = busy ? 'Reconnecting…' : 'Reconnect channel';
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      await saveRetention(days);
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not save your preferences.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function disconnectChannel() {
    setBusy(true);
    setError('');
    try {
      await disconnect();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not disconnect your channel.',
      );
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }
  async function reconnect() {
    setBusy(true);
    setError('');
    try {
      await connect();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not reconnect your channel.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR CHANNEL, YOUR TERMS</p>
          <h1>Make it your space.</h1>
          <p>Connection and privacy preferences for {channel.displayName}.</p>
        </div>
        <span className="status purple">
          {owner ? 'Channel owner' : 'Owner-managed settings'}
        </span>
      </div>
      <div className="content-stack">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!owner && (
          <p className="notice">
            You can view these preferences. Only the channel owner can change
            them.
          </p>
        )}
        <LiveCapture
          key={`${channel.id}-${channel.connected}`}
          channel={channel}
        />
        <section className="panel">
          <div className="panel-title">
            <h2>Twitch connection</h2>
            <Link2 size={19} />
          </div>
          <div className="connection-row">
            <div className="connection-identity">
              <Avatar name={channel.displayName} size={48} />
              <div>
                <strong>{channel.displayName}</strong>
                <small>Twitch user ID {channel.twitchChannelId}</small>
              </div>
            </div>
            <span className={`status ${channel.connected ? '' : 'neutral'}`}>
              <i />
              {channel.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Keep the context. Set the limit.</h2>
          </div>
          <p className="panel-description">
            Choose how long ordinary captured chat can stay. The default is
            seven days; excerpts intentionally kept as evidence follow their own
            retention policy when evidence saving is available.
          </p>
          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="retention">Ordinary chat retention</label>
              <select
                id="retention"
                value={days}
                disabled={!owner || busy}
                onChange={(event) => {
                  setDays(Number(event.target.value));
                  setSaved(false);
                }}
              >
                {Array.from({ length: 7 }, (_, index) => index + 1).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value} {value === 1 ? 'day' : 'days'}
                      {value === 7 ? ' · default' : ''}
                    </option>
                  ),
                )}
              </select>
              <small>
                Shorter is always okay. Longer retention isn’t available yet.
              </small>
            </div>
            {owner && (
              <div className="save-row">
                <button
                  className="button primary"
                  disabled={busy || days === channel.chatRetentionDays}
                >
                  {busy ? 'Saving…' : 'Save preferences'}
                </button>
                {saved && (
                  <span className="inline-success" role="status">
                    <Check size={15} />
                    Preferences saved
                  </span>
                )}
              </div>
            )}
          </form>
        </section>
        {owner && (
          <section className="panel danger-section">
            <div>
              <h2>
                {channel.connected
                  ? 'Disconnect this channel'
                  : 'Pick up where you left off'}
              </h2>
              <p>
                {channel.connected
                  ? 'Your records stay. Team access is removed, and your channel will be disconnected until you reconnect.'
                  : 'Reconnect your Twitch channel to make this space active again. You’ll need to add your team back.'}
              </p>
            </div>
            <button
              className={`button ${channel.connected ? 'danger' : 'primary'}`}
              disabled={busy}
              onClick={() =>
                channel.connected ? setConfirm(true) : void reconnect()
              }
            >
              {channel.connected ? 'Disconnect channel' : reconnectLabel}
            </button>
          </section>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title={`Disconnect ${channel.displayName}?`}
          confirmLabel="Disconnect channel"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void disconnectChannel()}
        >
          <p>
            Everyone on this channel’s team will lose access. Your records stay,
            but you’ll need to grant team roles again after reconnecting.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
