'use client';
import { useEffect, useState } from 'react';
import { overlayDisplaySchema, type OverlayDisplay } from '@lore/shared';
export function OverlayCard({ data }: { data: OverlayDisplay }) {
  if (!data.items.length) return null;
  return (
    <section className="obs-card" aria-label="Community overlay">
      <header>
        <span className="obs-wordmark">
          lore<span aria-hidden="true">.</span>
        </span>
        <span>{data.channel}</span>
      </header>
      <p className="obs-kicker">
        {data.mode === 'recap' ? 'Previously on…' : 'Still on the list'}
      </p>
      <ol>
        {data.items.map((item) => (
          <li key={item.id}>
            <h2>{item.title}</h2>
            {item.text && <p>{item.text}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
export function OverlayDisplay({ slug }: { slug: string }) {
  const [data, setData] = useState<OverlayDisplay | null>(null);
  useEffect(() => {
    let sequence = 0,
      stopped = false;
    let controller: AbortController | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      const current = ++sequence;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const timeout = setTimeout(
        () => controller?.signal === signal && controller.abort(),
        4000,
      );
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        'token',
      );
      if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        setData(null);
        clearTimeout(timeout);
        return;
      }
      try {
        const response = await fetch(
          `/api/overlay/${encodeURIComponent(slug)}`,
          {
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            headers: { Authorization: `Bearer ${token}` },
            signal,
          },
        );
        if (!response.ok) throw new Error('Overlay unavailable');
        const next = overlayDisplaySchema.parse(await response.json());
        if (!stopped && current === sequence && !signal.aborted) {
          setData(next);
          clearTimeout(expiry);
          expiry = setTimeout(() => setData(null), 6500);
        }
      } catch {
        if (!stopped && current === sequence) setData(null);
      } finally {
        clearTimeout(timeout);
      }
    }
    const offline = () => {
      sequence++;
      controller?.abort();
      setData(null);
    };
    const visibility = () => {
      if (document.hidden) offline();
      else void refresh();
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    window.addEventListener('offline', offline);
    window.addEventListener('online', refresh);
    window.addEventListener('hashchange', refresh);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped = true;
      sequence++;
      controller?.abort();
      clearInterval(timer);
      clearTimeout(expiry);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', refresh);
      window.removeEventListener('hashchange', refresh);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [slug]);
  return (
    <main id="main-content" className="obs-root">
      {data && <OverlayCard data={data} />}
    </main>
  );
}
