import { AiFailure } from './ai-error';
export async function modelJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 45_000,
): Promise<unknown> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AiFailure('provider_unavailable');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new AiFailure('invalid_output');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128_000) {
        await reader.cancel();
        throw new AiFailure('invalid_output');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof AiFailure) throw error;
    if (error instanceof SyntaxError) throw new AiFailure('invalid_output');
    throw new AiFailure('provider_unavailable');
  }
}
