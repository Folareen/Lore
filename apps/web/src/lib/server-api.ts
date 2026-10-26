import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
export async function serverApi<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const token = (await cookies()).get('lore_session')?.value;
  if (!token) redirect('/login');
  const response = await fetch(
    `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api${path}`,
    {
      headers: { Cookie: `lore_session=${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    },
  );
  if (response.status === 401) redirect('/login?expired=1');
  if (!response.ok)
    throw new Error('Your workspace could not be loaded. Please try again.');
  return schema.parse(await response.json());
}
