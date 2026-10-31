'use client';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { useRef } from 'react';
export function MarketingMenu() {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  function close() {
    if (details.current) details.current.open = false;
    summary.current?.focus();
  }
  return (
    <details
      ref={details}
      className="marketing-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <summary ref={summary} aria-label="Explore Lore">
        <Menu size={21} aria-hidden="true" />
      </summary>
      <nav aria-label="Mobile site navigation">
        <Link href="/how-it-works" onClick={close}>
          How it works
        </Link>
        <Link href="/#your-crew" onClick={close}>
          For your crew
        </Link>
        <Link href="/#questions" onClick={close}>
          Questions
        </Link>
        <Link href="/login" onClick={close}>
          Sign in with Twitch
        </Link>
        <Link
          href="/demo"
          className="button primary menu-demo-link"
          onClick={close}
        >
          Try the demo
        </Link>
      </nav>
    </details>
  );
}
