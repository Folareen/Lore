import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { ChannelRole, GrantMembership, UpdateChannel } from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
import { auditEvents, channels, memberships, users } from '../database/schema';
type Transaction = Parameters<
  Parameters<InfrastructureService['db']['transaction']>[0]
>[0];
const connected = and(
  isNotNull(channels.connectedAt),
  isNull(channels.disconnectedAt),
);
@Injectable()
export class ChannelsRepository {
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}
  private access(userId: string) {
    return or(
      eq(channels.ownerUserId, userId),
      and(
        connected,
        sql`exists (select 1 from ${memberships} where ${memberships.channelId} = ${channels.id} and ${memberships.userId} = ${userId})`,
      ),
    );
  }
  private response(
    channel: typeof channels.$inferSelect,
    userId: string,
    role: ChannelRole,
  ) {
    return {
      id: channel.id,
      slug: channel.slug,
      displayName: channel.displayName,
      twitchChannelId: channel.twitchChannelId,
      chatRetentionDays: channel.chatRetentionDays,
      connected: Boolean(channel.connectedAt && !channel.disconnectedAt),
      role: channel.ownerUserId === userId ? ('owner' as const) : role,
    };
  }
  async list(userId: string) {
    const records = await this.infrastructure.db
      .select({ channel: channels, role: memberships.role })
      .from(channels)
      .leftJoin(
        memberships,
        and(
          eq(memberships.channelId, channels.id),
          eq(memberships.userId, userId),
        ),
      )
      .where(this.access(userId))
      .orderBy(channels.createdAt);
    return records.map(({ channel, role }) =>
      this.response(channel, userId, role || 'owner'),
    );
  }
  async get(channelId: string, userId: string) {
    const [record] = await this.infrastructure.db
      .select({ channel: channels, role: memberships.role })
      .from(channels)
      .leftJoin(
        memberships,
        and(
          eq(memberships.channelId, channels.id),
          eq(memberships.userId, userId),
        ),
      )
      .where(and(eq(channels.id, channelId), this.access(userId)));
    if (!record) throw new NotFoundException('Channel not found');
    return this.response(record.channel, userId, record.role || 'owner');
  }
  async connect(userId: string) {
    return this.infrastructure.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      // IDs and display metadata come from the authenticated Twitch identity, never the request body.
      const [channel] = await tx
        .insert(channels)
        .values({
          slug: `twitch-${user.twitchUserId}`,
          twitchChannelId: user.twitchUserId,
          ownerUserId: user.id,
          displayName: user.displayName,
          origin: 'live_twitch',
          connectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: channels.twitchChannelId,
          set: {
            displayName: user.displayName,
            connectedAt: new Date(),
            disconnectedAt: null,
            updatedAt: new Date(),
          },
          setWhere: eq(channels.ownerUserId, userId),
        })
        .returning();
      if (!channel)
        throw new ConflictException(
          'Channel is already owned by another account',
        );
      await this.audit(tx, channel.id, userId, 'channel.connected', channel.id);
      return this.response(channel, userId, 'owner');
    });
  }
  private async withOwner<T>(
    channelId: string,
    userId: string,
    operation: (
      tx: Transaction,
      channel: typeof channels.$inferSelect,
    ) => Promise<T>,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      const [channel] = await tx
        .select()
        .from(channels)
        .where(
          and(eq(channels.id, channelId), eq(channels.ownerUserId, userId)),
        )
        .for('update');
      if (!channel) throw new NotFoundException('Channel not found');
      return operation(tx, channel);
    });
  }
  async update(channelId: string, userId: string, input: UpdateChannel) {
    return this.withOwner(channelId, userId, async (tx) => {
      const [channel] = await tx
        .update(channels)
        .set({
          chatRetentionDays: input.chatRetentionDays,
          updatedAt: new Date(),
        })
        .where(eq(channels.id, channelId))
        .returning();
      await this.audit(
        tx,
        channelId,
        userId,
        'channel.settings_updated',
        channelId,
        { chatRetentionDays: input.chatRetentionDays },
      );
      return this.response(channel, userId, 'owner');
    });
  }
  async disconnect(channelId: string, userId: string) {
    return this.withOwner(channelId, userId, async (tx) => {
      await tx
        .update(channels)
        .set({ disconnectedAt: new Date(), updatedAt: new Date() })
        .where(eq(channels.id, channelId));
      // Reconnection requires the owner to explicitly grant access again.
      await tx.delete(memberships).where(eq(memberships.channelId, channelId));
      await this.audit(
        tx,
        channelId,
        userId,
        'channel.disconnected',
        channelId,
      );
    });
  }
  async listMembers(channelId: string, userId: string) {
    return this.withOwner(channelId, userId, async (tx) =>
      tx
        .select({
          userId: users.id,
          twitchUserId: users.twitchUserId,
          login: users.login,
          displayName: users.displayName,
          role: memberships.role,
          verificationState: memberships.verificationState,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.channelId, channelId))
        .orderBy(users.login),
    );
  }
  async grant(channelId: string, userId: string, input: GrantMembership) {
    return this.withOwner(channelId, userId, async (tx, channel) => {
      if (!channel.connectedAt || channel.disconnectedAt)
        throw new ConflictException(
          'Connect the channel before granting team access',
        );
      const [member] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.twitchUserId, input.twitchUserId));
      if (!member)
        throw new NotFoundException(
          'This Twitch user must sign in to Lore first',
        );
      if (member.id === userId)
        throw new ForbiddenException('The owner role cannot be changed');
      await tx
        .insert(memberships)
        .values({
          channelId,
          userId: member.id,
          role: input.role,
          grantedBy: userId,
        })
        .onConflictDoUpdate({
          target: [memberships.channelId, memberships.userId],
          set: { role: input.role, grantedBy: userId, updatedAt: new Date() },
        });
      await this.audit(tx, channelId, userId, 'membership.granted', member.id, {
        role: input.role,
      });
      return {
        userId: member.id,
        role: input.role,
        verificationState: 'owner_approved' as const,
      };
    });
  }
  async removeMember(channelId: string, userId: string, memberId: string) {
    return this.withOwner(channelId, userId, async (tx) => {
      if (memberId === userId)
        throw new ForbiddenException('The owner cannot be removed');
      const [removed] = await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.channelId, channelId),
            eq(memberships.userId, memberId),
          ),
        )
        .returning();
      if (!removed) throw new NotFoundException('Membership not found');
      await this.audit(tx, channelId, userId, 'membership.removed', memberId);
    });
  }
  private async audit(
    tx: Transaction,
    channelId: string,
    actorId: string,
    action: string,
    targetId: string,
    details: typeof auditEvents.$inferInsert.details = {},
  ) {
    await tx
      .insert(auditEvents)
      .values({ channelId, actorId, action, targetId, details });
  }
}
