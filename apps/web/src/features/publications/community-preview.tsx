'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePublications } from './publications-context';
import { useWorkspace } from '../workspace/workspace-context';
import { SourceLinks, PublishedAt, publicationLabels } from './public-lore';
export function CommunityPreview() {
  const { selected, href } = useWorkspace(),
    api = usePublications();
  const [catchup, setCatchup] = useState(true),
    [focus, setFocus] = useState<string | null>(null);
  if (!selected) return <p>Choose a fixture channel.</p>;
  const feed = api.publicFeed(selected.id),
    recap = api.publicCatchup(selected.id);
  const link = (id: string) => `#public-preview-${id}`;
  return (
    <div className="content-stack">
      <p className="notice">
        Public visitor preview · Only fixture entries that passed publication
        review appear here.
      </p>
      <div className="button-row">
        <Link className="button secondary" href={href('publications')}>
          Back to publishing
        </Link>
        <button
          className="button secondary"
          onClick={() => {
            setCatchup(!catchup);
            setFocus(null);
          }}
        >
          {catchup ? 'Browse public feed' : 'Newcomer catch-up'}
        </button>
      </div>
      <h1>
        {catchup
          ? 'You can join the story from here.'
          : `${feed.channel.displayName} · Community Lore`}
      </h1>
      {catchup && recap.summary && (
        <article className="panel community-recap content-stack">
          <h2>{recap.summary.title}</h2>
          <p className="case-prose">{recap.summary.body}</p>
          <SourceLinks entry={recap.summary} link={link} />
        </article>
      )}
      {catchup && !recap.summary && (
        <p className="notice">No catch-up summary published yet.</p>
      )}
      {feed.items
        .filter((e) => !catchup || e.kind !== 'summary')
        .map((e) => (
          <article
            className="panel content-stack"
            id={`public-preview-${e.id}`}
            key={e.id}
          >
            <p className="eyebrow">{publicationLabels[e.kind]}</p>
            <h2>{e.title}</h2>
            <p className="case-prose">{e.body}</p>
            <PublishedAt entry={e} />
            <button
              className="button secondary"
              onClick={() => setFocus(focus === e.id ? null : e.id)}
            >
              More context
            </button>
            {focus === e.id && <SourceLinks entry={e} link={link} />}
          </article>
        ))}
      {!feed.items.length && (
        <p className="notice">No published community entries.</p>
      )}
    </div>
  );
}
