import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { caseAiJobSchema, queueNames } from '@lore/shared';
import { AiProvider, AiFailure } from '../ai/ai.provider';
import {
  CaseAiRepository,
  caseContext,
  embeddingText,
} from './case-ai.repository';
@Processor(queueNames.caseAi, { concurrency: 1 })
export class CaseAiWorker extends WorkerHost {
  constructor(
    @Inject(AiProvider) private readonly provider: AiProvider,
    @Inject(CaseAiRepository) private readonly repository: CaseAiRepository,
  ) {
    super();
  }
  async process(job: Job) {
    if (job.name !== 'case-ai') throw new Error('Unknown case AI job');
    const { runId, revision } = caseAiJobSchema.parse(job.data);
    const context = await this.repository.begin(runId, revision);
    if (!context) return;
    const { run, record } = context;
    try {
      if (!(await this.repository.reserveCall(run))) return;
      const vector = await this.provider.embed(
        embeddingText(record),
        run.kind === 'index' ? 'document' : 'query',
      );
      if (run.kind === 'index') {
        await this.repository.saveIndex(run, vector);
        return;
      }
      const result = await this.repository.rank(run, vector);
      if (!result) return;
      if (!(await this.repository.reserveCall(run))) return;
      const sources = [record.id, ...result.matches.map((m) => m.record.id)];
      const recommendation = await this.provider.reason(
        {
          currentCase: caseContext(record),
          evidence: result.evidence,
          additionalEvidenceOmitted: result.additionalEvidenceOmitted,
          precedents: result.matches.map((m) => caseContext(m.record)),
          indexedPriorDecisions: result.indexedCount,
          totalPriorDecisions: result.eligibleCount,
        },
        sources,
      );
      await this.repository.complete(run, result, recommendation);
    } catch (error) {
      const code =
        error instanceof AiFailure ? error.code : 'provider_unavailable';
      await this.repository.fail(
        runId,
        revision,
        code,
        job.attemptsMade + 1 >= (job.opts.attempts || 1),
      );
      // eslint-disable-next-line preserve-caught-error -- Queue errors must omit private case data and provider responses.
      throw new Error(code);
    }
  }
}
@Injectable()
export class CaseAiRecovery
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CaseAiRecovery.name);
  constructor(
    @Inject(CaseAiRepository) private readonly repository: CaseAiRepository,
    @InjectQueue(queueNames.caseAi) private readonly queue: Queue,
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
      for (const run of await this.repository.pending()) {
        const jobId = `case-${run.id}-${run.revision}`;
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
          'case-ai',
          caseAiJobSchema.parse({ runId: run.id, revision: run.revision }),
          {
            jobId,
            removeOnComplete: { age: 86400, count: 1000 },
            removeOnFail: { age: 7 * 86400, count: 1000 },
          },
        );
      }
    } catch {
      this.logger.warn('Case AI recovery unavailable; durable work retained');
    } finally {
      this.running = false;
    }
  }
}
