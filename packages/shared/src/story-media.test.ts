import { expect, it } from 'vitest';
import { twitchClipIdFromUrl, twitchClipIdSchema } from './story-media';
it('accepts Twitch clip share links and strips tracking parameters', () => {
  expect(
    twitchClipIdFromUrl(
      'https://clips.twitch.tv/GardenCrew-abc_123?tt_content=clip',
    ),
  ).toBe('GardenCrew-abc_123');
  expect(
    twitchClipIdFromUrl(
      'https://www.twitch.tv/cozybyte/clip/GardenCrew-abc_123',
    ),
  ).toBe('GardenCrew-abc_123');
  expect(twitchClipIdFromUrl('')).toBeNull();
});
it('rejects arbitrary hosts, non-HTTPS links, embeds, credentials and injected clip IDs', () => {
  for (const url of [
    'https://clips.twitch.tv.evil.example/Clip',
    'javascript:alert(1)',
    'http://clips.twitch.tv/Clip',
    'https://user@clips.twitch.tv/Clip',
    'https://clips.twitch.tv/embed?clip=Clip',
    'https://twitch.tv/videos/123',
  ])
    expect(() => twitchClipIdFromUrl(url)).toThrow();
  expect(twitchClipIdSchema.safeParse('Clip&autoplay=true').success).toBe(
    false,
  );
});
