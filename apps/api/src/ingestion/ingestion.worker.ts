import { env } from '../config';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ingestionJobSchema, queueNames } from '@lore/shared';
import { EventsubRepository } from './eventsub.repository';
import { deliveryJobId } from './ingestion-job';
import { CatchupRecovery } from './catchup.worker';
@Processor(queueNames.ingestion, { concurrency: 4 })
export class IngestionWorker extends WorkerHost {
  private readonly logger = new Logger(IngestionWorker.name);
  constructor(
    @Inject(EventsubRepository) private readonly repository: EventsubRepository,
    @Inject(CatchupRecovery) private readonly catchup: CatchupRecovery,
  ) {
    super();
  }
  async process(job: Job) {
    if (job.name === 'retention') {
      await this.repository.purge();
      return;
    }
    if (job.name !== 'eventsub') throw new Error('Unknown ingestion job');
    const payload = ingestionJobSchema.parse(job.data);
    const queued = await this.repository.process(payload.deliveryId);
    if (queued) void this.catchup.recover();
  }
  @OnWorkerEvent('failed')
  async failed(job: Job | undefined) {
    if (!job || job.attemptsMade < (job.opts.attempts || 1)) return;
    const payload = ingestionJobSchema.safeParse(job.data);
    if (job.name === 'eventsub' && payload.success) {
      try {
        await this.repository.fail(payload.data.deliveryId);
      } catch {
        /* Recovery also detects exhausted queue jobs after database outages. */
      }
    }
    this.logger.error(
      `Ingestion retries exhausted (${job.id}); payload omitted`,
    );
  }
}
@Injectable()
export class IngestionRecovery
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(IngestionRecovery.name);
  constructor(
    @Inject(EventsubRepository) private readonly repository: EventsubRepository,
    @InjectQueue(queueNames.ingestion) private readonly queue: Queue,
  ) {}
  onApplicationBootstrap() {
    void this.recover();
    this.timer = setInterval(() => {
      void this.recover();
    }, 15_000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async recover() {
    if (this.running) return;
    this.running = true;
    try {
      await this.queue.upsertJobScheduler(
        'chat-retention',
        { every: 60_000 },
        {
          name: 'retention',
          data: {},
          opts: { removeOnComplete: 10, removeOnFail: 20 },
        },
      );
      for (const event of await this.repository.pending()) {
        const jobId = deliveryJobId(event.id);
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'failed') await this.repository.fail(event.id);
          else if (state === 'completed') await existing.remove();
          else continue;
          if (state === 'failed') continue;
        }
        await this.queue.add(
          'eventsub',
          ingestionJobSchema.parse({ deliveryId: event.id }),
          {
            jobId,
            removeOnComplete: {
              age: 86400,
              count: env.QUEUE_JOB_HISTORY_LIMIT,
            },
            removeOnFail: {
              age: 7 * 86400,
              count: env.QUEUE_JOB_HISTORY_LIMIT,
            },
          },
        );
      }
    } catch {
      this.logger.warn(
        'Ingestion queue recovery unavailable; durable events will be retried',
      );
    } finally {
      this.running = false;
    }
  }
}
