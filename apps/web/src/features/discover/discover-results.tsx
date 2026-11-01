import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import type { DiscoverPage } from '@lore/shared';
import { Avatar } from '../../components/avatar';
import { formatDate } from '../../lib/date-time';
export function DiscoverResults({
  page,
  query,
  hasPrevious,
}: {
  page: DiscoverPage;
  query: string;
  hasPrevious: boolean;
}) {
  const search = new URLSearchParams();
  if (query) search.set('q', query);
  const firstHref = `/discover${search.size ? `?${search}` : ''}`;
  if (page.nextCursor) search.set('cursor', page.nextCursor);
  return (
    <main id="main-content" className="discover-page">
      <header className="discover-intro">
        <h1>Find your next community.</h1>
        <p>
          Meet the channels on Lore. Get the stories, learn the references and
          jump into the conversation.
        </p>
      </header>
      <form
        className="discover-search"
        method="GET"
        action="/discover"
        role="search"
        aria-label="Find a community"
      >
        <label className="field">
          <span>Search channels</span>
          <span className="discover-search-input">
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              name="q"
              placeholder="A channel you know, or one you’re curious about…"
              defaultValue={query}
              maxLength={100}
            />
          </span>
        </label>
        <button className="button primary" type="submit">
          Search
        </button>
      </form>
      <div className="discover-results-heading">
        <h2>{query ? `Results for “${query}”` : 'Explore communities'}</h2>
        {query && <Link href="/discover">Clear search</Link>}
      </div>
      {!page.items.length ? (
        <div className="discover-empty">
          <Search size={28} aria-hidden="true" />
          <h3>{query ? 'No community found yet' : 'The stories start here'}</h3>
          <p>
            {query
              ? 'Try another channel name. Channels appear here once they’ve connected to Lore and published something to share.'
              : 'As channels connect to Lore and publish their first stories, you’ll find them here.'}
          </p>
          {query ? (
            <Link className="button secondary" href="/discover">
              Browse all communities
            </Link>
          ) : (
            <Link className="button secondary" href="/demo?view=community">
              Explore a sample community
            </Link>
          )}
        </div>
      ) : (
        <div className="discover-grid">
          {page.items.map((channel) => {
            const href = `/c/${encodeURIComponent(channel.slug)}`;
            return (
              <article
                className="discover-card"
                key={channel.slug}
                aria-label={channel.displayName}
              >
                <header>
                  <Avatar name={channel.displayName} size={48} />
                  <div>
                    <h3>
                      <Link href={href} prefetch={false}>
                        {channel.displayName}
                      </Link>
                    </h3>
                    <p>
                      {channel.storyCount} public{' '}
                      {channel.storyCount === 1 ? 'story' : 'stories'}
                    </p>
                  </div>
                </header>
                <div className="discover-preview">
                  <p className="discover-preview-label">
                    Latest from the community{' '}
                    <time dateTime={channel.latest.publishedAt}>
                      {formatDate(channel.latest.publishedAt)}
                    </time>
                  </p>
                  <h4>{channel.latest.title}</h4>
                  <p>{channel.latest.excerpt}</p>
                </div>
                <nav aria-label={`${channel.displayName} community`}>
                  <Link href={href} prefetch={false}>
                    Explore community{' '}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link href={`${href}/catch-up`} prefetch={false}>
                    Catch up
                  </Link>
                </nav>
              </article>
            );
          })}
        </div>
      )}
      {(hasPrevious || page.nextCursor) && (
        <nav
          className="discover-pagination"
          aria-label="Community results pages"
        >
          {hasPrevious && (
            <Link
              className="button secondary"
              href={firstHref}
              prefetch={false}
            >
              Back to first page
            </Link>
          )}
          {page.nextCursor && (
            <Link
              className="button secondary"
              href={`/discover?${search}`}
              prefetch={false}
            >
              More communities <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </nav>
      )}
      <aside className="discover-owner-note">
        <p>Want to welcome viewers to your own community?</p>
        <Link href="/login">
          Connect your channel <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </aside>
    </main>
  );
}
