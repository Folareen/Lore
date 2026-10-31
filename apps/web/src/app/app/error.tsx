'use client';
import Link from 'next/link';
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="standalone-error">
      <h1>We lost the thread for a moment.</h1>
      <p className="muted">
        Your community couldn’t be loaded. Give it another try, or sign in again
        if your session has ended.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link href="/login" className="quiet-link">
        Back to sign in
      </Link>
    </main>
  );
}
