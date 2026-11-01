import { z } from 'zod';
import { OpenLoopsScreen } from '../../../features/open-loops/open-loops';
export const metadata = { title: 'Promises · Lore' };
export default async function StreamerPage({
  searchParams,
}: {
  searchParams: Promise<{ loop?: string }>;
}) {
  const { loop } = await searchParams;
  const parsed = z.uuid().safeParse(loop);
  return <OpenLoopsScreen focusId={parsed.success ? parsed.data : undefined} />;
}
