import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { z } from 'zod';
import type { TwitchEventType } from '@lore/shared';
import { TwitchClient } from '../auth/twitch.client';
import { env } from '../config';

export const remoteSubscriptionSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  version: z.string(),
  status: z.string(),
  condition: z.record(z.string(), z.string()),
  transport: z.object({ method: z.string(), callback: z.string().optional() }),
});
export type RemoteSubscription = z.infer<typeof remoteSubscriptionSchema>;
@Injectable()
export class EventsubClient {
  private token?: { value: string; expiresAt: number };
  constructor(@Inject(TwitchClient) private readonly twitch: TwitchClient) {}
  configured() {
    return Boolean(
      env.TWITCH_EVENTSUB_SECRET && env.TWITCH_EVENTSUB_CALLBACK_URL,
    );
  }
  private async fetch(path: string, init: RequestInit, identity = false) {
    try {
      return await fetch(
        `${env.TWITCH_TEST_BASE_URL || (identity ? 'https://id.twitch.tv' : 'https://api.twitch.tv')}${path}`,
        { ...init, signal: AbortSignal.timeout(5000), redirect: 'error' },
      );
    } catch {
      throw new ServiceUnavailableException('Twitch EventSub is unavailable');
    }
  }
  private async appToken() {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    const { clientId, clientSecret } = this.twitch.configured();
    const response = await this.fetch(
      '/oauth2/token',
      {
        method: 'POST',
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        }),
      },
      true,
    );
    const parsed = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive(),
      })
      .safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success)
      throw new ServiceUnavailableException('Twitch app authorization failed');
    this.token = {
      value: parsed.data.access_token,
      expiresAt: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }
  private async request(path: string, method = 'GET', body?: unknown) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.appToken();
      const response = await this.fetch(
        `/helix/eventsub/subscriptions${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Client-Id': this.twitch.configured().clientId,
            'Content-Type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      if (response.status === 401) {
        this.token = undefined;
        continue;
      }
      if (response.status === 403)
        throw new ForbiddenException('Twitch capture permission is missing');
      if (method === 'DELETE' && (response.ok || response.status === 404))
        return null;
      if (response.status === 409) return null; // A prior create may have succeeded before a timeout.
      if (!response.ok)
        throw new ServiceUnavailableException('Twitch EventSub request failed');
      return response.json().catch(() => {
        throw new ServiceUnavailableException(
          'Invalid Twitch EventSub response',
        );
      });
    }
    throw new ServiceUnavailableException('Twitch app authorization failed');
  }
  async list() {
    const subscriptions: RemoteSubscription[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const result = z
        .object({
          data: z.array(remoteSubscriptionSchema),
          pagination: z.object({ cursor: z.string().optional() }),
        })
        .safeParse(
          await this.request(
            `?first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
          ),
        );
      if (!result.success)
        throw new ServiceUnavailableException(
          'Invalid Twitch subscription list',
        );
      subscriptions.push(...result.data.data);
      cursor = result.data.pagination.cursor;
      if (!cursor) return subscriptions;
    }
    throw new ServiceUnavailableException(
      'Twitch subscription list exceeded safety limit',
    );
  }
  async create(type: TwitchEventType, broadcasterId: string) {
    return this.request('', 'POST', {
      type,
      version: '1',
      condition: {
        broadcaster_user_id: broadcasterId,
        ...(type.startsWith('channel.chat.') ? { user_id: broadcasterId } : {}),
      },
      transport: {
        method: 'webhook',
        callback: env.TWITCH_EVENTSUB_CALLBACK_URL,
        secret: env.TWITCH_EVENTSUB_SECRET,
      },
    });
  }
  async remove(id: string) {
    await this.request(`?id=${encodeURIComponent(id)}`, 'DELETE');
  }
}
