import { z } from 'zod';
export const twitchClipIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
export const storyScreenshotSchema = z.strictObject({
  id: z.uuid(),
  alt: z.string().trim().min(1).max(200),
});
export function twitchClipIdFromUrl(value: string): string | null {
  if (!value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Paste a valid HTTPS Twitch clip link.');
  }
  let id: string | undefined;
  if (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.port
  ) {
    if (url.hostname === 'clips.twitch.tv')
      id = /^\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1];
    else if (url.hostname === 'www.twitch.tv' || url.hostname === 'twitch.tv')
      id = /^\/[A-Za-z0-9_]+\/clip\/([A-Za-z0-9_-]+)\/?$/.exec(
        url.pathname,
      )?.[1];
  }
  if (id === 'embed' || !twitchClipIdSchema.safeParse(id).success)
    throw new Error(
      'Use a clips.twitch.tv link or a channel’s Twitch clip link.',
    );
  return twitchClipIdSchema.parse(id);
}
export const screenshotUploadSchema = z.strictObject({
  expectedVersion: z.coerce.number().int().positive(),
  alt: z.string().trim().min(1).max(200),
});
