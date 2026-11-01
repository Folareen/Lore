'use client';
import { IconButton } from '../../components/icon-button';
import { PageTitle } from '../../components/page-title';
import { useState } from 'react';
import { Copy, Check, LogOut } from 'lucide-react';
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
          <PageTitle>Account</PageTitle>
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
          </div>
          <div className="connection-identity">
            <Avatar name={session.user.login} size={60} />
            <div>
              <strong>{session.user.displayName}</strong>
              <small>@{session.user.login}</small>
            </div>
          </div>
          <div className="account-identifier">
            <div className="field">
              <label htmlFor="account-twitch-id">Twitch user ID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="account-twitch-id"
                  value={session.user.twitchUserId}
                  readOnly
                />
                <IconButton
                  label="Copy Twitch user ID"
                  onClick={() => void copy()}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </IconButton>
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
          <ThemeChoices />
        </section>
        <section className="panel danger-section">
          <div>
            <h2>Sign out</h2>
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
