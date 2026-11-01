import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { InfrastructureService } from '../infrastructure.service';
import {
  oauthConnections,
  oauthStates,
  sessions,
  users,
} from '../database/schema';
import {
  csrfToken,
  encryptTokens,
  hashToken,
  randomToken,
} from './auth-crypto';
import { TwitchClient } from './twitch.client';
import { TokenService } from './token.service';
export const sessionMaxAge = 7 * 24 * 60 * 60 * 1000;
export const oauthMaxAge = 10 * 60 * 1000;
@Injectable()
export class AuthService {
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(TwitchClient) private readonly twitch: TwitchClient,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}
  async beginLogin(
    expectedUserId?: string,
    purpose: 'capture' | 'chat' | 'moderation' | 'team' = 'capture',
  ) {
    this.twitch.configured();
    const state = randomToken();
    const browser = randomToken();
    await this.infrastructure.db
      .delete(oauthStates)
      .where(lt(oauthStates.expiresAt, new Date()));
    await this.infrastructure.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()));
    await this.infrastructure.db.insert(oauthStates).values({
      stateHash: hashToken(state),
      browserHash: hashToken(browser),
      expectedUserId,
      expiresAt: new Date(Date.now() + oauthMaxAge),
    });
    const [existing] = expectedUserId
      ? await this.infrastructure.db
          .select({ scopes: oauthConnections.scopes })
          .from(oauthConnections)
          .where(eq(oauthConnections.userId, expectedUserId))
      : [];
    return {
      browser,
      url: this.twitch.authorizationUrl(state, {
        capture: Boolean(expectedUserId) && purpose !== 'team',
        chat: purpose === 'chat',
        moderation: purpose === 'moderation',
        existingScopes: existing?.scopes,
        manageModerators: purpose === 'team',
      }),
    };
  }
  async completeLogin(
    state: string,
    browser: string,
    code?: string,
    previousSession?: string,
  ) {
    const { key } = this.twitch.configured();
    const [accepted] = await this.infrastructure.db
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.stateHash, hashToken(state)),
          eq(oauthStates.browserHash, hashToken(browser)),
          gt(oauthStates.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!accepted)
      throw new UnauthorizedException('Invalid or expired OAuth state');
    if (!code)
      throw new UnauthorizedException('Twitch login was not authorized');
    const tokens = await this.twitch.exchange(code);
    const identity = await this.twitch.validate(tokens.access_token);
    const profile = await this.twitch.profile(tokens.access_token);
    if (identity.user_id !== profile.id)
      throw new UnauthorizedException('Twitch identity mismatch');
    if (accepted.expectedUserId) {
      const [expected] = await this.infrastructure.db
        .select()
        .from(users)
        .where(eq(users.id, accepted.expectedUserId));
      if (!expected || expected.twitchUserId !== profile.id)
        throw new UnauthorizedException(
          'Authorize Twitch with the signed-in account',
        );
    }
    const session = randomToken();
    await this.infrastructure.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          twitchUserId: profile.id,
          login: profile.login,
          displayName: profile.display_name,
        })
        .onConflictDoUpdate({
          target: users.twitchUserId,
          set: {
            login: profile.login,
            displayName: profile.display_name,
            updatedAt: new Date(),
          },
        })
        .returning();
      const connection = {
        encryptedTokens: encryptTokens(
          JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          }),
          user.id,
          key,
        ),
        scopes: identity.scopes,
        expiresAt: new Date(Date.now() + identity.expires_in * 1000),
        validatedAt: new Date(),
        revokedAt: null,
        updatedAt: new Date(),
      };
      await tx
        .insert(oauthConnections)
        .values({ userId: user.id, ...connection })
        .onConflictDoUpdate({
          target: oauthConnections.userId,
          set: connection,
        });
      if (previousSession)
        await tx
          .delete(sessions)
          .where(eq(sessions.tokenHash, hashToken(previousSession)));
      await tx.insert(sessions).values({
        userId: user.id,
        tokenHash: hashToken(session),
        expiresAt: new Date(Date.now() + sessionMaxAge),
      });
    });
    return session;
  }
  async authenticate(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Sign in required');
    const [result] = await this.infrastructure.db
      .select({
        user: {
          id: users.id,
          twitchUserId: users.twitchUserId,
          login: users.login,
          displayName: users.displayName,
        },
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, new Date()),
        ),
      );
    if (!result) throw new UnauthorizedException('Sign in required');
    await this.tokens.ensureValid(result.user.id);
    return { user: result.user, csrfToken: csrfToken(token) };
  }
  async logout(token: string) {
    await this.infrastructure.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
}
