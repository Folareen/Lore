'use client';
import { Select } from '../../components/select';
import Link from 'next/link';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  Link2,
  Plus,
  Trash2,
  Users,
  RefreshCw,
} from 'lucide-react';
import {
  grantMembershipSchema,
  type Membership,
  type GrantMembership,
} from '@lore/shared';
import { useWorkspace } from './workspace-context';
import { Avatar } from '../../components/avatar';
import { ConfirmDialog } from '../../components/confirm-dialog';
const roleLabels = {
  owner: 'Owner',
  moderator: 'Moderator',
  team: 'Team member',
};
export function Team() {
  const {
    channels,
    selectChannel,
    connect,
    selected,
    session,
    preview,
    href,
    loadMembers,
    grant,
    remove,
  } = useWorkspace();
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<GrantMembership['role']>('moderator');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [removing, setRemoving] = useState<Membership | null>(null);
  const [revision, setRevision] = useState(0);
  const channelId = selected?.id;
  useLiveRefresh(channelId ?? '', () => setRevision((value) => value + 1));
  const allowed = selected?.role === 'owner' && selected.connected;
  const ownChannel = channels.find((channel) => channel.role === 'owner');
  async function connectOwnChannel() {
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
  useEffect(() => {
    setLoadError('');
    if (!channelId || !allowed) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    loadMembers(channelId, controller.signal)
      .then((people) => {
        if (!controller.signal.aborted) setMembers(people);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error ? error.message : 'Could not load the team.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [channelId, allowed, loadMembers, revision]);
  useEffect(() => {
    setError('');
    setSuccess('');
    setRemoving(null);
    setUserId('');
    setMembers([]);
  }, [channelId, allowed]);
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const parsed = grantMembershipSchema.safeParse({
      twitchUserId: userId.trim(),
      role,
    });
    if (!parsed.success) {
      setError('Enter a numeric Twitch user ID and choose a role.');
      return;
    }
    setBusy(true);
    try {
      await grant(parsed.data);
      setUserId('');
      if (!preview) setRevision((value) => value + 1);
      setSuccess('Team access updated.');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not add this person.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeRole(person: Membership, nextRole: string) {
    const parsed = grantMembershipSchema.safeParse({
      twitchUserId: person.twitchUserId,
      role: nextRole,
    });
    if (!parsed.success) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await grant(parsed.data);
      if (!preview) setRevision((value) => value + 1);
      setSuccess('Role updated.');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not update this role.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function removePerson() {
    if (!removing) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await remove(removing.userId);
      if (!preview) setRevision((value) => value + 1);
      setSuccess('Team access removed.');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not remove access.',
      );
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }
  return (
    <div className="content-stack team-page">
      <div className="page-heading">
        <div>
          <h1>Teams</h1>
          <p>Switch communities and see your role in each team.</p>
        </div>
        {!ownChannel?.connected && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void connectOwnChannel()}
          >
            <Link2 size={16} aria-hidden="true" />
            {busy
              ? 'Connecting…'
              : ownChannel
                ? 'Reconnect your channel'
                : 'Connect your channel'}
          </button>
        )}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {channels.length > 0 && (
        <section className="panel team-directory" aria-label="Your teams">
          {channels.map((channel) => (
            <button
              key={channel.id}
              className={`channel-row ${selected?.id === channel.id ? 'selected' : ''}`}
              aria-label={`Select ${channel.displayName} team`}
              aria-pressed={selected?.id === channel.id}
              onClick={() => selectChannel(channel.id)}
            >
              <Avatar name={channel.displayName} size={40} />
              <div className="channel-info">
                <strong>{channel.displayName}</strong>
                <small>
                  {roleLabels[channel.role]}
                  {!channel.connected && ' · Disconnected'}
                </small>
              </div>
              {selected?.id === channel.id ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <ChevronRight size={18} aria-hidden="true" />
              )}
            </button>
          ))}
          <p className="section-footnote">
            To join another team, share your Twitch user ID from{' '}
            <Link className="text-link" href={href('account')}>
              Account
            </Link>{' '}
            with its owner.
          </p>
        </section>
      )}
      {!selected && (
        <div className="empty-state">
          <Users size={30} />
          <h2>No teams yet</h2>
          <p>
            Connect your own channel, or share your Twitch user ID from{' '}
            <Link className="text-link" href={href('account')}>
              Account
            </Link>{' '}
            with another channel’s owner.
          </p>
        </div>
      )}
      {selected && !allowed && (
        <div className="panel">
          <h2>{selected.displayName} team</h2>
          <p className="team-access-description">
            {selected.role !== 'owner'
              ? `You’re a ${roleLabels[selected.role].toLowerCase()} here. Only the channel owner can add people or change roles.`
              : 'Team access is cleared when a channel is disconnected. Reconnect, then add your people again.'}
          </p>
          <Link
            href={href(selected.role === 'owner' ? 'settings' : 'overview')}
            className="button secondary"
          >
            {selected.role === 'owner'
              ? 'Channel settings'
              : 'Open channel overview'}
          </Link>
        </div>
      )}
      {selected && allowed && (
        <div className="content-stack">
          {success && (
            <p className="inline-success" role="status">
              {success}
            </p>
          )}
          <section className="panel">
            <div className="panel-title">
              <h2>{selected.displayName} team</h2>
              <span className="count-tag">
                {members.length + 1} {members.length ? 'people' : 'person'}
              </span>
            </div>
            <div className="member-list">
              <div className="member-row member-row-owner">
                <Avatar name={session.user.login} />
                <div className="member-identity">
                  <strong>
                    {session.user.displayName}{' '}
                    <span className="muted">(you)</span>
                  </strong>
                  <small>Channel owner</small>
                </div>
                <span className="status purple">Owner</span>
              </div>
              {loading && (
                <p className="empty-small" role="status">
                  Getting your people…
                </p>
              )}
              {!loading && loadError && (
                <div className="notice error" role="alert">
                  <p>{loadError}</p>
                  <button
                    className="button secondary compact"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    <RefreshCw size={14} />
                    Try again
                  </button>
                </div>
              )}
              {!loading &&
                !loadError &&
                members.length > 0 &&
                members.map((person) => (
                  <div className="member-row" key={person.userId}>
                    <Avatar name={person.login} />
                    <div className="member-identity">
                      <strong>{person.displayName}</strong>
                      <small>Owner-approved access</small>
                    </div>
                    <Select
                      aria-label={`Role for ${person.displayName}`}
                      value={person.role}
                      disabled={busy}
                      onValueChange={(event) => void changeRole(person, event)}
                    >
                      <option value="moderator">Moderator</option>
                      <option value="team">Team member</option>
                    </Select>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${person.displayName}`}
                      disabled={busy}
                      onClick={() => setRemoving(person)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              {!loading && !loadError && members.length === 0 && (
                <p className="empty-small">
                  Just you for now. Add a familiar face below.
                </p>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Bring someone along</h2>
              <Users size={19} />
            </div>
            <p className="panel-description">
              They’ll need to sign in to Lore with Twitch first. Ask for the
              Twitch user ID on their Lore account page.
              {preview
                ? ' In this preview, use 200 for moss.jpeg or 300 for pixel_pilot.'
                : ''}
            </p>
            <form className="invite-form" onSubmit={add}>
              <div className="field">
                <label htmlFor="twitch-user-id">Twitch user ID</label>
                <input
                  id="twitch-user-id"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 200"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  disabled={busy}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="team-role">Role</label>
                <Select
                  id="team-role"
                  value={role}
                  onValueChange={(event) => {
                    const parsed =
                      grantMembershipSchema.shape.role.safeParse(event);
                    if (parsed.success) setRole(parsed.data);
                  }}
                  disabled={busy}
                >
                  <option value="moderator">Moderator</option>
                  <option value="team">Team member</option>
                </Select>
              </div>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  'Adding…'
                ) : (
                  <>
                    <Plus size={16} />
                    Add to team
                  </>
                )}
              </button>
            </form>
            <div className="role-guide">
              <div>
                <strong>Moderator</strong>
                <p>
                  Review private moderation cases and help manage community
                  stories.
                </p>
              </div>
              <div>
                <strong>Team member</strong>
                <p>
                  Shared channel context, without private moderation access.
                </p>
              </div>
            </div>
            <p className="section-footnote">
              Lore roles don’t grant Twitch chat or moderation permissions.
              Channel settings and team access stay with the owner.
            </p>
          </section>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.displayName}?`}
          confirmLabel="Remove access"
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void removePerson()}
        >
          <p>
            They’ll lose access to this channel immediately. You can add them
            again later.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
