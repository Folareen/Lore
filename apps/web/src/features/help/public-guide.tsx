import Link from 'next/link';
import { MarketingHeader, MarketingFooter } from '../marketing/marketing-shell';
import { GuideContent } from './guide-content';
import { guides, audiences, demoGuideHref, type GuideAudience } from './guides';
export function PublicGuide({ audience }: { audience: GuideAudience }) {
  return (
    <div className="landing">
      <MarketingHeader />
      <main id="main-content" className="help-page">
        <nav className="help-audiences" aria-label="Help guides">
          <Link href="/help">All guides</Link>
          {audiences.map((key) => (
            <Link
              key={key}
              href={`/help/${key}`}
              aria-current={key === audience ? 'page' : undefined}
            >
              {guides[key].label}
            </Link>
          ))}
        </nav>
        <h1>{guides[audience].label} guide</h1>
        <GuideContent audience={audience} href={demoGuideHref} />
        <p className="muted">
          Task links open safe demo examples.{' '}
          <Link href={audience === 'viewers' ? '/discover' : '/app'}>
            {audience === 'viewers'
              ? 'Discover real communities'
              : 'Open your workspace'}{' '}
            →
          </Link>
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
