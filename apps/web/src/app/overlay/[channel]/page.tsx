import { OverlayDisplay } from '../../../features/overlay/overlay-display';
export const metadata = {
  title: 'OBS overlay',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function OverlayPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}) {
  const { channel } = await params;
  return <OverlayDisplay slug={channel} />;
}
