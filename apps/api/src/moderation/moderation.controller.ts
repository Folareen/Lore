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
  createRepairSchema,
  updateRepairSchema,
  createFlagSchema,
  reviewFlagSchema,
  generateHandoffSchema,
  updateHandoffTaskSchema,
  recordRuleChangeSchema,
} from '@lore/shared';
import { z } from 'zod';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { ModerationRepository, deskQuerySchema } from './moderation.repository';
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException('Invalid moderation workflow input');
  return result.data;
}
@Controller('channels/:id')
@UseGuards(SessionGuard)
export class ModerationController {
  constructor(
    @Inject(ModerationRepository)
    private readonly repository: ModerationRepository,
  ) {}
  @Post('moderation/rule-changes') @HttpCode(200) ruleChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.recordRuleChange(
      id,
      req.auth.user,
      parse(recordRuleChangeSchema, body),
    );
  }
  @Get('moderation') desk(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return this.repository.desk(
      id,
      req.auth.user,
      parse(deskQuerySchema, query),
    );
  }
  @Post('repairs') @HttpCode(200) createRepair(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.createRepair(
      id,
      req.auth.user,
      parse(createRepairSchema, body),
    );
  }
  @Patch('repairs/:repairId') repair(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('repairId', ParseUUIDPipe) repairId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.updateRepair(
      id,
      req.auth.user,
      repairId,
      parse(updateRepairSchema, body),
    );
  }
  @Post('consistency/scan') @HttpCode(200) scan(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body);
    return this.repository.scan(id, req.auth.user);
  }
  @Post('consistency') @HttpCode(200) createFlag(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.createFlag(
      id,
      req.auth.user,
      parse(createFlagSchema, body),
    );
  }
  @Patch('consistency/:flagId') review(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('flagId', ParseUUIDPipe) flagId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.review(
      id,
      req.auth.user,
      flagId,
      parse(reviewFlagSchema, body),
    );
  }
  @Post('handoffs') @HttpCode(200) generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.generate(
      id,
      req.auth.user,
      parse(generateHandoffSchema, body).requestId,
    );
  }
  @Patch('handoffs/:handoffId/items/:itemId') task(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('handoffId', ParseUUIDPipe) handoffId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.task(
      id,
      req.auth.user,
      handoffId,
      itemId,
      parse(updateHandoffTaskSchema, body),
    );
  }
}
