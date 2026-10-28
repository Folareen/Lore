import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createOpenLoopSchema,
  openLoopStatusSchema,
  transitionOpenLoopSchema,
} from '@lore/shared';
import { z } from 'zod';
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard';
import { OpenLoopsRepository } from './open-loops.repository';
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException('Invalid open-loop input');
  return result.data;
}
@Controller('channels/:id')
@UseGuards(SessionGuard)
export class OpenLoopsController {
  constructor(
    @Inject(OpenLoopsRepository)
    private readonly repository: OpenLoopsRepository,
  ) {}
  @Get('open-loops')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return this.repository.list(
      id,
      request.auth.user.id,
      parse(
        z.strictObject({
          status: openLoopStatusSchema.optional(),
          cursor: z.uuid().optional(),
        }),
        query,
      ),
    );
  }
  @Post('open-loops')
  @HttpCode(200)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.create(
      id,
      request.auth.user,
      parse(createOpenLoopSchema, body),
    );
  }
  @Get('open-loops/:loopId')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loopId', ParseUUIDPipe) loopId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repository.get(id, request.auth.user.id, loopId);
  }
  @Get('open-loops/:loopId/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loopId', ParseUUIDPipe) loopId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repository.history(id, request.auth.user.id, loopId);
  }
  @Patch('open-loops/:loopId')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loopId', ParseUUIDPipe) loopId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.transition(
      id,
      request.auth.user,
      loopId,
      parse(transitionOpenLoopSchema, body),
    );
  }
  @Get('brief')
  brief(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repository.brief(id, request.auth.user.id);
  }
}
