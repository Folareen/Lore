import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { grantMembershipSchema, updateChannelSchema } from '@lore/shared';
import { z } from 'zod';
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard';
import { ChannelsRepository } from './channels.repository';
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: 'Invalid request body',
      issues: result.error.issues.map(({ path, message }) => ({
        path,
        message,
      })),
    });
  return result.data;
}
@Controller('channels')
@UseGuards(SessionGuard)
export class ChannelsController {
  constructor(
    @Inject(ChannelsRepository) private readonly channels: ChannelsRepository,
  ) {}
  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.channels.list(request.auth.user.id);
  }
  @Post('connect')
  @HttpCode(200)
  connect(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    parse(z.strictObject({}), body ?? {});
    return this.channels.connect(request.auth.user.id);
  }
  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channels.get(id, request.auth.user.id);
  }
  @Patch(':id/settings')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.channels.update(
      id,
      request.auth.user.id,
      parse(updateChannelSchema, body),
    );
  }
  @Get(':id/retention') retention(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.channels.retention(id, req.auth.user.id);
  }
  @Post(':id/retention/purge') @HttpCode(200) purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body);
    return this.channels.retention(id, req.auth.user.id, true);
  }
  @Post(':id/disconnect')
  @HttpCode(204)
  disconnect(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channels.disconnect(id, request.auth.user.id);
  }
  @Get(':id/members')
  members(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channels.listMembers(id, request.auth.user.id);
  }
  @Post(':id/members')
  @HttpCode(200)
  grant(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.channels.grant(
      id,
      request.auth.user.id,
      parse(grantMembershipSchema, body),
    );
  }
  @Get(':id/members/twitch')
  moderatorAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channels.moderatorAccess(id, request.auth.user.id);
  }
  @Delete(':id/members/:userId')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channels.removeMember(id, request.auth.user.id, userId);
  }
}
