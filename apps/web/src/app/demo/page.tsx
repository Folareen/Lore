import FixturePage from '../../features/demo/fixture-page';
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    loop?: string;
    case?: string;
    channel?: string;
  }>;
}) {
  const params = await searchParams;
  return <FixturePage searchParams={Promise.resolve(params)} />;
}
