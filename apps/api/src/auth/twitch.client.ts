import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { env } from '../config';
export const tokenPairSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});
const tokensSchema = tokenPairSchema.extend({
  expires_in: z.number().int().positive(),
  scope: z.array(z.string()),
  token_type: z.literal('bearer'),
});
const validationSchema = z.object({
  client_id: z.string(),
  user_id: z.string().min(1),
  login: z.string().min(1),
  scopes: z.array(z.string()),
  expires_in: z.number().int().nonnegative(),
});
const profileSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().regex(/^\d+$/),
        login: z.string().regex(/^[a-z0-9_]+$/),
        display_name: z.string().min(1),
      }),
    )
    .length(1),
});
@Injectable()
export class TwitchClient {
  configured() {
    if (
      !env.TWITCH_CLIENT_ID ||
      !env.TWITCH_CLIENT_SECRET ||
      !env.AUTH_ENCRYPTION_KEY
    )
      throw new ServiceUnavailableException('Twitch login is not configured');
    return {
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      key: env.AUTH_ENCRYPTION_KEY,
    };
  }
  authorizationUrl(state: string) {
    const { clientId } = this.configured();
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: '',
      state,
    }).toString();
    return url.toString();
  }
  redirectUri() {
    return `${env.APP_ORIGIN}/api/auth/twitch/callback`;
  }
  private async request(
    path: string,
    init: RequestInit,
    api = false,
  ): Promise<unknown> {
    const base =
      env.TWITCH_TEST_BASE_URL ||
      (api ? 'https://api.twitch.tv' : 'https://id.twitch.tv');
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException(
        'Twitch is temporarily unavailable',
      );
    }
    if (
      response.status === 401 ||
      (path === '/oauth2/token' && response.status === 400)
    )
      throw new UnauthorizedException(
        'Twitch authorization is no longer valid',
      );
    if (!response.ok)
      throw new ServiceUnavailableException('Twitch request failed');
    try {
      return await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'Twitch returned an invalid response',
      );
    }
  }
  async exchange(code: string) {
    const { clientId, clientSecret } = this.configured();
    return this.parse(
      tokensSchema,
      await this.request('/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri(),
        }),
      }),
    );
  }
  async refresh(refreshToken: string) {
    const { clientId, clientSecret } = this.configured();
    return this.parse(
      tokensSchema,
      await this.request('/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      }),
    );
  }
  async validate(accessToken: string) {
    const validated = this.parse(
      validationSchema,
      await this.request('/oauth2/validate', {
        headers: { Authorization: `OAuth ${accessToken}` },
      }),
    );
    if (validated.client_id !== this.configured().clientId)
      throw new UnauthorizedException('Twitch client mismatch');
    return validated;
  }
  async profile(accessToken: string) {
    const result = this.parse(
      profileSchema,
      await this.request(
        '/helix/users',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Client-Id': this.configured().clientId,
          },
        },
        true,
      ),
    );
    return result.data[0];
  }
  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new ServiceUnavailableException(
        'Twitch returned an invalid response',
      );
    return result.data;
  }
}
