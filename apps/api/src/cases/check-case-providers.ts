import { randomUUID } from 'node:crypto';
import { env } from '../config';
import { GeminiProvider, AiFailure } from '../ai/ai.provider';
import { CaseFileStorage } from './case-files.service';
async function main() {
  const run = async (
    name: string,
    configured: boolean,
    check: () => Promise<void>,
  ) => {
    if (!configured) {
      console.log(`${name}: skipped (credentials not configured).`);
      return;
    }
    try {
      await check();
      console.log(`${name}: passed.`);
    } catch (error) {
      console.error(
        `${name}: failed (${error instanceof AiFailure ? error.code : 'connection_or_permissions'}).`,
      );
      process.exitCode = 1;
    }
  };
  // Synthetic fixtures only; configured model checks each use one provider request outside channel budgets.
  await run(
    'Gemini 768-dimensional embedding',
    Boolean(env.GEMINI_API_KEY),
    async () => {
      await new GeminiProvider().embed(
        'Synthetic review: a story spoiler was posted before a clear reminder.',
        'query',
      );
    },
  );
  await run(
    'Gemini structured case recommendation',
    Boolean(env.GEMINI_API_KEY),
    async () => {
      const id = randomUUID();
      await new GeminiProvider().reason(
        {
          currentCase: {
            id,
            incident:
              'Synthetic incomplete incident note. No wrongdoing is established.',
            rule: { version: 'demo', text: 'Review evidence before deciding.' },
          },
          evidence: [],
          precedents: [],
          limitations: 'Synthetic connection check; no real person or case.',
        },
        [id],
      );
    },
  );
  const storage = new CaseFileStorage();
  await run(
    'Private R2 object write/read/delete',
    storage.configured,
    async () => {
      const key = `lore-synthetic-checks/${randomUUID()}`;
      try {
        await storage.put(
          key,
          Buffer.from('Synthetic Lore connection check.'),
          'text/plain',
        );
        await storage.assertAvailable(key);
        const url = await storage.sign(key, 'synthetic-check.txt');
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
          redirect: 'error',
        });
        if (
          !response.ok ||
          (await response.text()) !== 'Synthetic Lore connection check.'
        )
          throw new Error('Synthetic object read did not match');
      } finally {
        await storage.remove(key);
      }
    },
  );
  storage.onApplicationShutdown();
}
void main();
