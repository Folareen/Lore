import Link from 'next/link';
import type { Metadata } from 'next';
import { discoverPageSchema, discoverQuerySchema } from '@lore/shared';
import { publicServerApi } from '../../lib/public-server-api';
import { DiscoverResults } from '../../features/discover/discover-results';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Discover communities',
  description:
    'Find channels on Lore. Explore their stories, get to know the references and catch up before you join the conversation.',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const query = discoverQuerySchema.safeParse(await searchParams);
  if (!query.success)
    return (
      <main id="main-content" className="discover-page">
        <h1>Find your next community.</h1>
        <p>Search using up to 100 characters.</p>
        <Link className="button secondary" href="/discover">
          Start a new search
        </Link>
      </main>
    );
  const args = new URLSearchParams();
  if (query.data.q) args.set('q', query.data.q);
  if (query.data.cursor) args.set('cursor', query.data.cursor);
  const data = await publicServerApi(`?${args}`, discoverPageSchema);
  return (
    <DiscoverResults
      page={data}
      query={query.data.q}
      hasPrevious={Boolean(query.data.cursor)}
    />
  );
}
