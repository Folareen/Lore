import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, isNull, sql } from 'drizzle-orm';
import { InfrastructureService } from '../infrastructure.service';
import {
  oauthConnections,
  sessions,
  users,
  channels,
  memberships,
  auditEvents,
} from '../database/schema';
import { TwitchClient, tokenPairSchema } from './twitch.client';
import { decryptTokens, encryptTokens } from './auth-crypto';
@Injectable()
export class TokenService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private checking = false;
  private readonly logger = new Logger(TokenService.name);
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(TwitchClient) private readonly twitch: TwitchClient,
  ) {}

  async ensureValid(userId: string, force = false): Promise<void> {
    const { key } = this.twitch.configured();
    // Row locking serializes refreshes across requests and application instances.
    const valid = await this.infrastructure.db.transaction(async (tx) => {
      const [connection] = await tx
        .select()
        .from(oauthConnections)
        .where(eq(oauthConnections.userId, userId))
        .for('update');
      if (!connection || connection.revokedAt || !connection.encryptedTokens)
        return false;
      if (
        !force &&
        connection.validatedAt.getTime() > Date.now() - 55 * 60_000 &&
        connection.expiresAt.getTime() > Date.now()
      )
        return true;
      const [user] = await tx
        .select({ twitchUserId: users.twitchUserId })
        .from(users)
        .where(eq(users.id, userId));
      try {
        let tokens = tokenPairSchema.parse(
          JSON.parse(decryptTokens(connection.encryptedTokens, userId, key)),
        );
        if (connection.expiresAt.getTime() <= Date.now())
          tokens = await this.twitch.refresh(tokens.refresh_token);
        const identity = await this.twitch.validate(tokens.access_token);
        if (!user || identity.user_id !== user.twitchUserId)
          throw new UnauthorizedException('Twitch identity mismatch');
        await tx
          .update(oauthConnections)
          .set({
            encryptedTokens: encryptTokens(JSON.stringify(tokens), userId, key),
            scopes: identity.scopes,
            expiresAt: new Date(Date.now() + identity.expires_in * 1000),
            validatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(oauthConnections.userId, userId));
        return true;
      } catch (error) {
        if (!(error instanceof UnauthorizedException)) throw error;
        await tx
          .update(oauthConnections)
          .set({
            encryptedTokens: null,
            revokedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(oauthConnections.userId, userId));
        await tx.delete(sessions).where(eq(sessions.userId, userId));
        const disconnected = await tx
          .update(channels)
          .set({ disconnectedAt: new Date(), updatedAt: new Date() })
          .where(eq(channels.ownerUserId, userId))
          .returning({ id: channels.id });
        if (disconnected.length)
          await tx.insert(auditEvents).values(
            disconnected.map((channel) => ({
              channelId: channel.id,
              actorId: userId,
              action: 'authorization.revoked',
              targetId: userId,
            })),
          );
        await tx
          .delete(memberships)
          .where(
            sql`${memberships.channelId} in (select ${channels.id} from ${channels} where ${channels.ownerUserId} = ${userId})`,
          );
        return false;
      }
    });
    if (!valid) throw new UnauthorizedException('Sign in with Twitch again');
  }
  async onApplicationBootstrap() {
    try {
      this.twitch.configured();
    } catch {
      return;
    }
    await this.checkConnections(true);
    this.timer = setInterval(() => {
      void this.checkConnections(false);
    }, 5 * 60_000);
    this.timer.unref();
  }
  private async checkConnections(force: boolean) {
    if (this.checking) return;
    this.checking = true;
    try {
      const connections = await this.infrastructure.db
        .select({ userId: oauthConnections.userId })
        .from(oauthConnections)
        .where(isNull(oauthConnections.revokedAt));
      for (const connection of connections) {
        try {
          await this.ensureValid(connection.userId, force);
        } catch (error) {
          if (!(error instanceof UnauthorizedException))
            this.logger.warn(
              'Twitch validation temporarily unavailable; stale sessions will fail closed',
            );
        }
      }
    } catch {
      this.logger.warn('Unable to run scheduled Twitch validation');
    } finally {
      this.checking = false;
    }
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}
