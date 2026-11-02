'use client';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import type { PublicEntry } from '@lore/shared';
export function StoryScreenshot({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p className="muted">
      Screenshot unavailable. The story is still available below.
    </p>
  ) : (
    <img
      className="story-screenshot"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function StoryMedia({
  entry,
  imageHref,
  preview = false,
}: {
  entry: Pick<PublicEntry, 'clipId' | 'screenshot' | 'title'>;
  imageHref?: string;
  preview?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false),
    [play, setPlay] = useState(false),
    [host, setHost] = useState('');
  useEffect(() => {
    if (!root.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([size]) =>
      setWide(size.contentRect.width >= 440),
    );
    observer.observe(root.current);
    setHost(window.location.hostname);
    return () => observer.disconnect();
  }, []);
  if (!entry.clipId && !entry.screenshot) return null;
  const clipUrl = entry.clipId
    ? `https://clips.twitch.tv/${entry.clipId}`
    : null;
  const embed = new URLSearchParams({
    clip: entry.clipId ?? '',
    parent: host,
    autoplay: 'false',
  });
  return (
    <div className="story-media" ref={root}>
      {entry.screenshot && imageHref && (
        <figure>
          <StoryScreenshot
            key={entry.screenshot.id}
            src={imageHref}
            alt={entry.screenshot.alt}
          />
          <figcaption>{entry.screenshot.alt}</figcaption>
        </figure>
      )}
      {clipUrl && (
        <section className="story-clip" aria-label="Attached Twitch clip">
          <div className="story-clip-heading">
            <strong>
              <Play size={18} aria-hidden="true" /> Watch the moment
            </strong>
            <a href={clipUrl} target="_blank" rel="noopener noreferrer">
              Open on Twitch <ExternalLink size={15} />
            </a>
          </div>
          {!preview &&
            wide &&
            host &&
            (play ? (
              <iframe
                title={`Twitch clip: ${entry.title}`}
                src={`https://clips.twitch.tv/embed?${embed}`}
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <button
                type="button"
                className="button secondary"
                onClick={() => setPlay(true)}
              >
                <Play size={18} /> Load Twitch clip
              </button>
            ))}
          {!preview && (
            <p className="muted">
              {wide
                ? 'Playback is hosted by Twitch. If the clip is unavailable, you can keep reading the story.'
                : 'Open the clip on Twitch to watch on a smaller screen.'}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
