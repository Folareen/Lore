import { env } from '../config';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { aiJobSchema, queueNames } from '@lore/shared';
import { AiFailure, AiProvider } from './ai.provider';
import { AiRepository } from './ai.repository';
@Processor(queueNames.ai, { concurrency: 2 })
export class AiWorker extends WorkerHost {
  constructor(
    @Inject(AiProvider) private readonly provider: AiProvider,
    @Inject(AiRepository) private readonly repository: AiRepository,
  ) {
    super();
  }
  async process(job: Job) {
    if (job.name !== 'extract') throw new Error('Unknown AI job');
    const { runId, revision } = aiJobSchema.parse(job.data);
    const sources = await this.repository.begin(runId, revision);
    if (!sources) return;
    try {
      const drafts = await this.provider.extract(sources);
      await this.repository.complete(runId, revision, sources, drafts);
    } catch (error) {
      const code =
        error instanceof AiFailure ? error.code : 'provider_unavailable';
      await this.repository.fail(
        runId,
        revision,
        code,
        job.attemptsMade + 1 >= (job.opts.attempts || 1),
      );
      // BullMQ persists this message. Never put provider responses or raw chat into it.
      // eslint-disable-next-line preserve-caught-error -- BullMQ persists causes; omit private provider and database details.
      throw new Error(code);
    }
  }
}
@Injectable()
export class AiRecovery
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(AiRecovery.name);
  constructor(
    @Inject(AiRepository) private readonly repository: AiRepository,
    @InjectQueue(queueNames.ai) private readonly queue: Queue,
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
      for (const channel of await this.repository.enabledChannels())
        await this.repository.schedule(channel.id);
      for (const run of await this.repository.pending()) {
        const jobId = `ai-${run.id}-${run.revision}`;
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'failed') {
            await this.repository.fail(
              run.id,
              run.revision,
              run.error || 'provider_unavailable',
              true,
            );
            continue;
          }
          if (state !== 'completed') continue;
          await existing.remove();
        }
        await this.queue.add(
          'extract',
          aiJobSchema.parse({ runId: run.id, revision: run.revision }),
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
      this.logger.warn('AI recovery unavailable; durable runs will be retried');
    } finally {
      this.running = false;
    }
  }
}
