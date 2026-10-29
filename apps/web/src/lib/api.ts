import { z } from 'zod';
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: {
    method?: string;
    body?: unknown;
    csrfToken?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const multipart =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
      headers: {
        ...(options.body !== undefined && !multipart
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}),
      },
      ...(options.body !== undefined
        ? {
            body: multipart
              ? (options.body as FormData)
              : JSON.stringify(options.body),
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(
      'We couldn’t reach Lore. Check your connection and try again.',
      0,
    );
  }
  if (!response.ok) {
    let message =
      response.status === 401
        ? 'Your session has ended. Please sign in again.'
        : 'That didn’t go through. Please try again.';
    const body = z
      .object({ message: z.string().optional() })
      .safeParse(await response.json().catch(() => null));
    if (
      body.success &&
      body.data.message &&
      [400, 403, 404, 409, 429].includes(response.status)
    )
      message = body.data.message;
    if (response.status === 503)
      message =
        'Lore’s connection is taking a break. Please try again shortly.';
    throw new ApiError(message, response.status);
  }
  let body: unknown;
  try {
    body = response.status === 204 ? undefined : await response.json();
  } catch {
    throw new ApiError(
      'Lore returned a response we couldn’t read. Please try again.',
      502,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      'Lore returned a response we couldn’t read. Please try again.',
      502,
    );
  return parsed.data;
}
