import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  candidateStatusSchema,
  dismissCandidateSchema,
  reviewCandidateSchema,
} from '@lore/shared';
import { z } from 'zod';
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard';
import { AiRepository } from './ai.repository';
import { AiRecovery } from './ai.worker';
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('Invalid candidate input');
  return result.data;
}
@Controller('channels/:id')
@UseGuards(SessionGuard)
export class AiController {
  constructor(
    @Inject(AiRepository) private readonly repository: AiRepository,
    @Inject(AiRecovery) private readonly recovery: AiRecovery,
  ) {}
  @Get('ai')
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repository.status(id, request.auth.user.id);
  }
  @Post('ai/settings')
  @HttpCode(200)
  async settings(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const { enabled } = parse(z.strictObject({ enabled: z.boolean() }), body);
    const result = await this.repository.settings(
      id,
      request.auth.user.id,
      enabled,
    );
    void this.recovery.recover();
    return result;
  }
  @Post('ai/extractions')
  @HttpCode(200)
  async extract(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body);
    const run = await this.repository.schedule(id, request.auth.user.id);
    void this.recovery.recover();
    return { runId: run!.id };
  }
  @Post('ai/extractions/:runId/retry')
  @HttpCode(200)
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body);
    const run = await this.repository.retry(id, request.auth.user.id, runId);
    void this.recovery.recover();
    return { runId: run.id };
  }
  @Get('candidates')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    const options = parse(
      z.strictObject({
        status: candidateStatusSchema.default('pending'),
        cursor: z.uuid().optional(),
      }),
      query,
    );
    return this.repository.list(
      id,
      request.auth.user.id,
      options.status,
      options.cursor,
    );
  }
  @Post('candidates/:candidateId/confirm')
  @HttpCode(200)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.confirm(
      id,
      request.auth.user,
      candidateId,
      parse(reviewCandidateSchema, body),
    );
  }
  @Post('candidates/:candidateId/dismiss')
  @HttpCode(204)
  dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.dismiss(
      id,
      request.auth.user,
      candidateId,
      parse(dismissCandidateSchema, body),
    );
  }
}
