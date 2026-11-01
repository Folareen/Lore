'use client';
import { Select } from '../../components/select';
import Link from 'next/link';
import { useLiveRefresh } from '../continuity/live-updates';
import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2, Users, RefreshCw } from 'lucide-react';
import {
  grantMembershipSchema,
  type Membership,
  type GrantMembership,
} from '@lore/shared';
import { useWorkspace } from './workspace-context';
import { Avatar } from '../../components/avatar';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function Team() {
  const { selected, session, preview, href, loadMembers, grant, remove } =
    useWorkspace();
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
    <>
      <div className="page-heading">
        <div>
          <h1>Your team</h1>
          <p>Manage access to {selected?.displayName || 'your community'}.</p>
        </div>
      </div>
      {!selected && (
        <div className="empty-state">
          <Users size={30} />
          <h2>A channel comes first.</h2>
          <p>Connect your channel before bringing your team into Lore.</p>
          <Link href={href('overview')} className="button primary">
            Go to your channels
          </Link>
        </div>
      )}
      {selected && !allowed && (
        <div className="panel">
          <div className="empty-state">
            <ShieldCheck size={30} />
            <h2>
              {selected.role !== 'owner'
                ? 'Only the owner can manage the team.'
                : 'Reconnect to bring your team back.'}
            </h2>
            <p>
              {selected.role !== 'owner'
                ? 'The owner adds people and assigns roles. You can see your role on the overview.'
                : 'Team access is cleared when a channel is disconnected. Reconnect, then add your people again.'}
            </p>
            <Link href={href('settings')} className="button secondary">
              Channel settings
            </Link>
          </div>
        </div>
      )}
      {selected && allowed && (
        <div className="content-stack">
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="inline-success" role="status">
              {success}
            </p>
          )}
          <section className="panel">
            <div className="panel-title">
              <h2>People with access</h2>
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
                  Trusted with private moderation context as those workflows
                  become available.
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
    </>
  );
}
