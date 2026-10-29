import { publicFeedSchema } from '@lore/shared';
import { publicServerApi } from '../../../lib/public-server-api';
import {
  PublicReader,
  PublicShell,
} from '../../../features/publications/public-lore';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Community Lore' };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const { channel } = await params,
    query = await searchParams;
  const args = new URLSearchParams();
  if (query.q) args.set('q', query.q);
  if (query.kind) args.set('kind', query.kind);
  const data = await publicServerApi(
    `${encodeURIComponent(channel)}?${args}`,
    publicFeedSchema,
  );
  return (
    <PublicShell slug={data.channel.slug} name={data.channel.displayName}>
      <PublicReader
        key={`${channel}-${args}`}
        initial={{ mode: 'feed', data }}
        query={args.toString()}
      />
    </PublicShell>
  );
}
