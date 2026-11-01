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
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { screenshotUploadSchema } from '@lore/shared';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { StoryImagesService } from './story-images.service';
import { PublicationsRepository } from './publications.repository';
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException('Invalid screenshot input');
  return parsed.data;
}
@Controller('channels/:id/publications/:entryId')
@UseGuards(SessionGuard)
export class StoryImagesController {
  constructor(
    @Inject(StoryImagesService) private readonly images: StoryImagesService,
    @Inject(PublicationsRepository)
    private readonly repository: PublicationsRepository,
  ) {}
  @Post('screenshot')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 2,
        fieldSize: 1000,
      },
    }),
  )
  upload(
    @Param('id', ParseUUIDPipe) channel: string,
    @Param('entryId', ParseUUIDPipe) entry: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Choose a screenshot');
    return this.images.upload(
      channel,
      req.auth.user,
      entry,
      parse(screenshotUploadSchema, body),
      file,
    );
  }
  @Delete('screenshot')
  @HttpCode(200)
  async remove(
    @Param('id', ParseUUIDPipe) channel: string,
    @Param('entryId', ParseUUIDPipe) entry: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.strictObject({ expectedVersion: z.number().int().positive() }),
      body,
    );
    const result = await this.repository.finishScreenshot(
      channel,
      req.auth.user,
      entry,
      input.expectedVersion,
      null,
    );
    void this.images.cleanup();
    return result;
  }
  @Get('screenshot/:imageId')
  async read(
    @Param('id', ParseUUIDPipe) channel: string,
    @Param('entryId', ParseUUIDPipe) entry: string,
    @Param('imageId', ParseUUIDPipe) image: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return new StreamableFile(
      await this.images.read(channel, entry, image, req.auth.user.id),
      { type: 'image/webp', disposition: 'inline' },
    );
  }
}
@Controller('public/channels/:slug/entries/:entryId/screenshot')
export class PublicStoryImagesController {
  constructor(
    @Inject(StoryImagesService) private readonly images: StoryImagesService,
  ) {}
  @Get(':imageId')
  async read(
    @Param('slug') channel: string,
    @Param('entryId', ParseUUIDPipe) entry: string,
    @Param('imageId', ParseUUIDPipe) image: string,
  ) {
    return new StreamableFile(await this.images.read(channel, entry, image), {
      type: 'image/webp',
      disposition: 'inline',
    });
  }
}
