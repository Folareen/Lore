import { PublicGuide } from '../../../features/help/public-guide';
export const metadata = { title: 'Moderators guide' };
export default function GuidePage() {
  return <PublicGuide audience="moderators" />;
}
