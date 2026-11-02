import { env } from '../config';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Logger,
} from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { catchupJobSchema, queueNames } from '@lore/shared';
import { PublicationsRepository } from '../publications/publications.repository';
import { EventsubClient } from './eventsub.client';
export const catchupQueue = queueNames.catchup;
@Processor(catchupQueue, { concurrency: 1 })
export class CatchupWorker extends WorkerHost {
  constructor(
    @Inject(PublicationsRepository)
    private readonly repository: PublicationsRepository,
    @Inject(EventsubClient) private readonly client: EventsubClient,
  ) {
    super();
  }
  async process(job: Job) {
    const { replyId } = catchupJobSchema.parse(job.data);
    const token = await this.client.appToken();
    const reply = await this.repository.claimReply(replyId);
    if (!reply) return;
    try {
      await this.repository.finishReply(
        replyId,
        await this.client.sendChat(token, reply.broadcasterId, reply.message),
      );
    } catch {
      await this.repository.finishReply(replyId, 'uncertain');
    }
  }
}
@Injectable()
export class CatchupRecovery
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CatchupRecovery.name);
  constructor(
    @Inject(PublicationsRepository)
    private readonly repository: PublicationsRepository,
    @InjectQueue(catchupQueue) private readonly queue: Queue,
  ) {}
  onApplicationBootstrap() {
    void this.recover();
    this.timer = setInterval(() => void this.recover(), 5000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async recover() {
    if (this.running) return;
    this.running = true;
    try {
      await this.repository.recoverReplies();
      for (const row of await this.repository.pendingReplies()) {
        const id = `catchup-${row.id}`;
        const existing = await this.queue.getJob(id);
        if (existing) {
          const state = await existing.getState();
          if (state === 'failed') {
            await this.repository.cancelQueuedReply(row.id);
            continue;
          }
          if (state !== 'completed') continue;
          await existing.remove();
        }
        await this.queue.add(
          'catchup',
          catchupJobSchema.parse({ replyId: row.id }),
          {
            jobId: id,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: {
              age: 86400,
              count: env.QUEUE_JOB_HISTORY_LIMIT,
            },
            removeOnFail: { age: 86400, count: env.QUEUE_JOB_HISTORY_LIMIT },
          },
        );
      }
    } catch {
      this.logger.warn(
        'Catch-up queue recovery unavailable; no chat content logged',
      );
    } finally {
      this.running = false;
    }
  }
}
