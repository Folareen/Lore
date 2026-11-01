import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { env } from '../config';

const moderatorsSchema = z.object({
  data: z.array(z.object({ user_id: z.string().regex(/^\d+$/) })),
});

@Injectable()
export class TwitchModeratorsClient {
  private async request(token: string, query: URLSearchParams, method = 'GET') {
    if (!env.TWITCH_CLIENT_ID)
      throw new ServiceUnavailableException(
        'Twitch moderator management is not configured.',
      );
    let response: Response;
    try {
      response = await fetch(
        `${env.TWITCH_TEST_BASE_URL || 'https://api.twitch.tv'}/helix/moderation/moderators?${query}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Client-Id': env.TWITCH_CLIENT_ID,
          },
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Twitch moderator management is temporarily unavailable. Try again.',
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new ForbiddenException(
        'Authorize Twitch moderator management again in Teams.',
      );
    if (response.status === 429)
      throw new ServiceUnavailableException(
        'Twitch is limiting moderator changes. Wait a moment and try again.',
      );
    return response;
  }
  async list(token: string, broadcasterId: string, userIds: string[]) {
    const found: string[] = [];
    for (let offset = 0; offset < userIds.length; offset += 100) {
      const requested = userIds.slice(offset, offset + 100);
      const query = new URLSearchParams({
        broadcaster_id: broadcasterId,
        first: '100',
      });
      requested.forEach((id) => query.append('user_id', id));
      const response = await this.request(token, query);
      if (!response.ok)
        throw new ServiceUnavailableException(
          'Could not check Twitch moderator roles. Try again.',
        );
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ServiceUnavailableException(
          'Twitch returned an invalid moderator response.',
        );
      }
      const parsed = moderatorsSchema.safeParse(body);
      if (
        !parsed.success ||
        parsed.data.data.some((entry) => !requested.includes(entry.user_id))
      )
        throw new ServiceUnavailableException(
          'Twitch returned an invalid moderator response.',
        );
      found.push(...parsed.data.data.map((entry) => entry.user_id));
    }
    return found;
  }
  async ensure(token: string, broadcasterId: string, userId: string) {
    if ((await this.list(token, broadcasterId, [userId])).includes(userId))
      return;
    const response = await this.request(
      token,
      new URLSearchParams({ broadcaster_id: broadcasterId, user_id: userId }),
      'POST',
    );
    if (response.status === 204) return;
    // Another owner request may have promoted the same user between the read and write.
    if (
      response.status === 400 &&
      (await this.list(token, broadcasterId, [userId])).includes(userId)
    )
      return;
    if (response.status === 400 || response.status === 422)
      throw new ConflictException(
        'Twitch could not make this person a moderator. Check that they are not banned or a VIP, then try again.',
      );
    throw new ServiceUnavailableException(
      'Could not enable the Twitch moderator role. Try again.',
    );
  }
}
