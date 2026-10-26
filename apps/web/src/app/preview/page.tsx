import { z } from 'zod';
import { AppShell } from '../../features/workspace/app-shell';
import { Overview } from '../../features/workspace/overview';
import { ChannelSettings } from '../../features/workspace/settings';
import { Team } from '../../features/workspace/team';
import { Account } from '../../features/workspace/account';
import { previewChannels, previewSession } from '../../lib/preview-data';
export const metadata = {
  title: 'Workspace preview',
  robots: { index: false, follow: false },
};
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const current = z
    .enum(['overview', 'settings', 'team', 'account'])
    .catch('overview')
    .parse(view);
  const Screen = {
    overview: Overview,
    settings: ChannelSettings,
    team: Team,
    account: Account,
  }[current];
  return (
    <AppShell
      session={previewSession}
      channels={previewChannels}
      preview
      view={current}
    >
      <Screen />
    </AppShell>
  );
}
