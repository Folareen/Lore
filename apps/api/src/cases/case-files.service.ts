import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '../config';
import { caseEvidence, channels, evidence } from '../database/schema';
import { CaseActor, CasesRepository } from './cases.repository';
export function validateEvidenceFile(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}) {
  const data = file.buffer;
  if (!data.length || data.length > 5 * 1024 * 1024)
    throw new BadRequestException('Use a file between 1 byte and 5 MB');
  const types: Record<string, boolean> = {
    'image/png': data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': data.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    'application/pdf': data.subarray(0, 5).toString() === '%PDF-',
    'text/plain': false,
  };
  if (file.mimetype === 'text/plain') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
      types['text/plain'] = !data.includes(0);
    } catch {
      /* Invalid UTF-8 is rejected below. */
    }
  }
  if (!types[file.mimetype])
    throw new BadRequestException(
      'Upload a PNG, JPEG, PDF, or UTF-8 text file matching its content type',
    );
  const name =
    file.originalname
      .split(/[\\/]/)
      .pop()!
      .replace(/[^a-zA-Z0-9 ._()-]/g, '_')
      .slice(0, 150) || 'evidence';
  return {
    name,
    type: file.mimetype,
    size: data.length,
    checksum: createHash('sha256').update(data).digest('hex'),
  };
}
@Injectable()
export class CaseFileStorage implements OnApplicationShutdown {
  readonly configured = Boolean(
    env.R2_ACCOUNT_ID &&
    env.R2_BUCKET &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY,
  );
  private readonly client = this.configured
    ? new S3Client({
        endpoint:
          env.R2_TEST_ENDPOINT ||
          `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        region: 'auto',
        forcePathStyle: true,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID!,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        },
        maxAttempts: 2,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
      })
    : null;
  onApplicationShutdown() {
    this.client?.destroy();
  }
  private required() {
    if (!this.client)
      throw new ServiceUnavailableException(
        'R2 evidence storage is not configured',
      );
    return this.client;
  }
  async put(key: string, buffer: Buffer, type: string) {
    await this.required().send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: type,
        ContentLength: buffer.length,
      }),
    );
  }
  async remove(key: string) {
    await this.required().send(
      new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
    );
  }
  async assertAvailable(key: string) {
    try {
      await this.required().send(
        new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFound')
        throw new NotFoundException('The evidence file is unavailable');
      throw new ServiceUnavailableException('Could not reach evidence storage');
    }
  }
  async sign(key: string, name: string) {
    return getSignedUrl(
      this.required(),
      new GetObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${name}"`,
        ResponseContentType: 'application/octet-stream',
      }),
      { expiresIn: 60 },
    );
  }
}
@Injectable()
export class CaseFilesService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CaseFilesService.name);
  constructor(
    @Inject(CasesRepository) private readonly repository: CasesRepository,
    @Inject(CaseFileStorage) private readonly storage: CaseFileStorage,
  ) {}
  async upload(
    channelId: string,
    actor: CaseActor,
    caseId: string,
    input: { expectedVersion: number; requestId: string; label: string },
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    if (!this.storage.configured)
      throw new ServiceUnavailableException(
        'Configure R2 before uploading evidence files',
      );
    const metadata = validateEvidenceFile(file);
    const link = await this.repository.reserveFile(
      channelId,
      actor,
      caseId,
      input,
      metadata,
    );
    if (link.fileState === 'ready')
      return this.repository.get(channelId, actor.id, caseId);
    try {
      await this.storage.put(link.storageKey!, file.buffer, metadata.type);
      return await this.repository.finishFile(
        channelId,
        actor,
        caseId,
        link.id,
        input.expectedVersion,
      );
    } catch (error) {
      await this.repository.abandonFile(channelId, link.id);
      void this.cleanup();
      // Known HTTP conflicts/authorization errors keep their status; storage internals never reach a response.
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Evidence upload failed. Refresh the case and try again',
      );
    }
  }
  async download(
    channelId: string,
    userId: string,
    caseId: string,
    fileId: string,
  ) {
    const file = await this.repository.file(channelId, userId, caseId, fileId);
    await this.storage.assertAvailable(file.storageKey!);
    await this.repository.file(channelId, userId, caseId, fileId);
    return {
      url: await this.storage.sign(file.storageKey!, file.fileName!),
      expiresIn: 60,
    };
  }
  onApplicationBootstrap() {
    void this.cleanup();
    this.timer = setInterval(() => {
      void this.cleanup();
    }, 60_000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async cleanup() {
    if (this.running || !this.storage.configured) return;
    this.running = true;
    try {
      const db = this.repository.infrastructure.db;
      const rows = await db
        .select()
        .from(caseEvidence)
        .where(
          sql`${caseEvidence.storageKey} IS NOT NULL AND (${caseEvidence.removedAt} IS NOT NULL OR (${caseEvidence.fileState}='pending' AND ${caseEvidence.uploadExpiresAt}<=now()))`,
        )
        .limit(100);
      for (const row of rows) {
        const key = await db.transaction(async (tx) => {
          await tx
            .select()
            .from(channels)
            .where(eq(channels.id, row.channelId))
            .for('update');
          const [current] = await tx
            .select()
            .from(caseEvidence)
            .where(
              and(
                eq(caseEvidence.channelId, row.channelId),
                eq(caseEvidence.id, row.id),
              ),
            );
          if (!current || current.fileState === 'ready' || !current.storageKey)
            return null;
          if (
            !current.removedAt &&
            current.uploadExpiresAt &&
            current.uploadExpiresAt > new Date()
          )
            return null;
          await tx
            .update(caseEvidence)
            .set({ removedAt: new Date(), fileState: 'removed' })
            .where(eq(caseEvidence.id, row.id));
          await tx
            .update(evidence)
            .set({ excerpt: '', sourceEventId: null })
            .where(
              and(
                eq(evidence.channelId, row.channelId),
                eq(evidence.id, row.evidenceId),
              ),
            );
          return current.storageKey;
        });
        if (key) {
          await this.storage.remove(key);
          await db
            .update(caseEvidence)
            .set({ storageKey: null })
            .where(
              and(
                eq(caseEvidence.channelId, row.channelId),
                eq(caseEvidence.id, row.id),
                eq(caseEvidence.fileState, 'removed'),
              ),
            );
        }
      }
    } catch {
      this.logger.warn(
        'Evidence object cleanup unavailable; private cleanup references retained',
      );
    } finally {
      this.running = false;
    }
  }
}
