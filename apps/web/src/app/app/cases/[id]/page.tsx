import { z } from 'zod';
import { notFound } from 'next/navigation';
import { CaseDetailScreen } from '../../../../features/cases/case-detail';
export const metadata = { title: 'Private case file' };
export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const channel = z.uuid().safeParse((await searchParams).channel);
  return (
    <CaseDetailScreen
      id={parsed.data}
      channelId={channel.success ? channel.data : undefined}
    />
  );
}
