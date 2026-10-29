import { z } from 'zod';
export const overlayModeSchema = z.enum(['recap', 'open_loops']);
export const overlaySettingsSchema = z.strictObject({
  version: z.number().int().nonnegative(),
  enabled: z.boolean(),
  mode: overlayModeSchema,
  entryIds: z.array(z.uuid()).max(3),
  tokenActive: z.boolean(),
});
export const updateOverlaySchema = z
  .strictObject({
    expectedVersion: z.number().int().nonnegative(),
    enabled: z.boolean(),
    mode: overlayModeSchema,
    entryIds: z.array(z.uuid()).max(3),
  })
  .superRefine((v, ctx) => {
    if (
      new Set(v.entryIds).size !== v.entryIds.length ||
      (v.enabled &&
        (v.entryIds.length === 0 ||
          (v.mode === 'recap' && v.entryIds.length !== 1)))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Choose one recap or up to three public commitments.',
      });
  });
export const overlayTokenActionSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
});
export const overlayTokenSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  settings: overlaySettingsSchema,
});
export const overlayDisplaySchema = z.strictObject({
  channel: z.string(),
  mode: overlayModeSchema,
  items: z
    .array(
      z.strictObject({
        id: z.uuid(),
        title: z.string(),
        text: z.string(),
      }),
    )
    .max(3),
});
export type OverlaySettings = z.infer<typeof overlaySettingsSchema>;
export type OverlayDisplay = z.infer<typeof overlayDisplaySchema>;
