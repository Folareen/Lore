import Link from 'next/link';
import {
  MarketingHeader,
  MarketingFooter,
} from '../../features/marketing/marketing-shell';
import { audiences, guides } from '../../features/help/guides';
export const metadata = {
  title: 'Help & guides',
  description:
    'Practical guides for streamers, moderators and community viewers using Lore.',
};
export default function HelpPage() {
  return (
    <div className="landing">
      <MarketingHeader />
      <main id="main-content" className="help-page">
        <header className="help-intro">
          <h1>A little guidance, when you need it.</h1>
          <p>
            Choose your part in the community. Learn the everyday tasks and the
            details that are easy to miss.
          </p>
        </header>
        <div className="help-directory">
          {audiences.map((audience) => (
            <Link key={audience} href={`/help/${audience}`}>
              <h2>{guides[audience].label}</h2>
              <p>{guides[audience].description}</p>
              <span>Read the guide →</span>
            </Link>
          ))}
        </div>
        <p className="muted">
          Want to learn by doing?{' '}
          <Link href="/demo?view=guide">Explore the guided demo</Link>. No
          sign-in or channel setup needed.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
