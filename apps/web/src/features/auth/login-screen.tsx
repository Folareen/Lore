'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { authStatusSchema } from '@lore/shared';
import { Brand, TwitchMark } from '../../components/brand';
import { ThemeToggle } from '../../components/theme-control';
import { apiRequest } from '../../lib/api';
export function LoginScreen({
  expired = false,
  failed = false,
}: {
  expired?: boolean;
  failed?: boolean;
}) {
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'disabled' | 'error'
  >('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    apiRequest('/auth/status', authStatusSchema, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted)
          setStatus(result.twitchConfigured ? 'ready' : 'disabled');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <main className="auth-page" id="main-content">
      <section className="auth-story">
        <Brand />
        <div>
          <h2>
            Your people.
            <br />
            Your stories.
            <br />
            Your little Lore.
          </h2>
          <Image
            src="/illustrations/memory-party.png"
            alt="A small crew of characters saving memories together"
            width="430"
            height="320"
          />
        </div>
        <p>Every stream has a story. Lore remembers it.</p>
      </section>
      <section className="auth-form-side">
        <ThemeToggle />
        <div className="auth-form">
          <span className="auth-symbol">
            <TwitchMark size={29} />
          </span>
          <h1>Welcome in.</h1>
          <p>
            One Twitch account. A place for your whole community. First time?
            Your Lore account is created when you sign in.
          </p>
          {expired && (
            <p className="notice">
              Your session ended. Sign in again to pick up where you left off.
            </p>
          )}
          {failed && (
            <p className="notice error" role="alert">
              That sign-in didn’t finish. You can give it another try.
            </p>
          )}
          {status === 'ready' ? (
            <a href="/api/auth/twitch" className="button primary">
              <TwitchMark size={19} />
              Continue with Twitch
              <ArrowUpRight size={18} />
            </a>
          ) : (
            <button className="button primary" disabled>
              <TwitchMark size={19} />
              {status === 'loading'
                ? 'Checking Twitch…'
                : 'Continue with Twitch'}
            </button>
          )}
          {status === 'disabled' && (
            <p className="notice" role="status">
              Our Twitch connection isn’t ready just yet. You can still explore
              the workspace preview below.
            </p>
          )}
          {status === 'error' && (
            <div className="notice error" role="alert">
              <p>We couldn’t check the connection.</p>
              <button
                className="button secondary compact"
                onClick={() => setRetry((value) => value + 1)}
              >
                <RefreshCw size={14} />
                Try again
              </button>
            </div>
          )}
          <Link href="/preview" className="quiet-link">
            Take a look around first
            <ArrowUpRight size={14} />
          </Link>
          <p className="auth-footnote">
            Signing in identifies you. Channel access is granted separately by
            its owner. You won’t be asked for chat or moderation permissions at
            this stage.
          </p>
          <Link href="/" className="quiet-link">
            <ArrowLeft size={14} />
            Back to the story
          </Link>
        </div>
      </section>
    </main>
  );
}
