import type { Channel, Membership, Session } from '../management';
export const previewSession: Session & { csrfToken: 'preview-only' } = {
  user: {
    id: '00000000-0000-4000-8000-000000000100',
    twitchUserId: '100',
    login: 'cozybyte',
    displayName: 'cozybyte',
  },
  csrfToken: 'preview-only',
};
export const previewChannels: Channel[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'twitch-100',
    displayName: 'cozybyte',
    twitchChannelId: '100',
    role: 'owner',
    chatRetentionDays: 7,
    connected: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    slug: 'twitch-400',
    displayName: 'thelatecafe',
    twitchChannelId: '400',
    role: 'moderator',
    chatRetentionDays: 3,
    connected: true,
  },
];
export const previewPeople: Membership[] = [
  {
    userId: '00000000-0000-4000-8000-000000000200',
    twitchUserId: '200',
    login: 'moss.jpeg',
    displayName: 'moss.jpeg',
    role: 'moderator',
    verificationState: 'owner_approved',
  },
  {
    userId: '00000000-0000-4000-8000-000000000300',
    twitchUserId: '300',
    login: 'pixel_pilot',
    displayName: 'pixel_pilot',
    role: 'team',
    verificationState: 'owner_approved',
  },
];
