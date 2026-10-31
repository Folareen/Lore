import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '../../components/brand';
import { ThemeToggle } from '../../components/theme-control';
import { MarketingMenu } from './marketing-menu';
export function MarketingHeader() {
  return (
    <header className="site-header marketing-header">
      <div className="marketing-header-content">
        <Brand />
        <nav className="marketing-nav" aria-label="Main navigation">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/#your-crew">For your crew</Link>
          <Link href="/#questions">Questions</Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Link className="text-link login-link" href="/login">
            Sign in
          </Link>
          <Link className="button primary compact" href="/demo">
            Try the demo <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <MarketingMenu />
        </div>
      </div>
    </header>
  );
}
export function MarketingFooter() {
  return (
    <footer className="site-footer marketing-footer">
      <Brand />
      <nav aria-label="Footer navigation">
        <Link href="/how-it-works">How it works</Link>
        <Link href="/demo">Explore the demo</Link>
        <a
          href="https://github.com/Folareen/Lore"
          target="_blank"
          rel="noreferrer"
        >
          GitHub <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </nav>
      <span>Codex × TwitchCon Hackathon submission</span>
    </footer>
  );
}
