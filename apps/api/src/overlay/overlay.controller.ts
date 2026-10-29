import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { updateOverlaySchema, overlayTokenActionSchema } from '@lore/shared';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { OverlayRepository } from './overlay.repository';
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException('Invalid overlay settings');
  return result.data;
}
@Controller('channels/:id')
@UseGuards(SessionGuard)
export class OverlayController {
  constructor(
    @Inject(OverlayRepository) private readonly repository: OverlayRepository,
  ) {}
  @Get('overlay') settings(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.repository.settings(id, req.auth.user);
  }
  @Post('overlay') @HttpCode(200) update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.update(
      id,
      req.auth.user,
      parse(updateOverlaySchema, body),
    );
  }
  @Post('overlay-token/rotate') @HttpCode(200) rotate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.token(
      id,
      req.auth.user,
      parse(overlayTokenActionSchema, body).expectedVersion,
      true,
    );
  }
  @Post('overlay-token/revoke') @HttpCode(200) async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return (
      await this.repository.token(
        id,
        req.auth.user,
        parse(overlayTokenActionSchema, body).expectedVersion,
        false,
      )
    ).settings;
  }
}
@Controller('overlay/:slug')
export class OverlayDisplayController {
  constructor(
    @Inject(OverlayRepository) private readonly repository: OverlayRepository,
  ) {}
  @Get() display(
    @Param('slug') slug: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.repository.display(
      slug,
      authorization?.startsWith('Bearer ') ? authorization.slice(7) : '',
    );
  }
}
