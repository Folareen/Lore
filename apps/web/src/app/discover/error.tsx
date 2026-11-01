'use client';
import Link from 'next/link';
export default function DiscoverError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="discover-page">
      <h1>We couldn’t load the communities.</h1>
      <p>Please try again in a moment. You can also start a fresh search.</p>
      <div className="button-row">
        <button className="button primary" onClick={reset}>
          Try again
        </button>
        <Link className="button secondary" href="/discover">
          Start a new search
        </Link>
      </div>
    </main>
  );
}
