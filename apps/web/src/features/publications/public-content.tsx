'use client';
import { formatDate, formatDateTime } from '../../lib/date-time';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Search } from 'lucide-react';
import type { PublicFeed, PublicCatchup, PublicEntry } from '@lore/shared';
import { Brand } from '../../components/brand';
import { Avatar } from '../../components/avatar';
import { ThemeToggle } from '../../components/theme-control';
import { Select } from '../../components/select';
export const publicationLabels = {
  milestone: 'Milestone',
  reference: 'Inside reference',
  story: 'Ongoing story',
  commitment: 'Commitment update',
  summary: 'Catch-up summary',
} as const;
export type PublicView =
  | { mode: 'feed'; data: PublicFeed }
  | { mode: 'catchup'; data: PublicCatchup }
  | {
      mode: 'entry';
      data: { channel: PublicFeed['channel']; entry: PublicEntry };
    };
export function PublicShell({
  slug,
  name,
  children,
  feedHref = `/c/${slug}`,
  catchupHref = `/c/${slug}/catch-up`,
  preview,
}: {
  slug: string;
  name: string;
  children: React.ReactNode;
  feedHref?: string;
  catchupHref?: string;
  preview?: React.ReactNode;
}) {
  return (
    <div className="community-shell reader-shell">
      {preview && <div className="reader-preview">{preview}</div>}
      <header className="community-header reader-header">
        <Brand />
        <Link href={feedHref} prefetch={false} className="reader-channel">
          <Avatar name={name} size={32} />
          <strong>{name}</strong>
        </Link>
        <nav aria-label="Community pages">
          <Link href={feedHref} prefetch={false}>
            Stories
          </Link>
          <Link href={catchupHref} prefetch={false}>
            Catch up
          </Link>
          <ThemeToggle />
        </nav>
      </header>
      <main id="main-content">{children}</main>
      <footer className="community-footer reader-footer">
        <span>{name}’s community stories</span>
        <Link href="/">Made with Lore</Link>
      </footer>
    </div>
  );
}
export function CommunityContent({
  view,
  link,
  feedHref,
  catchupHref,
  query = '',
  busy = false,
  onMore,
  onSearch,
}: {
  view: PublicView;
  link: (id: string) => string;
  feedHref: string;
  catchupHref: string;
  query?: string;
  busy?: boolean;
  onMore?: () => void;
  onSearch?: React.FormEventHandler<HTMLFormElement>;
}) {
  if (view.mode === 'entry')
    return (
      <div className="reader-article-layout">
        <Link href={feedHref} className="reader-back" prefetch={false}>
          <ArrowLeft size={16} />
          All community stories
        </Link>
        <article className="reader-article">
          <header>
            <span className="reader-kind">
              {publicationLabels[view.data.entry.kind]}
            </span>
            <h1>{view.data.entry.title}</h1>
            <PublishedAt entry={view.data.entry} />
          </header>
          <p className="reader-prose">{view.data.entry.body}</p>
          <SourceLinks entry={view.data.entry} link={link} />
        </article>
        <aside className="reader-next">
          <BookOpen size={22} />
          <div>
            <h2>A little more context?</h2>
            <p>Get to know the stories behind the stream.</p>
          </div>
          <Link href={catchupHref} prefetch={false}>
            Read the catch-up <ArrowRight size={16} />
          </Link>
        </aside>
      </div>
    );
  const entries = view.mode === 'feed' ? view.data.items : view.data.recent;
  return (
    <div className="reader-content">
      <div className="reader-intro">
        <div>
          <h1>
            {view.mode === 'feed'
              ? 'Community stories'
              : `Catch up with ${view.data.channel.displayName}`}
          </h1>
          <p>
            {view.mode === 'feed'
              ? `The moments, plans and inside references from ${view.data.channel.displayName}’s community.`
              : 'Missed a stream? Here’s what to know before you jump into chat.'}
          </p>
        </div>
        {view.mode === 'feed' && (
          <Link href={catchupHref} className="button primary" prefetch={false}>
            New here? Catch up <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {view.mode === 'catchup' &&
        (view.data.summary ? (
          <article className="reader-recap">
            <div className="reader-recap-heading">
              <span className="reader-kind">Latest catch-up</span>
              <PublishedAt entry={view.data.summary} />
            </div>
            <h2>{view.data.summary.title}</h2>
            <p className="reader-prose">{view.data.summary.body}</p>
            <SourceLinks entry={view.data.summary} link={link} />
          </article>
        ) : (
          <div className="reader-empty">
            <BookOpen size={28} />
            <h2>No catch-up published yet</h2>
            <p>You can explore the community’s stories below.</p>
          </div>
        ))}
      {view.mode === 'feed' ? (
        <form className="reader-search" method="GET" onSubmit={onSearch}>
          <label className="field">
            <span className="sr-only">Search public Lore</span>
            <div className="reader-search-input">
              <Search size={18} />
              <input
                name="q"
                maxLength={100}
                defaultValue={new URLSearchParams(query).get('q') ?? ''}
                placeholder="Search stories and references…"
              />
            </div>
          </label>
          <label className="field">
            <span className="sr-only">Show</span>
            <Select
              name="kind"
              defaultValue={new URLSearchParams(query).get('kind') ?? ''}
            >
              <option value="">All updates</option>
              {Object.entries(publicationLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <button className="button secondary">Search</button>
        </form>
      ) : (
        <div className="reader-section-heading">
          <h2>More from the community</h2>
          <Link href={feedHref} prefetch={false}>
            All stories <ArrowRight size={16} />
          </Link>
        </div>
      )}
      {!entries.length && (
        <div className="reader-empty">
          <BookOpen size={28} />
          <h2>
            {view.mode === 'feed' ? 'No stories found' : 'You’re all caught up'}
          </h2>
          <p>
            {view.mode === 'feed'
              ? 'Try another search, or come back when the community shares something new.'
              : 'More community stories will appear here when they’re published.'}
          </p>
        </div>
      )}
      <div className="reader-grid">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} href={link(entry.id)} />
        ))}
      </div>
      {view.mode === 'feed' && view.data.nextCursor && (
        <button
          className="button secondary reader-more"
          disabled={busy}
          onClick={onMore}
        >
          {busy ? 'Loading…' : 'More community stories'}
        </button>
      )}
    </div>
  );
}
export function PublishedAt({ entry }: { entry: PublicEntry }) {
  return (
    <p className="reader-date">
      <time
        dateTime={entry.publishedAt}
        title={formatDateTime(entry.publishedAt)}
      >
        {formatDate(entry.publishedAt)}
      </time>
    </p>
  );
}
export function SourceLinks({
  entry,
  link,
}: {
  entry: PublicEntry;
  link: (id: string) => string;
}) {
  return entry.sources.length ? (
    <section className="reader-sources">
      <h3>More context</h3>
      <ul>
        {entry.sources.map((source) => (
          <li key={source.id}>
            <Link href={link(source.id)} prefetch={false}>
              {source.title}
              <ArrowRight size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
export function EntryCard({
  entry,
  href,
}: {
  entry: PublicEntry;
  href: string;
}) {
  return (
    <article className="reader-story">
      <div className="reader-story-meta">
        <span className="reader-kind">{publicationLabels[entry.kind]}</span>
        <PublishedAt entry={entry} />
      </div>
      <h2>
        <Link href={href} prefetch={false}>
          {entry.title}
        </Link>
      </h2>
      <p>{entry.body}</p>
      <Link href={href} prefetch={false} className="reader-story-link">
        Read story <ArrowRight size={16} />
        <span className="sr-only">: {entry.title}</span>
      </Link>
    </article>
  );
}
