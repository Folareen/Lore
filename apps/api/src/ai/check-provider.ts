import { env } from '../config';
import { AiFailure, GeminiProvider } from './ai.provider';
async function main() {
  if (!env.GEMINI_API_KEY) {
    console.error(
      'Set GEMINI_API_KEY in the root .env before running ai:check.',
    );
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  try {
    // One small synthetic request; never reads channel data or prints provider content.
    const drafts = await new GeminiProvider().extract([
      {
        id: 'synthetic-check',
        text: 'I will share the community playlist tomorrow.',
      },
    ]);
    console.log(
      `Gemini connection and evidence validation passed (${env.GEMINI_MODEL}; ${drafts.length} suggestions; ${((Date.now() - started) / 1000).toFixed(1)}s).`,
    );
  } catch (error) {
    console.error(
      `Gemini check failed: ${error instanceof AiFailure ? error.code : 'provider_unavailable'}. Check the key, model access and quota.`,
    );
    process.exitCode = 1;
  }
}
void main();
