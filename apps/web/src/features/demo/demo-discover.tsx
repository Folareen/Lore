'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { discoverPageSchema } from '@lore/shared';
import { Brand } from '../../components/brand';
import { ThemeToggle } from '../../components/theme-control';
import { DiscoverResults } from '../discover/discover-results';
import { useWorkspace } from '../workspace/workspace-context';
import { usePublications } from '../publications/publications-context';
export function DemoDiscover() {
  const { channels, href } = useWorkspace();
  const publications = usePublications();
  const router = useRouter();
  const query = (useSearchParams().get('q') ?? '').slice(0, 100);
  const term = query.trim().replace(/^@/, '').toLowerCase();
  const page = discoverPageSchema.parse({
    items: channels
      .filter(
        (channel) =>
          channel.connected &&
          `${channel.displayName} ${channel.slug}`.toLowerCase().includes(term),
      )
      .flatMap((channel) => {
        const feed = publications.publicFeed(channel.id);
        const latest = [...feed.items].sort((a, b) =>
          b.publishedAt.localeCompare(a.publishedAt),
        )[0];
        return latest
          ? [
              {
                slug: channel.slug,
                displayName: channel.displayName,
                storyCount: feed.items.length,
                latest: {
                  id: latest.id,
                  title: latest.title,
                  excerpt: latest.body.slice(0, 480),
                  kind: latest.kind,
                  publishedAt: latest.publishedAt,
                },
              },
            ]
          : [];
      }),
    nextCursor: null,
  });
  return (
    <div className="community-shell reader-shell discover-shell demo-directory">
      <div className="reader-preview">
        <span>
          <strong>Demo fixture</strong> · Search the sample community; no live
          channel lookup
        </span>
        <Link href={href('guide')}>Back to demo guide</Link>
      </div>
      <header className="community-header reader-header">
        <Brand />
        <nav aria-label="Demo directory">
          <Link href={href('community')}>Sample community</Link>
          <ThemeToggle />
        </nav>
      </header>
      <DiscoverResults
        page={page}
        query={query}
        hasPrevious={false}
        navigation={{
          rootHref: href('discover'),
          communityHref: () => `${href('community')}&public=feed`,
          catchupHref: () => href('community'),
          onSearch: (event) => {
            event.preventDefault();
            const value = String(
              new FormData(event.currentTarget).get('q') ?? '',
            )
              .trim()
              .slice(0, 100);
            router.push(
              `${href('discover')}${value ? `&q=${encodeURIComponent(value)}` : ''}`,
            );
          },
        }}
      />
    </div>
  );
}
