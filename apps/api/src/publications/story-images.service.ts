import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { and, eq, sql } from 'drizzle-orm';
import { CaseFileStorage } from '../cases/case-files.service';
import { PublicationsRepository } from './publications.repository';
import { publicationImages } from '../database/schema';
import type { CaseActor } from '../cases/cases.repository';
export async function normalizeScreenshot(file: {
  buffer: Buffer;
  mimetype: string;
}) {
  if (
    !file.buffer.length ||
    file.buffer.length > 5 * 1024 * 1024 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)
  )
    throw new BadRequestException(
      'Choose a PNG, JPEG or WebP image up to 5 MB.',
    );
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 16000000,
      failOn: 'warning',
    });
    const meta = await image.metadata();
    if (
      !['png', 'jpeg', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) !== 1 ||
      `image/${meta.format}` !== file.mimetype
    )
      throw new Error('Invalid image');
    const result = await image
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
    if (result.length > 5 * 1024 * 1024) throw new Error('Image too large');
    return result;
  } catch {
    throw new BadRequestException(
      'The screenshot could not be read. Use a still PNG, JPEG or WebP image under 16 megapixels.',
    );
  }
}
@Injectable()
export class StoryImagesService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(StoryImagesService.name);
  constructor(
    @Inject(PublicationsRepository)
    private readonly repository: PublicationsRepository,
    @Inject(CaseFileStorage) private readonly storage: CaseFileStorage,
  ) {}
  async upload(
    channelId: string,
    actor: CaseActor,
    entryId: string,
    input: { expectedVersion: number; alt: string },
    file: { buffer: Buffer; mimetype: string },
  ) {
    if (!this.storage.configured)
      throw new ServiceUnavailableException(
        'Configure R2 before uploading screenshots.',
      );
    const image = await normalizeScreenshot(file);
    const reserved = await this.repository.reserveScreenshot(
      channelId,
      actor,
      entryId,
      input.expectedVersion,
      input.alt,
    );
    try {
      await this.storage.put(reserved.key, image, 'image/webp');
      return await this.repository.finishScreenshot(
        channelId,
        actor,
        entryId,
        input.expectedVersion,
        reserved.id,
      );
    } catch (error) {
      await this.repository.infrastructure.db
        .update(publicationImages)
        .set({ state: 'removed', storageKey: reserved.key })
        .where(eq(publicationImages.id, reserved.id));
      void this.cleanup();
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Screenshot upload failed. Reload the story and try again.',
      );
    }
  }
  async read(
    channel: string,
    entryId: string,
    imageId: string,
    userId?: string,
  ) {
    const image = await this.repository.screenshot(
      channel,
      entryId,
      imageId,
      userId,
    );
    let buffer: Buffer;
    try {
      buffer = await this.storage.read(image.storageKey!);
    } catch {
      throw new ServiceUnavailableException('Screenshot unavailable.');
    }
    // Recheck publication/access after R2 I/O; never issue a reusable public bucket URL.
    await this.repository.screenshot(channel, entryId, imageId, userId);
    return buffer;
  }
  onApplicationBootstrap() {
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), 60000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    clearInterval(this.timer);
  }
  async cleanup() {
    if (this.running || !this.storage.configured) return;
    this.running = true;
    try {
      const db = this.repository.infrastructure.db;
      await db
        .update(publicationImages)
        .set({ state: 'removed' })
        .where(
          and(
            eq(publicationImages.state, 'pending'),
            sql`${publicationImages.expiresAt} <= now()`,
          ),
        );
      const rows = await db
        .select()
        .from(publicationImages)
        .where(
          and(
            eq(publicationImages.state, 'removed'),
            sql`${publicationImages.storageKey} IS NOT NULL`,
          ),
        )
        .limit(100);
      for (const row of rows) {
        await this.storage.remove(row.storageKey!);
        await db
          .update(publicationImages)
          .set({ storageKey: null, alt: '' })
          .where(
            and(
              eq(publicationImages.id, row.id),
              eq(publicationImages.state, 'removed'),
            ),
          );
      }
    } catch {
      this.logger.warn(
        'Screenshot cleanup unavailable; cleanup references retained',
      );
    } finally {
      this.running = false;
    }
  }
}
