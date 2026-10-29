import 'server-only';
import { notFound } from 'next/navigation';
import { z } from 'zod';
export async function publicServerApi<T>(path: string, schema: z.ZodType<T>) {
  const response = await fetch(
    `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/public/channels/${path}`,
    { cache: 'no-store', signal: AbortSignal.timeout(8000) },
  );
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Public community page is unavailable.');
  return schema.parse(await response.json());
}
