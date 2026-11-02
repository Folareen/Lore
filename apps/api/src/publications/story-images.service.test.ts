import { expect, it } from 'vitest';
import sharp from 'sharp';
import { normalizeScreenshot } from './story-images.service';
it('decodes and normalizes screenshots, resizes large images and strips metadata', async () => {
  const input = await sharp({
    create: { width: 2500, height: 10, channels: 3, background: '#9146ff' },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const result = await normalizeScreenshot({
    buffer: input,
    mimetype: 'image/png',
  });
  const meta = await sharp(result).metadata();
  expect(meta.format).toBe('webp');
  expect(meta.width).toBe(2400);
  expect(meta.exif).toBeUndefined();
});
it('rejects executable formats, forged mime types and oversized uploads', async () => {
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#9146ff' },
  })
    .png()
    .toBuffer();
  for (const file of [
    {
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      mimetype: 'image/svg+xml',
    },
    { buffer: image, mimetype: 'image/jpeg' },
    { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'image/png' },
    { buffer: Buffer.from('not an image'), mimetype: 'image/png' },
  ])
    await expect(normalizeScreenshot(file)).rejects.toThrow();
});
