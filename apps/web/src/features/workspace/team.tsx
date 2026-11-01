'use client';
import { ApiError } from '../../lib/api';
import {
  savePendingModerator,
  takePendingModerator,
  type PendingModerator,
} from './pending-moderator';
import { Select } from '../../components/select';
import Link from 'next/link';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useRef, useState } from 'react';
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
  type TwitchModeratorAccess,
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
    loadModeratorAccess,
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
  const [moderatorAccess, setModeratorAccess] = useState<{
    channelId: string;
    value: TwitchModeratorAccess;
  } | null>(null);
  const [moderatorError, setModeratorError] = useState('');
  const channelId = selected?.id;
  useLiveRefresh(channelId ?? '', () => setRevision((value) => value + 1));
  const allowed = selected?.role === 'owner' && selected.connected;
  const ownChannel = channels.find((channel) => channel.role === 'owner');
  const twitchAccess =
    moderatorAccess && moderatorAccess.channelId === channelId
      ? moderatorAccess.value
      : null;
  useEffect(() => {
    if (!channelId || !allowed) return;
    const controller = new AbortController();
    setModeratorAccess(null);
    setModeratorError('');
    loadModeratorAccess(channelId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted)
          setModeratorAccess({ channelId, value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setModeratorError(
            error instanceof Error
              ? error.message
              : 'Could not check Twitch moderator access.',
          );
      });
    return () => controller.abort();
  }, [channelId, allowed, loadModeratorAccess, revision]);
  useEffect(() => {
    setError('');
    setSuccess('');
    setRemoving(null);
    setUserId('');
    setMembers([]);
  }, [channelId, allowed]);
  const [pending, setPending] = useState<PendingModerator | null>(null);
  const returning = useRef(false);
  const resuming = useRef(false);
  useEffect(() => {
    if (preview || returning.current) return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get('moderator');
    if (!result) return;
    returning.current = true;
    url.searchParams.delete('moderator');
    window.history.replaceState(null, '', url.pathname + url.search);
    try {
      const saved = takePendingModerator(session.user.id);
      if (result !== 'resume') {
        setError('Twitch authorization was cancelled. No role was changed.');
      } else if (
        !saved ||
        !channels.some(
          (channel) =>
            channel.id === saved.channelId &&
            channel.role === 'owner' &&
            channel.connected,
        )
      ) {
        setError('This moderator change expired. Please try again.');
      } else {
        selectChannel(saved.channelId);
        setPending(saved);
      }
    } catch {
      setError('Could not restore the moderator change. Please try again.');
    }
  }, [preview, session.user.id, channels, selectChannel]);
  useEffect(() => {
    if (
      !pending ||
      selected?.id !== pending.channelId ||
      !allowed ||
      !twitchAccess ||
      resuming.current
    )
      return;
    resuming.current = true;
    setPending(null);
    if (!twitchAccess.authorized) {
      setError(
        'Twitch moderator permission was not granted. Try assigning Moderator again.',
      );
      return;
    }
    setBusy(true);
    grant({ twitchUserId: pending.twitchUserId, role: 'moderator' })
      .then(() => {
        setSuccess('Moderator enabled in Lore and Twitch.');
        setRevision((value) => value + 1);
      })
      .catch((error) =>
        setError(
          error instanceof Error
            ? error.message
            : 'Could not assign Moderator. Please try again.',
        ),
      )
      .finally(() => setBusy(false));
  }, [pending, selected?.id, allowed, twitchAccess, grant]);
  function authorizeModerator(input: GrantMembership) {
    if (!channelId) throw new Error('Select your team first.');
    savePendingModerator({
      actorId: session.user.id,
      channelId,
      twitchUserId: input.twitchUserId,
    });
    window.location.assign('/api/auth/twitch/team');
  }
  async function assignRole(input: GrantMembership) {
    if (
      !preview &&
      input.role === 'moderator' &&
      twitchAccess?.authorized === false
    ) {
      authorizeModerator(input);
      return false;
    }
    try {
      await grant(input);
      return true;
    } catch (error) {
      if (
        !preview &&
        input.role === 'moderator' &&
        error instanceof ApiError &&
        error.status === 403
      ) {
        authorizeModerator(input);
        return false;
      }
      throw error;
    }
  }
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
      if (!(await assignRole(parsed.data))) return;
      setUserId('');
      if (!preview) setRevision((value) => value + 1);
      setSuccess(
        parsed.data.role === 'moderator'
          ? 'Moderator enabled in Lore and Twitch.'
          : 'Team access updated.',
      );
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
      if (!(await assignRole(parsed.data))) return;
      if (!preview) setRevision((value) => value + 1);
      setSuccess(
        parsed.data.role === 'moderator'
          ? 'Moderator enabled in Lore and Twitch.'
          : 'Lore role updated. Twitch roles are unchanged.',
      );
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
            <p className="section-footnote">
              Moderator gives access in Lore and Twitch. Team member gives Lore
              access only.
            </p>
            {preview && (
              <p className="section-footnote">
                Twitch role changes are simulated in the demo.
              </p>
            )}
            {moderatorError && (
              <p className="notice error" role="alert">
                {moderatorError}{' '}
                <button
                  className="button secondary compact"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Retry Twitch status
                </button>
              </p>
            )}
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
                      <small>
                        {person.role === 'moderator'
                          ? twitchAccess?.authorized &&
                            twitchAccess.moderators.includes(
                              person.twitchUserId,
                            )
                            ? 'Moderator in Lore and Twitch'
                            : twitchAccess?.authorized
                              ? 'Twitch moderator not enabled'
                              : 'Lore moderator · Twitch status unverified'
                          : 'Owner-approved access'}
                      </small>
                    </div>
                    <div className="member-role-controls">
                      <Select
                        aria-label={`Role for ${person.displayName}`}
                        value={person.role}
                        disabled={busy}
                        onValueChange={(event) =>
                          void changeRole(person, event)
                        }
                      >
                        <option value="moderator">Moderator</option>
                        <option value="team">Team member</option>
                      </Select>
                      {person.role === 'moderator' &&
                        twitchAccess &&
                        !twitchAccess.moderators.includes(
                          person.twitchUserId,
                        ) && (
                          <button
                            className="button secondary compact"
                            disabled={busy}
                            onClick={() => void changeRole(person, 'moderator')}
                          >
                            Enable on Twitch
                          </button>
                        )}
                    </div>
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
            {twitchAccess?.authorized === false && (
              <p className="section-footnote">
                When you choose Moderator, Twitch will ask you to approve the
                permission before Lore saves it.
              </p>
            )}
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
              <button
                className="button primary"
                disabled={
                  busy ||
                  Boolean(pending) ||
                  (role === 'moderator' && !twitchAccess && !moderatorError)
                }
              >
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
                  Moderate in Lore and Twitch, including private case review.
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
              Changing to Team member or removing access here leaves the Twitch
              role unchanged. Channel settings stay with the owner.
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
            again later. Their Twitch moderator role is unchanged.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
