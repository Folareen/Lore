import { publicCatchupSchema } from '@lore/shared';
import { publicServerApi } from '../../../../lib/public-server-api';
import {
  PublicReader,
  PublicShell,
} from '../../../../features/publications/public-lore';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Newcomer catch-up' };
export default async function Page({
  params,
}: {
  params: Promise<{ channel: string }>;
}) {
  const { channel } = await params;
  const data = await publicServerApi(
    `${encodeURIComponent(channel)}/catch-up`,
    publicCatchupSchema,
  );
  return (
    <PublicShell slug={data.channel.slug} name={data.channel.displayName}>
      <PublicReader initial={{ mode: 'catchup', data }} />
    </PublicShell>
  );
}
