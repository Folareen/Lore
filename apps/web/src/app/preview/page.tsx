import { z } from 'zod';
import { ModerationScreen } from '../../features/cases/moderation';
import { ModeratorDeskScreen } from '../../features/moderation/moderator-desk';
import { CaseDetailScreen } from '../../features/cases/case-detail';
import { CandidatesScreen } from '../../features/candidates/candidates';
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
  searchParams: Promise<{
    view?: string;
    loop?: string;
    case?: string;
    channel?: string;
  }>;
}) {
  const { view, loop, case: caseId, channel } = await searchParams;
  const focused = z.uuid().safeParse(loop);
  const current = z
    .enum([
      'overview',
      'streamer',
      'brief',
      'candidates',
      'moderation',
      'workflows',
      'case',
      'settings',
      'team',
      'account',
    ])
    .catch('overview')
    .parse(view);
  if (current === 'case') {
    const parsed = z.uuid().safeParse(caseId);
    const scoped = z.uuid().safeParse(channel);
    return parsed.success ? (
      <CaseDetailScreen
        id={parsed.data}
        channelId={scoped.success ? scoped.data : undefined}
      />
    ) : (
      <p>Case unavailable.</p>
    );
  }
  const Screen = {
    overview: Overview,
    settings: ChannelSettings,
    team: Team,
    account: Account,
    streamer: OpenLoopsScreen,
    brief: StreamBriefScreen,
    candidates: CandidatesScreen,
    moderation: ModerationScreen,
    workflows: ModeratorDeskScreen,
    case: ModerationScreen,
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
