'use client';
import { formatDate, formatDateTime } from '../../lib/date-time';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Search, Compass } from 'lucide-react';
import type { PublicFeed, PublicCatchup, PublicEntry } from '@lore/shared';
import { Brand } from '../../components/brand';
import { Avatar } from '../../components/avatar';
import { ThemeToggle } from '../../components/theme-control';
import { Select } from '../../components/select';
import { SectionTabs } from '../../components/section-tabs';
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
          <Link
            href="/discover"
            className="reader-discover-nav"
            aria-label="Discover communities"
            title="Discover communities"
          >
            <Compass size={18} aria-hidden="true" />
            <span>Discover</span>
          </Link>
          <Link href={feedHref} prefetch={false}>
            Community
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
  onTabChange,
}: {
  view: PublicView;
  link: (id: string) => string;
  feedHref: string;
  catchupHref: string;
  query?: string;
  busy?: boolean;
  onMore?: () => void;
  onTabChange?: (kind: string) => void;
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
  const featured =
    view.mode === 'feed' &&
    !new URLSearchParams(query).get('q') &&
    !new URLSearchParams(query).get('kind')
      ? entries.find((entry) => entry.kind === 'summary')
      : undefined;
  const sections = [
    {
      id: 'community-plans',
      title: 'Plans & promises',
      description:
        'What the community has shared about what comes next. Check the dates for context.',
      items: entries.filter((entry) => entry.kind === 'commitment'),
    },
    {
      id: 'community-references',
      title: 'Know the references',
      description:
        'The words, jokes and shared moments you might hear in chat.',
      items: entries.filter((entry) => entry.kind === 'reference'),
    },
    {
      id: 'community-stories',
      title: 'Stories you may have missed',
      description: 'A few moments to bring you into the conversation.',
      items: entries.filter(
        (entry) => entry.kind !== 'commitment' && entry.kind !== 'reference',
      ),
    },
  ];
  const kind = new URLSearchParams(query).get('kind') ?? '';
  const activeTab = kind === 'reference' || kind === 'commitment' ? kind : '';
  const communityTabs = [
    { value: '', label: 'Stories' },
    { value: 'reference', label: 'Inside references' },
    { value: 'commitment', label: 'Plans & promises' },
  ];
  const content = (
    <>
      {featured && (
        <aside className="reader-start">
          <div>
            <span className="reader-kind">
              New here? Start with the latest recap
            </span>
            <h2>
              <Link href={link(featured.id)} prefetch={false}>
                {featured.title}
              </Link>
            </h2>
            <p>{featured.body}</p>
            <PublishedAt entry={featured} />
          </div>
          <Link
            href={catchupHref}
            className="button secondary"
            prefetch={false}
          >
            Read the catch-up <ArrowRight size={16} />
          </Link>
        </aside>
      )}
      {view.mode === 'catchup' &&
        (view.data.summary ? (
          <article className="reader-recap" id="latest-catchup">
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
        <section id="community-feed" aria-label="Community stories">
          <h2 className="reader-feed-title">
            {activeTab === 'reference'
              ? 'Inside references'
              : activeTab === 'commitment'
                ? 'Plans & promises'
                : 'Community stories'}
          </h2>
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
                key={kind}
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
        </section>
      ) : null}
      {busy && <p role="status">Loading community stories…</p>}
      {!entries.length && !busy && (
        <div className="reader-empty">
          <BookOpen size={28} />
          <h2>
            {view.mode === 'feed'
              ? activeTab === 'reference'
                ? 'No references found'
                : activeTab === 'commitment'
                  ? 'No plans or promises found'
                  : 'No stories found'
              : 'You’re all caught up'}
          </h2>
          <p>
            {view.mode === 'feed'
              ? 'Try another search, or come back when the community shares something new.'
              : 'More community stories will appear here when they’re published.'}
          </p>
        </div>
      )}
      {view.mode === 'feed' ? (
        <div className="reader-grid">
          {entries
            .filter((entry) => entry.id !== featured?.id)
            .map((entry) => (
              <EntryCard key={entry.id} entry={entry} href={link(entry.id)} />
            ))}
        </div>
      ) : (
        sections
          .filter((section) => section.items.length)
          .map((section) => (
            <section
              className="reader-topic-section"
              id={section.id}
              key={section.id}
            >
              <div className="reader-section-heading">
                <div>
                  <h2>{section.title}</h2>
                  <p>{section.description}</p>
                </div>
              </div>
              <div className="reader-grid">
                {section.items.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    href={link(entry.id)}
                  />
                ))}
              </div>
            </section>
          ))
      )}
      {view.mode === 'catchup' && (
        <div className="reader-browse-all">
          <Link href={feedHref} className="button secondary" prefetch={false}>
            Explore all community stories <ArrowRight size={16} />
          </Link>
        </div>
      )}
      {view.mode === 'feed' && view.data.nextCursor && (
        <button
          className="button secondary reader-more"
          disabled={busy}
          onClick={onMore}
        >
          {busy ? 'Loading…' : 'More community stories'}
        </button>
      )}
    </>
  );
  return (
    <div className="reader-content">
      <div
        className={`reader-intro${view.mode === 'feed' ? ' reader-community-hero' : ''}`}
      >
        <div>
          {view.mode === 'feed' && (
            <div className="reader-community-identity">
              <Avatar name={view.data.channel.displayName} size={72} />
              <span>Welcome to the community</span>
            </div>
          )}
          <h1>
            {view.mode === 'feed'
              ? view.data.channel.displayName
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
            Get caught up <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {view.mode === 'catchup' && (
        <nav className="reader-jump-links" aria-label="In this catch-up">
          {view.data.summary && <a href="#latest-catchup">Latest recap</a>}
          {sections
            .filter((section) => section.items.length)
            .map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
        </nav>
      )}
      {view.mode === 'feed' ? (
        <div className="reader-community-tabs">
          <SectionTabs
            label="Explore this community"
            value={activeTab}
            onValueChange={(kind) => onTabChange?.(kind)}
            tabs={communityTabs.map((tab) => ({
              ...tab,
              content: tab.value === activeTab ? content : null,
            }))}
          />
        </div>
      ) : (
        content
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
