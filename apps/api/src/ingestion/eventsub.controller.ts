import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard';
import { env } from '../config';
import { EventsubRepository } from './eventsub.repository';
import { EventsubService } from './eventsub.service';
import {
  envelopeSchema,
  eventSchemas,
  messageTypeSchema,
} from './eventsub.schemas';
import { verifyWebhook } from './webhook-verification';
import { IngestionRecovery } from './ingestion.worker';

@Controller('webhooks/twitch')
export class EventsubWebhookController {
  constructor(
    @Inject(EventsubRepository) private readonly repository: EventsubRepository,
    @Inject(IngestionRecovery) private readonly recovery: IngestionRecovery,
  ) {}
  @Post()
  @SkipThrottle()
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ) {
    if (!env.TWITCH_EVENTSUB_SECRET)
      throw new ServiceUnavailableException('EventSub is not configured');
    const delivery = verifyWebhook(
      request.headers,
      request.rawBody,
      env.TWITCH_EVENTSUB_SECRET,
    );
    const result = envelopeSchema.safeParse(request.body);
    if (!result.success)
      throw new BadRequestException('Invalid EventSub envelope');
    const { subscription, challenge } = result.data;
    const parsedKind = messageTypeSchema.safeParse(
      request.get('twitch-eventsub-message-type'),
    );
    if (!parsedKind.success)
      throw new BadRequestException('Invalid EventSub message type');
    const kind = parsedKind.data;
    if (
      request.get('twitch-eventsub-subscription-type') !== subscription.type ||
      request.get('twitch-eventsub-subscription-version') !==
        subscription.version ||
      subscription.transport.callback !== env.TWITCH_EVENTSUB_CALLBACK_URL ||
      (subscription.type.startsWith('channel.chat.') &&
        subscription.condition.user_id !==
          subscription.condition.broadcaster_user_id)
    )
      throw new BadRequestException('EventSub subscription mismatch');
    let payload: Record<string, unknown> | undefined;
    if (kind === 'notification') {
      const parsed = eventSchemas[subscription.type].safeParse(
        result.data.event,
      );
      if (
        !parsed.success ||
        parsed.data.broadcaster_user_id !==
          subscription.condition.broadcaster_user_id
      )
        throw new BadRequestException('Invalid EventSub event');
      payload = parsed.data;
      // Shared-chat messages originating elsewhere are outside this channel's consent boundary.
      if (
        subscription.type === 'channel.chat.message' &&
        'source_broadcaster_user_id' in payload &&
        payload.source_broadcaster_user_id &&
        payload.source_broadcaster_user_id !==
          subscription.condition.broadcaster_user_id
      ) {
        response.status(204).end();
        return;
      }
    }
    if (kind === 'webhook_callback_verification' && !challenge)
      throw new BadRequestException('EventSub challenge missing');
    const accepted = await this.repository.receive(
      subscription,
      delivery.id,
      delivery.timestamp,
      kind,
      payload,
    );
    if (kind === 'webhook_callback_verification') {
      if (!accepted)
        throw new BadRequestException(
          'Capture is not enabled for this channel',
        );
      response.status(200).type('text/plain').send(challenge);
      return;
    }
    // No Redis operation is on the acknowledgment path; recovery scans PostgreSQL.
    if (accepted && kind === 'notification') void this.recovery.recover();
    response.status(204).end();
  }
}
@Controller('channels/:id/ingestion')
@UseGuards(SessionGuard)
export class EventsubController {
  constructor(
    @Inject(EventsubService) private readonly service: EventsubService,
  ) {}
  @Get()
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.status(id, request.auth.user.id);
  }
  @Post('start')
  @HttpCode(200)
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.start(id, request.auth.user.id);
  }
  @Post('stop')
  @HttpCode(200)
  stop(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.stop(id, request.auth.user.id);
  }
}
