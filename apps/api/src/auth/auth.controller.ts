import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config';
import { AuthService, oauthMaxAge, sessionMaxAge } from './auth.service';
import {
  AuthenticatedRequest,
  assertMutation,
  cookieValue,
  SessionGuard,
} from './session.guard';
const options: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};
const stateOptions: CookieOptions = { ...options, path: '/api/auth/twitch' };
const callbackSchema = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().min(1).max(2048).optional(),
  error: z.string().max(200).optional(),
});
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get('twitch')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async start(@Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const login = await this.auth.beginLogin();
    response.cookie('lore_oauth', login.browser, {
      ...stateOptions,
      maxAge: oauthMaxAge,
    });
    response.redirect(login.url);
  }
  @Get('twitch/capture')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async capture(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const login = await this.auth.beginLogin(request.auth.user.id);
    response.cookie('lore_oauth', login.browser, {
      ...stateOptions,
      maxAge: oauthMaxAge,
    });
    response.redirect(login.url);
  }
  @Get('twitch/chat')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chat(@Req() request: AuthenticatedRequest, @Res() response: Response) {
    const login = await this.auth.beginLogin(request.auth.user.id, 'chat');
    response.cookie('lore_oauth', login.browser, {
      ...stateOptions,
      maxAge: oauthMaxAge,
    });
    response.redirect(login.url);
  }
  @Get('twitch/moderation')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async moderation(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const login = await this.auth.beginLogin(
      request.auth.user.id,
      'moderation',
    );
    response.cookie('lore_oauth', login.browser, {
      ...stateOptions,
      maxAge: oauthMaxAge,
    });
    response.redirect(login.url);
  }
  @Get('twitch/team')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async team(@Req() request: AuthenticatedRequest, @Res() response: Response) {
    const login = await this.auth.beginLogin(request.auth.user.id, 'team');
    response.cookie('lore_oauth', login.browser, {
      ...stateOptions,
      maxAge: oauthMaxAge,
    });
    response.cookie('lore_team_return', login.browser, {
      ...stateOptions,
      maxAge: oauthMaxAge,
    });
    response.redirect(login.url);
  }
  @Get('twitch/callback')
  async callback(
    @Query() query: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.clearCookie('lore_oauth', stateOptions);
    const parsed = callbackSchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException('Invalid OAuth callback');
    const browser = cookieValue(request, 'lore_oauth');
    if (!browser || !/^[a-f0-9]{64}$/.test(browser))
      throw new UnauthorizedException('OAuth browser binding missing');
    const teamReturn = cookieValue(request, 'lore_team_return') === browser;
    response.clearCookie('lore_team_return', stateOptions);
    if (teamReturn && parsed.data.error) {
      // Consume the denied state, but never resume a pending role change.
      try {
        await this.auth.completeLogin(parsed.data.state, browser);
      } catch (error) {
        if (!(error instanceof UnauthorizedException)) throw error;
      }
      response.redirect(`${env.APP_ORIGIN}/app/team?moderator=cancelled`);
      return;
    }
    const token = await this.auth.completeLogin(
      parsed.data.state,
      browser,
      parsed.data.error ? undefined : parsed.data.code,
      cookieValue(request, 'lore_session'),
    );
    response.cookie('lore_session', token, {
      ...options,
      maxAge: sessionMaxAge,
    });
    response.redirect(
      `${env.APP_ORIGIN}${teamReturn ? '/app/team?moderator=resume' : '/app'}`,
    );
  }
  @Get('status')
  status() {
    return {
      twitchConfigured: Boolean(
        env.TWITCH_CLIENT_ID &&
        env.TWITCH_CLIENT_SECRET &&
        env.AUTH_ENCRYPTION_KEY,
      ),
    };
  }
  @Get('session')
  @UseGuards(SessionGuard)
  session(@Req() request: AuthenticatedRequest) {
    return request.auth;
  }
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = cookieValue(request, 'lore_session');
    if (token) {
      assertMutation(request, token);
      await this.auth.logout(token);
    }
    response.clearCookie('lore_session', options);
  }
}
