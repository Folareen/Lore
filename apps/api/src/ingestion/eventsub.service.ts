import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  UnauthorizedException,
} from '@nestjs/common';
import {
  captureScopes,
  moderationEventTypes,
  twitchEventTypes,
  twitchEventTypeSchema,
} from '@lore/shared';
import { EventsubClient, remoteSubscriptionSchema } from './eventsub.client';
import { EventsubRepository } from './eventsub.repository';
import { TokenService } from '../auth/token.service';
import { env } from '../config';
import { z } from 'zod';

@Injectable()
export class EventsubService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(EventsubService.name);
  constructor(
    @Inject(EventsubClient) private readonly client: EventsubClient,
    @Inject(EventsubRepository) private readonly repository: EventsubRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}
  status(channelId: string, userId: string) {
    return this.repository.status(channelId, userId, this.client.configured());
  }
  async start(channelId: string, userId: string) {
    await this.repository.owner(channelId, userId);
    if (!this.client.configured())
      throw new ConflictException(
        'Configure Twitch EventSub before starting capture',
      );
    await this.tokens.ensureValid(userId, true);
    if ((await this.repository.missingScopes(userId)).length)
      throw new ConflictException(
        `Authorize capture first: ${captureScopes.join(', ')}`,
      );
    await this.repository.requestCapture(channelId, userId, true);
    void this.reconcile();
    return this.status(channelId, userId);
  }
  async stop(channelId: string, userId: string) {
    await this.repository.requestCapture(channelId, userId, false);
    void this.reconcile();
    return this.status(channelId, userId);
  }
  onApplicationBootstrap() {
    if (!this.client.configured()) return;
    void this.reconcile();
    this.timer = setInterval(() => {
      void this.reconcile();
    }, 30_000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async reconcile() {
    if (this.running || !this.client.configured()) return;
    this.running = true;
    try {
      await this.repository.withReconciliation(async () => {
        const channels = await this.repository.managedChannels();
        if (!channels.length) return;
        let remote;
        try {
          remote = await this.client.list();
        } catch (error) {
          for (const channel of channels.filter((c) => c.captureRequested))
            await this.repository.error(channel.id, 'provider_unavailable');
          // Client HTTP exceptions contain fixed messages, never Twitch response bodies.
          const reason =
            error instanceof HttpException
              ? error.message
              : 'Unexpected subscription lookup failure';
          this.logger.warn(
            `EventSub reconciliation unavailable; will retry: ${reason}`,
          );
          return;
        }
        for (const channel of channels) {
          try {
            let desired = Boolean(
              channel.captureRequested &&
              channel.connectedAt &&
              !channel.disconnectedAt,
            );
            if (desired && channel.ownerUserId) {
              await this.tokens.ensureValid(channel.ownerUserId);
              if (
                (await this.repository.missingScopes(channel.ownerUserId))
                  .length
              ) {
                desired = false;
                await this.repository.error(
                  channel.id,
                  'authorization_required',
                );
              }
            }
            const importReady =
              channel.moderationImportsEnabled &&
              channel.ownerUserId &&
              !(await this.repository.missingScopes(channel.ownerUserId, true))
                .length;
            const desiredTypes = twitchEventTypes.filter(
              (type) =>
                !moderationEventTypes.some((t) => t === type) || importReady,
            );
            const known = await this.repository.knownSubscriptions(channel.id);
            const owned = remote.filter(
              (sub) =>
                sub.transport.method === 'webhook' &&
                ((sub.transport.callback === env.TWITCH_EVENTSUB_CALLBACK_URL &&
                  sub.condition.broadcaster_user_id ===
                    channel.twitchChannelId &&
                  twitchEventTypeSchema.safeParse(sub.type).success &&
                  (!sub.type.startsWith('channel.chat.') ||
                    sub.condition.user_id === channel.twitchChannelId) &&
                  (!sub.type.startsWith('channel.unban_request.') ||
                    sub.condition.moderator_user_id ===
                      channel.twitchChannelId)) ||
                  known.some((local) => local.id === sub.id)),
            );
            for (const local of known)
              if (!owned.some((sub) => sub.id === local.id))
                await this.repository.removedSubscription(channel.id, local.id);
            const active = new Set<string>();
            for (const sub of owned) {
              const currentTransport =
                sub.transport.callback === env.TWITCH_EVENTSUB_CALLBACK_URL;
              if (
                !desired ||
                !desiredTypes.some((type) => type === sub.type) ||
                !currentTransport ||
                sub.version !== '1' ||
                !['enabled', 'webhook_callback_verification_pending'].includes(
                  sub.status,
                ) ||
                active.has(sub.type)
              ) {
                await this.client.remove(sub.id);
                await this.repository.removedSubscription(channel.id, sub.id);
              } else {
                active.add(sub.type);
                await this.repository.saveSubscription(channel.id, sub);
              }
            }
            if (desired && channel.twitchChannelId) {
              for (const type of desiredTypes)
                if (!active.has(type)) {
                  const result = await this.client.create(
                    type,
                    channel.twitchChannelId,
                  );
                  if (result) {
                    const parsed = z
                      .object({
                        data: z.array(remoteSubscriptionSchema).length(1),
                      })
                      .safeParse(result);
                    if (!parsed.success)
                      throw new Error('Invalid subscription response');
                    // The signed verification callback writes the enabled status. Do not overwrite it with the create response's pending status.
                  }
                }
              await this.repository.error(channel.id, null);
            }
          } catch (error) {
            await this.repository.error(
              channel.id,
              error instanceof ForbiddenException ||
                error instanceof UnauthorizedException
                ? 'authorization_required'
                : 'provider_unavailable',
            );
            this.logger.warn(
              `EventSub channel reconciliation failed (${channel.id}); will retry`,
            );
          }
        }
      });
    } catch {
      this.logger.warn('EventSub reconciliation failed; will retry');
    } finally {
      this.running = false;
    }
  }
}
