import { PublicGuide } from '../../../features/help/public-guide';
export const metadata = { title: 'Viewers guide' };
export default function GuidePage() {
  return <PublicGuide audience="viewers" />;
}
