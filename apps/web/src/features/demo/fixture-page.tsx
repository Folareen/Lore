import { DemoDiscover } from './demo-discover';
import { HelpScreen } from '../help/help-screen';
import { DemoHome } from './demo-home';
import { DemoChat } from '../demo/demo-chat';
import { OverlayScreen } from '../overlay/overlay-settings';
import { PublicationsScreen } from '../publications/publications';
import { CommunityPreview } from '../publications/community-preview';
import { z } from 'zod';
import { ModerationScreen } from '../cases/moderation';
import { ModeratorDeskScreen } from '../moderation/moderator-desk';
import { CaseDetailScreen } from '../cases/case-detail';
import { CandidatesScreen } from '../candidates/candidates';
import { Overview } from '../workspace/overview';
import { ChannelSettings } from '../workspace/settings';
import { Team } from '../workspace/team';
import { Account } from '../workspace/account';
import { OpenLoopsScreen } from '../open-loops/open-loops';
import { StreamBriefScreen } from '../open-loops/stream-brief';
export default async function FixturePage({
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
      'discover',
      'help',
      'guide',
      'chat',
      'overview',
      'streamer',
      'brief',
      'candidates',
      'moderation',
      'workflows',
      'overlay',
      'publications',
      'community',
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
    discover: DemoDiscover,
    help: HelpScreen,
    guide: DemoHome,
    chat: DemoChat,
    overview: Overview,
    settings: ChannelSettings,
    team: Team,
    account: Account,
    streamer: OpenLoopsScreen,
    brief: StreamBriefScreen,
    candidates: CandidatesScreen,
    moderation: ModerationScreen,
    workflows: ModeratorDeskScreen,
    overlay: OverlayScreen,
    publications: PublicationsScreen,
    community: CommunityPreview,
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
