import { demoDatasetSchema, demoSeed } from '@lore/shared';
import { DemoPlayground } from '../../features/demo/demo-context';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Try Lore · Demo fixture',
  robots: { index: false, follow: false },
};
export default async function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await fetch(
    `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/demo`,
    { cache: 'no-store', signal: AbortSignal.timeout(8000) },
  )
    .then(async (response) =>
      response.ok ? demoDatasetSchema.parse(await response.json()) : null,
    )
    .catch(() => null);
  return <DemoPlayground data={data ?? demoSeed}>{children}</DemoPlayground>;
}
