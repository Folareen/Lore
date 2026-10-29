import { z } from 'zod';
import { notFound } from 'next/navigation';
import { publicEntrySchema, publicFeedSchema } from '@lore/shared';
import { publicServerApi } from '../../../../../lib/public-server-api';
import {
  PublicReader,
  PublicShell,
} from '../../../../../features/publications/public-lore';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Community story' };
export default async function Page({
  params,
}: {
  params: Promise<{ channel: string; id: string }>;
}) {
  const { channel, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await publicServerApi(
    `${encodeURIComponent(channel)}/entries/${id}`,
    z.strictObject({
      channel: publicFeedSchema.shape.channel,
      entry: publicEntrySchema,
    }),
  );
  return (
    <PublicShell slug={data.channel.slug} name={data.channel.displayName}>
      <PublicReader key={id} initial={{ mode: 'entry', data }} />
    </PublicShell>
  );
}
