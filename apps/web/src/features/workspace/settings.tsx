'use client';
import { PageTitle } from '../../components/page-title';
import { SectionTabs } from '../../components/section-tabs';
import { Select } from '../../components/select';
import { useState } from 'react';
import Link from 'next/link';
import { Check, Radio } from 'lucide-react';
import type { Channel } from '@lore/shared';
import { useWorkspace } from './workspace-context';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { RetentionStatus } from './retention-status';
import { FeatureControls } from '../continuity/feature-controls';
import { LiveCapture } from './live-capture';
export function ChannelSettings() {
  const { selected, href } = useWorkspace();
  if (!selected)
    return (
      <>
        <div className="page-heading">
          <div>
            <PageTitle>Channel settings</PageTitle>
            <p>Capture, retention and channel access.</p>
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
  const [tab, setTab] = useState('connection');
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
          <PageTitle>Channel settings</PageTitle>
          <p>Connection and privacy preferences for {channel.displayName}.</p>
        </div>
        <span className={`status ${channel.connected ? '' : 'neutral'}`}>
          {channel.connected ? 'Twitch connected' : 'Disconnected'}
        </span>
      </div>
      <div className="content-stack settings-content">
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
        <SectionTabs
          label="Channel settings"
          value={tab}
          onValueChange={setTab}
          tabs={[
            {
              value: 'connection',
              label: 'Twitch & capture',
              content: (
                <div className="content-stack">
                  <LiveCapture
                    key={`${channel.id}-${channel.connected}`}
                    channel={channel}
                  />
                </div>
              ),
            },
            {
              value: 'features',
              label: 'Features',
              content: <FeatureControls expanded />,
            },
            {
              value: 'privacy',
              label: 'Privacy & data',
              content: (
                <div className="content-stack">
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Chat retention</h2>
                    </div>
                    <p className="panel-description">
                      Ordinary chat expires after this period. Shortening
                      retention also shortens existing deadlines. Retained
                      evidence is kept separately.
                    </p>
                    <form onSubmit={save} className="retention-form">
                      <div className="field">
                        <label htmlFor="retention">
                          Ordinary chat retention
                        </label>
                        <Select
                          id="retention"
                          value={days}
                          disabled={!owner || busy}
                          onValueChange={(event) => {
                            setDays(Number(event));
                            setSaved(false);
                          }}
                        >
                          {Array.from(
                            { length: 7 },
                            (_, index) => index + 1,
                          ).map((value) => (
                            <option key={value} value={value}>
                              {value} {value === 1 ? 'day' : 'days'}
                              {value === 7 ? ' · default' : ''}
                            </option>
                          ))}
                        </Select>
                      </div>
                      {owner && (
                        <div className="save-row">
                          <button
                            className="button primary"
                            disabled={
                              busy || days === channel.chatRetentionDays
                            }
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
                  <RetentionStatus channel={channel} />
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
                          channel.connected
                            ? setConfirm(true)
                            : void reconnect()
                        }
                      >
                        {channel.connected
                          ? 'Disconnect channel'
                          : reconnectLabel}
                      </button>
                    </section>
                  )}
                </div>
              ),
            },
          ]}
        />
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
          <p>
            Public pages are hidden while disconnected. Reconnecting restores
            previously published entries. Withdraw or delete entries in Public
            stories to revoke their publication.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
