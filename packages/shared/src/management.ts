import { z } from 'zod';
export const teamRoleSchema = z.enum(['moderator', 'team']);
export const channelRoleSchema = z.enum(['owner', 'moderator', 'team']);
export type ChannelRole = z.infer<typeof channelRoleSchema>;
export const updateChannelSchema = z.strictObject({
  chatRetentionDays: z.number().int().min(1).max(7),
});
export const grantMembershipSchema = z.strictObject({
  twitchUserId: z.string().regex(/^\d+$/).max(30),
  role: teamRoleSchema,
});
export type UpdateChannel = z.infer<typeof updateChannelSchema>;
export type GrantMembership = z.infer<typeof grantMembershipSchema>;
export const sessionResponseSchema = z.strictObject({
  user: z.strictObject({
    id: z.uuid(),
    twitchUserId: z.string(),
    login: z.string(),
    displayName: z.string(),
  }),
  csrfToken: z.string(),
});
export const channelResponseSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  displayName: z.string(),
  twitchChannelId: z.string().nullable(),
  role: channelRoleSchema,
  chatRetentionDays: z.number().int(),
  connected: z.boolean(),
});

export const authStatusSchema = z.strictObject({
  twitchConfigured: z.boolean(),
});
export const membershipResponseSchema = z.strictObject({
  userId: z.uuid(),
  twitchUserId: z.string(),
  login: z.string(),
  displayName: z.string(),
  role: teamRoleSchema,
  verificationState: z.literal('owner_approved'),
});
export const membershipGrantResponseSchema = z.strictObject({
  userId: z.uuid(),
  role: teamRoleSchema,
  verificationState: z.literal('owner_approved'),
});
export type Session = z.infer<typeof sessionResponseSchema>;
export type Channel = z.infer<typeof channelResponseSchema>;
export type Membership = z.infer<typeof membershipResponseSchema>;
