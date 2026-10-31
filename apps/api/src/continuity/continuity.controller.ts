import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { z } from 'zod';
import {
  continuitySettingSchema,
  summaryDraftRequestSchema,
  microphoneReviewSchema,
} from '@lore/shared';
import type { Response } from 'express';
import {
  AuthenticatedRequest,
  cookieValue,
  SessionGuard,
} from '../auth/session.guard';
import { AuthService } from '../auth/auth.service';
import { ContinuityService } from './continuity.service';
import { channels } from '../database/schema';
import { eq } from 'drizzle-orm';
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('Invalid feature input');
  return result.data;
}
@Controller('channels/:id')
@UseGuards(SessionGuard)
export class ContinuityController {
  constructor(
    @Inject(ContinuityService) private readonly service: ContinuityService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get('features') settings(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.settings(id, req.auth.user.id);
  }
  @Post('features')
  @HttpCode(200)
  configure(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.configure(
      id,
      req.auth.user,
      parse(continuitySettingSchema, body),
    );
  }
  @Post('publications/ai-draft')
  @HttpCode(200)
  @Throttle({ default: { limit: 4, ttl: 60000 } })
  summary(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.summary(
      id,
      req.auth.user,
      parse(summaryDraftRequestSchema, body).sourceIds,
    );
  }
  @Get('microphone') voices(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.voices(id, req.auth.user);
  }
  @Post('microphone')
  @HttpCode(200)
  @Throttle({ default: { limit: 4, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: 960044, files: 1, fields: 0 },
    }),
  )
  listen(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file || file.mimetype !== 'audio/wav')
      throw new BadRequestException('Submit a recorded WAV audio clip');
    return this.service.listen(id, req.auth.user, file.buffer);
  }
  @Post('microphone/:captureId/:index')
  @HttpCode(200)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('captureId', ParseUUIDPipe) captureId: string,
    @Param('index', ParseIntPipe) index: number,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (index < 0 || index > 9)
      throw new BadRequestException('Invalid suggestion index');
    return this.service.reviewVoice(
      id,
      req.auth.user,
      captureId,
      index,
      parse(microphoneReviewSchema, body),
    );
  }
  @Sse('stream')
  async updates(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.service.settings(id, req.auth.user.id);
    res.setHeader('X-Accel-Buffering', 'no');
    const token = cookieValue(req, 'lore_session')!;
    return new Observable<{ type: string; data: { revision?: number } }>(
      (subscriber) => {
        let revision: number | undefined,
          busy = false;
        const tick = async () => {
          if (busy || subscriber.closed) return;
          busy = true;
          try {
            const session = await this.auth.authenticate(token);
            await this.service.settings(id, session.user.id);
            const [channel] = await this.service.infrastructure.db
              .select({ revision: channels.workspaceRevision })
              .from(channels)
              .where(eq(channels.id, id));
            if (!channel) throw new Error('Channel unavailable');
            if (revision !== channel.revision) {
              revision = channel.revision;
              subscriber.next({ type: 'changed', data: { revision } });
            } else subscriber.next({ type: 'heartbeat', data: {} });
          } catch {
            subscriber.next({ type: 'revoked', data: {} });
            subscriber.complete();
          } finally {
            busy = false;
          }
        };
        const timer = setInterval(() => void tick(), 2000);
        void tick();
        return () => clearInterval(timer);
      },
    );
  }
}
