import { expect, it } from 'vitest';
import { updateOverlaySchema } from './overlay';
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const input = {
  expectedVersion: 0,
  enabled: true,
  mode: 'recap',
  entryIds: [first],
  entryVersions: { [first]: 2 },
};
it('requires exactly the selected publication versions for an overlay approval', () => {
  expect(updateOverlaySchema.safeParse(input).success).toBe(true);
  for (const entryVersions of [
    {},
    { [first]: 0 },
    { [first]: 2, [second]: 1 },
    { [second]: 2 },
  ])
    expect(
      updateOverlaySchema.safeParse({ ...input, entryVersions }).success,
    ).toBe(false);
});
it('keeps recap and commitment limits, duplicate rejection and empty hide actions', () => {
  expect(
    updateOverlaySchema.safeParse({ ...input, entryIds: [], entryVersions: {} })
      .success,
  ).toBe(false);
  expect(
    updateOverlaySchema.safeParse({
      ...input,
      enabled: false,
      entryIds: [],
      entryVersions: {},
    }).success,
  ).toBe(true);
  expect(
    updateOverlaySchema.safeParse({ ...input, entryIds: [first, first] })
      .success,
  ).toBe(false);
  const multiple = {
    ...input,
    entryIds: [first, second],
    entryVersions: { [first]: 2, [second]: 3 },
  };
  expect(updateOverlaySchema.safeParse(multiple).success).toBe(false);
  expect(
    updateOverlaySchema.safeParse({ ...multiple, mode: 'open_loops' }).success,
  ).toBe(true);
});
