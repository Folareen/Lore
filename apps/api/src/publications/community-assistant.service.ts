import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  communityAnswerSchema,
  type CommunityAnswer,
  type communityQuestionSchema,
} from '@lore/shared';
import type { z } from 'zod';
import { AiProvider } from '../ai/ai.provider';
import { env } from '../config';
import { InfrastructureService } from '../infrastructure.service';
import { PublicationsRepository } from './publications.repository';
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const unknownCommunityAnswer: CommunityAnswer = {
  answer:
    'I couldn’t find that in the community’s published stories. Try asking about a story or reference shared here, or ask the streamer in chat.',
  sources: [],
  grounded: false,
};
// Atomically reserve every budget before a provider request, including failed calls.
const reserveBudget = `
for i = 1, #KEYS do
  local current = tonumber(redis.call('GET', KEYS[i]) or '0')
  if current >= tonumber(ARGV[i]) then return 0 end
end
for i = 1, #KEYS do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('EXPIRE', KEYS[i], tonumber(ARGV[#KEYS + i])) end
end
return 1`;
@Injectable()
export class CommunityAssistantService {
  constructor(
    @Inject(PublicationsRepository)
    private readonly publications: PublicationsRepository,
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(AiProvider) private readonly ai: AiProvider,
  ) {}
  async status(slug: string) {
    const context = await this.publications.assistantContext(slug, '');
    return { enabled: context.enabled && Boolean(env.GEMINI_API_KEY) };
  }
  async ask(slug: string, input: z.infer<typeof communityQuestionSchema>) {
    const search = [...input.previousQuestions, input.question].join(' ');
    const context = await this.publications.assistantContext(slug, search);
    if (!context.enabled)
      throw new ConflictException(
        'Community Q&A is not enabled for this channel.',
      );
    if (!env.GEMINI_API_KEY)
      throw new ServiceUnavailableException(
        'Community Q&A is temporarily unavailable.',
      );
    if (!context.sources.length) return unknownCommunityAnswer;
    const snapshot = digest(context);
    const prefix = `${env.QUEUE_PREFIX}:community-assistant`;
    const cacheKey = `${prefix}:answer:${digest({ snapshot, input, model: env.GEMINI_COMMUNITY_MODEL })}`;
    let cached: string | null;
    try {
      cached = await this.infrastructure.redis.get(cacheKey);
      if (!cached) {
        const day = new Date().toISOString().slice(0, 10);
        const minute = Math.floor(Date.now() / 60_000);
        const reserved = await this.infrastructure.redis.eval(
          reserveBudget,
          3,
          `${prefix}:minute:${context.channelId}:${minute}`,
          `${prefix}:day:${context.channelId}:${day}`,
          `${prefix}:global:${day}`,
          12,
          env.COMMUNITY_AI_DAILY_LIMIT,
          env.COMMUNITY_AI_GLOBAL_DAILY_LIMIT,
          120,
          172800,
          172800,
        );
        if (Number(reserved) !== 1)
          throw new HttpException(
            'Community Q&A is taking a break. Please try again later or browse the stories.',
            429,
          );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Community Q&A is temporarily unavailable.',
      );
    }
    let answer: CommunityAnswer;
    if (cached) {
      answer = communityAnswerSchema.parse(JSON.parse(cached));
    } else {
      try {
        const output = await this.ai.answerCommunity(
          input.question,
          input.previousQuestions,
          context.sources,
        );
        const ids = [
          ...new Set(output.citations.map((citation) => citation.id)),
        ];
        answer =
          output.answer && ids.length
            ? {
                answer: output.answer,
                sources: ids.map((id) => {
                  const source = context.sources.find(
                    (source) => source.id === id,
                  );
                  if (!source) throw new Error('Invalid public source');
                  return { id: source.id, title: source.title };
                }),
                grounded: true,
              }
            : unknownCommunityAnswer;
      } catch {
        throw new ServiceUnavailableException(
          'Community Q&A could not answer. Please try again shortly.',
        );
      }
    }
    // Consent, connection and publication can change while Gemini is answering.
    const current = await this.publications.assistantContext(slug, search);
    if (digest(current) !== snapshot)
      throw new ConflictException(
        'The community stories changed. Please ask again.',
      );
    if (!cached) {
      // A cache failure must not discard an otherwise valid answer or retry a paid call.
      await this.infrastructure.redis
        .set(cacheKey, JSON.stringify(answer), 'EX', 900)
        .catch(() => undefined);
    }
    return answer;
  }
}
