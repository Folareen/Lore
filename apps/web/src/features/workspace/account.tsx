'use client';
import { useState } from 'react';
import { Copy, Check, LogOut, ShieldCheck } from 'lucide-react';
import { useWorkspace } from './workspace-context';
import { Avatar } from '../../components/avatar';
import { ThemeChoices } from '../../components/theme-control';
export function Account() {
  const { session, logout, preview } = useWorkspace();
  const signOutLabel = preview ? 'Leave preview' : 'Sign out';
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(session.user.twitchUserId);
      setCopied(true);
    } catch {
      setError('Could not copy. You can select the user ID below.');
    }
  }
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not sign out. Please try again.',
      );
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A FAMILIAR FACE</p>
          <h1>Account</h1>
          <p>Your Twitch account and appearance preferences.</p>
        </div>
      </div>
      <div className="content-stack">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <section className="panel">
          <div className="panel-title">
            <h2>Your Twitch account</h2>
            <ShieldCheck size={19} />
          </div>
          <div className="connection-identity">
            <Avatar name={session.user.login} size={60} />
            <div>
              <strong>{session.user.displayName}</strong>
              <small>@{session.user.login}</small>
            </div>
            <span className="status purple">Twitch sign-in</span>
          </div>
          <div className="form-grid" style={{ marginTop: 26 }}>
            <div className="field">
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                value={session.user.displayName}
                readOnly
              />
              <small>Synced when you sign in with Twitch.</small>
            </div>
            <div className="field">
              <label htmlFor="account-twitch-id">Twitch user ID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="account-twitch-id"
                  value={session.user.twitchUserId}
                  readOnly
                />
                <button
                  className="icon-button"
                  aria-label="Copy Twitch user ID"
                  onClick={() => void copy()}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
              <small role={copied ? 'status' : undefined}>
                {copied
                  ? 'Copied. Share it with your channel owner.'
                  : 'Share this with an owner to join their team.'}
              </small>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Appearance</h2>
          </div>
          <p className="panel-description">
            Choose light, dark or your device’s theme.
          </p>
          <ThemeChoices />
        </section>
        <section className="panel danger-section">
          <div>
            <h2>Sign out</h2>
            <p>
              Signing out ends this Lore session. Your channel and team stay
              right where you left them.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void signOut()}
          >
            <LogOut size={16} />
            {busy ? 'Leaving…' : signOutLabel}
          </button>
        </section>
      </div>
    </>
  );
}
