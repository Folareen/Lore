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
import { z } from 'zod';
import {
  createPublicationSchema,
  editPublicationSchema,
  publicationActionSchema,
} from '@lore/shared';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import {
  PublicationsRepository,
  publicationQuerySchema,
  publicQuerySchema,
} from './publications.repository';
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException('Invalid community entry input');
  return result.data;
}
@Controller('channels/:id')
@UseGuards(SessionGuard)
export class PublicationsController {
  constructor(
    @Inject(PublicationsRepository)
    private readonly repository: PublicationsRepository,
  ) {}
  @Get('publications') list(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return this.repository.list(
      id,
      req.auth.user,
      parse(publicationQuerySchema, query),
    );
  }
  @Post('publications') @HttpCode(200) create(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.create(
      id,
      req.auth.user,
      parse(createPublicationSchema, body),
    );
  }
  @Get('publications/:entryId') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.repository.get(id, req.auth.user, entryId);
  }
  @Patch('publications/:entryId') edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.edit(
      id,
      req.auth.user,
      entryId,
      parse(editPublicationSchema, body),
    );
  }
  @Post('publications/:entryId/review') @HttpCode(200) review(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.action(
      id,
      req.auth.user,
      entryId,
      parse(publicationActionSchema, body),
    );
  }
  @Get('catchup/settings') settings(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.repository.settings(id, req.auth.user);
  }
  @Post('catchup/settings') @HttpCode(200) consent(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.settings(
      id,
      req.auth.user,
      parse(z.strictObject({ enabled: z.boolean() }), body).enabled,
    );
  }
}
@Controller('public/channels/:slug')
export class PublicLoreController {
  constructor(
    @Inject(PublicationsRepository)
    private readonly repository: PublicationsRepository,
  ) {}
  @Get() feed(@Param('slug') slug: string, @Query() query: unknown) {
    return this.repository.feed(slug, parse(publicQuerySchema, query));
  }
  @Get('catch-up') catchup(@Param('slug') slug: string) {
    return this.repository.catchup(slug);
  }
  @Get('entries/:entryId') entry(
    @Param('slug') slug: string,
    @Param('entryId', ParseUUIDPipe) id: string,
  ) {
    return this.repository.publicGet(slug, id);
  }
}
