import Link from 'next/link';
import { Brand } from '../components/brand';
export default function NotFound() {
  return (
    <main id="main-content" className="standalone-error">
      <Brand />
      <h1>This chapter isn’t here.</h1>
      <p className="muted">
        The link may have changed, or the page is still being written.
      </p>
      <Link className="button primary" href="/">
        Back to the story
      </Link>
    </main>
  );
}
