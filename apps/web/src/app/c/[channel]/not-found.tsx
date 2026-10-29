import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main-content" className="community-shell">
      <h1>This story is not public.</h1>
      <p>
        It may have been withdrawn, or this community has not published its Lore
        yet.
      </p>
      <Link className="button secondary" href="/">
        Back to Lore
      </Link>
    </main>
  );
}
