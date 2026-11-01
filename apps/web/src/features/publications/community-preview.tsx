'use client';
import { CommunityAssistant } from './community-assistant';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePublications } from './publications-context';
import { useWorkspace } from '../workspace/workspace-context';
import {
  CommunityContent,
  PublicShell,
  type PublicView,
} from './public-content';
export function CommunityPreview() {
  const { selected, href } = useWorkspace();
  const api = usePublications();
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  if (!selected) return <p>Choose a fixture channel.</p>;
  const feed = api.publicFeed(selected.id);
  const recap = api.publicCatchup(selected.id);
  const base = href('community');
  const feedHref = `${base}&public=feed`;
  const catchupHref = `${base}&public=catchup`;
  const link = (id: string) => `${base}&entry=${encodeURIComponent(id)}`;
  const entry = feed.items.find((item) => item.id === params.get('entry'));
  const filters = new URLSearchParams(query);
  const view: PublicView = entry
    ? { mode: 'entry', data: { channel: feed.channel, entry } }
    : params.get('public') === 'feed'
      ? {
          mode: 'feed',
          data: {
            ...feed,
            items: feed.items.filter(
              (item) =>
                (!filters.get('kind') || item.kind === filters.get('kind')) &&
                `${item.title} ${item.body}`
                  .toLowerCase()
                  .includes((filters.get('q') || '').toLowerCase()),
            ),
          },
        }
      : { mode: 'catchup', data: recap };
  return (
    <PublicShell
      slug={feed.channel.slug}
      name={feed.channel.displayName}
      feedHref={feedHref}
      catchupHref={catchupHref}
      preview={
        <>
          <span>
            <strong>Visitor preview</strong> · Sample community, published
            stories only
          </span>
          <Link href={href('publications')}>Back to publishing</Link>
        </>
      }
    >
      <CommunityContent
        view={view}
        link={link}
        feedHref={feedHref}
        catchupHref={catchupHref}
        query={query}
        onSearch={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setQuery(
            new URLSearchParams({
              q: String(data.get('q') || ''),
              kind: String(data.get('kind') || ''),
            }).toString(),
          );
        }}
      />
      <CommunityAssistant
        key={JSON.stringify(feed.items)}
        slug={feed.channel.slug}
        name={feed.channel.displayName}
        demoSources={feed.items}
      />
    </PublicShell>
  );
}
