import { z } from 'zod';
import { Overview } from '../../features/workspace/overview';
import { ChannelSettings } from '../../features/workspace/settings';
import { Team } from '../../features/workspace/team';
import { Account } from '../../features/workspace/account';
import { OpenLoopsScreen } from '../../features/open-loops/open-loops';
import { StreamBriefScreen } from '../../features/open-loops/stream-brief';
export const metadata = {
  title: 'Workspace preview',
  robots: { index: false, follow: false },
};
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; loop?: string }>;
}) {
  const { view, loop } = await searchParams;
  const focused = z.uuid().safeParse(loop);
  const current = z
    .enum(['overview', 'streamer', 'brief', 'settings', 'team', 'account'])
    .catch('overview')
    .parse(view);
  const Screen = {
    overview: Overview,
    settings: ChannelSettings,
    team: Team,
    account: Account,
    streamer: OpenLoopsScreen,
    brief: StreamBriefScreen,
  }[current];
  return (
    <>
      {current === 'streamer' ? (
        <OpenLoopsScreen focusId={focused.success ? focused.data : undefined} />
      ) : (
        <Screen />
      )}
    </>
  );
}
