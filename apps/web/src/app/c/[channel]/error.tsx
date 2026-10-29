'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="community-shell">
      <h1>This corner of Lore is taking a moment.</h1>
      <p>The public page could not be loaded.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
