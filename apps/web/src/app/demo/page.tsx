import FixturePage from '../../features/demo/fixture-page';
import { DemoHome } from '../../features/demo/demo-home';
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
  return params.view ? (
    <FixturePage searchParams={Promise.resolve(params)} />
  ) : (
    <DemoHome />
  );
}
