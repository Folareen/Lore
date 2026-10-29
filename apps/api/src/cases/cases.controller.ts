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
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  addCaseEvidenceSchema,
  caseStatusSchema,
  createCaseSchema,
  decideCaseSchema,
  removeCaseEvidenceSchema,
  updateCaseSchema,
} from '@lore/shared';
import { z } from 'zod';
import type { Response } from 'express';
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard';
import { CasesRepository } from './cases.repository';
import { CaseFilesService } from './case-files.service';
import { CaseAiRepository } from './case-ai.repository';
import { CaseAiRecovery } from './case-ai.worker';
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('Invalid case input');
  return result.data;
}
@Controller('channels/:id')
@UseGuards(SessionGuard)
export class CasesController {
  constructor(
    @Inject(CasesRepository) private readonly repository: CasesRepository,
    @Inject(CaseFilesService) private readonly files: CaseFilesService,
    @Inject(CaseAiRepository) private readonly ai: CaseAiRepository,
    @Inject(CaseAiRecovery) private readonly recovery: CaseAiRecovery,
  ) {}
  @Get('cases') list(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return this.repository.list(
      id,
      request.auth.user.id,
      parse(
        z.strictObject({
          status: caseStatusSchema.optional(),
          cursor: z.uuid().optional(),
        }),
        query,
      ),
    );
  }
  @Post('cases') @HttpCode(200) create(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.create(
      id,
      request.auth.user,
      parse(createCaseSchema, body),
    );
  }
  @Get('cases/ai/settings') settings(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ai.settings(id, request.auth.user.id);
  }
  @Post('cases/ai/settings') @HttpCode(200) consent(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.ai.consent(
      id,
      request.auth.user.id,
      parse(z.strictObject({ enabled: z.boolean() }), body).enabled,
    );
  }
  @Get('cases/:caseId') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repository.get(id, request.auth.user.id, caseId);
  }
  @Patch('cases/:caseId') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.update(
      id,
      request.auth.user,
      caseId,
      parse(updateCaseSchema, body),
    );
  }
  @Post('cases/:caseId/decision') @HttpCode(200) decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.decide(
      id,
      request.auth.user,
      caseId,
      parse(decideCaseSchema, body),
    );
  }
  @Post('cases/:caseId/evidence') @HttpCode(200) addEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.repository.addEvidence(
      id,
      request.auth.user,
      caseId,
      parse(addCaseEvidenceSchema, body),
    );
  }
  @Delete('cases/:caseId/evidence/:evidenceId')
  @HttpCode(200)
  async removeEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const result = await this.repository.removeEvidence(
      id,
      request.auth.user,
      caseId,
      evidenceId,
      parse(removeCaseEvidenceSchema, body),
    );
    void this.files.cleanup();
    return result;
  }
  @Post('cases/:caseId/files')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 3,
        fieldSize: 1000,
      },
    }),
  )
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Select an evidence file');
    return this.files.upload(
      id,
      request.auth.user,
      caseId,
      parse(
        z.strictObject({
          expectedVersion: z.coerce.number().int().positive(),
          requestId: z.uuid(),
          label: z.string().trim().min(1).max(150),
        }),
        body,
      ),
      file,
    );
  }
  @Get('cases/:caseId/files/:fileId/download') async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const link = await this.files.download(
      id,
      request.auth.user.id,
      caseId,
      fileId,
    );
    response.redirect(link.url);
  }
  @Get('cases/:caseId/precedents') precedents(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ai.latest(id, request.auth.user.id, caseId);
  }
  @Post('cases/:caseId/precedents') @HttpCode(200) async retrieve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body);
    const result = await this.ai.request(id, request.auth.user.id, caseId);
    void this.recovery.recover();
    return result;
  }
}
