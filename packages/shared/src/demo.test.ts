import { expect, it } from 'vitest';
import { demoDatasetSchema, demoScreenshotAssets } from './demo';
import { demoSeed } from './demo/seed';
it('keeps the seeded story, moderation tasks and publication sources inside the demo dataset', () => {
  const data = demoDatasetSchema.parse(demoSeed);
  const channelIds = new Set(data.channels.map((c) => c.id));
  const cases = new Map(data.cases.map((c) => [c.id, c]));
  for (const row of [
    ...data.loops,
    ...data.candidates,
    ...data.cases,
    ...data.publications,
  ])
    expect(channelIds.has(row.channelId)).toBe(true);
  for (const row of data.publications) {
    for (const id of row.sourceIds)
      expect(
        data.publications.find(
          (s) =>
            s.id === id &&
            s.channelId === row.channelId &&
            s.status === 'published',
        ),
      ).toBeDefined();
    if (row.promiseId)
      expect(
        data.loops.find(
          (p) => p.id === row.promiseId && p.channelId === row.channelId,
        ),
      ).toBeDefined();
  }
  for (const row of [...data.moderation.repairs, ...data.moderation.flags])
    expect(cases.get(row.caseId)?.channelId).toBe(row.channelId);
  for (const handoff of data.moderation.handoffs)
    for (const item of handoff.items)
      expect(cases.get(item.caseId)?.channelId).toBe(handoff.channelId);
  for (const [channel, overlay] of Object.entries(data.overlays))
    for (const id of overlay.entryIds)
      expect(
        data.publications.find(
          (p) =>
            p.id === id && p.channelId === channel && p.status === 'published',
        ),
      ).toBeDefined();
});
it('rejects live origins and real-session-shaped data at the anonymous demo boundary', () => {
  expect(
    demoDatasetSchema.safeParse({
      ...demoSeed,
      session: { ...demoSeed.session, csrfToken: 'not-a-demo-token' },
    }).success,
  ).toBe(false);
  expect(
    demoDatasetSchema.safeParse({
      ...demoSeed,
      loops: [{ ...demoSeed.loops[0], origin: 'live_twitch' }],
    }).success,
  ).toBe(false);
  expect(demoDatasetSchema.safeParse({ ...demoSeed, version: 2 }).success).toBe(
    false,
  );
});
it('contains no files, active OBS credentials or private moderation text in public story copy', () => {
  expect(
    demoSeed.cases
      .flatMap((c) => c.evidence)
      .every(
        (e) =>
          e.origin === 'demo_fixture' &&
          e.file === null &&
          e.sourceEventId === null,
      ),
  ).toBe(true);
  expect(Object.values(demoSeed.overlays).every((o) => !o.tokenActive)).toBe(
    true,
  );
  const publicCopy = JSON.stringify(
    demoSeed.publications.map((p) => ({
      title: p.title,
      body: p.body,
      chatSummary: p.chatSummary,
    })),
  );
  for (const record of demoSeed.cases) {
    expect(publicCopy).not.toContain(record.subjectReference);
    expect(publicCopy).not.toContain(record.incident);
  }
});

it('seeds usable media examples without claiming the external clip is demo-community footage', () => {
  const data = demoDatasetSchema.parse(demoSeed);
  const image = data.publications.find((entry) => entry.screenshot);
  expect(image?.screenshot?.alt).toContain('Demo');
  expect(demoScreenshotAssets[image!.screenshot!.id]).toBe(
    '/illustrations/memory-party.png',
  );
  const clip = data.publications.find((entry) => entry.clipId);
  expect(clip?.clipId).toBe('IncredulousAbstemiousFennelImGlitch');
  expect(clip?.body).toContain(
    'not footage from this fictional demo community',
  );
});

it('covers the main review states with linked synthetic records', () => {
  const data = demoDatasetSchema.parse(demoSeed);
  expect(new Set(data.loops.map((row) => row.status))).toEqual(
    new Set([
      'confirmed',
      'in_progress',
      'fulfilled',
      'postponed',
      'cancelled',
    ]),
  );
  expect(new Set(data.candidates.map((row) => row.status))).toEqual(
    new Set(['pending', 'confirmed', 'dismissed', 'expired']),
  );
  for (const candidate of data.candidates.filter(
    (row) => row.status === 'confirmed',
  ))
    expect(
      data.loops.some(
        (loop) =>
          loop.id === candidate.confirmedOpenLoopId &&
          loop.channelId === candidate.channelId,
      ),
    ).toBe(true);
  const expired = data.candidates.find((row) => row.status === 'expired')!;
  expect(expired.source.available).toBe(false);
  expect(expired.source.text).toBeNull();
  expect(expired.draft).toBeNull();
  expect(new Set(data.cases.map((row) => row.status))).toEqual(
    new Set(['open', 'reviewing', 'decided']),
  );
  expect(data.publications.some((row) => row.status === 'draft')).toBe(true);
  expect(data.publications.some((row) => row.status === 'unpublished')).toBe(
    true,
  );
  expect(
    data.moderation.repairs.some(
      (row) => row.status === 'completed' && row.completionNote,
    ),
  ).toBe(true);
  expect(
    data.moderation.flags.some(
      (row) => row.status === 'dismissed' && row.reviewNote,
    ),
  ).toBe(true);
  expect(data.moderation.handoffs[0].recentDecisions.length).toBeGreaterThan(0);
  expect(data.moderation.handoffs[0].ruleChanges).toEqual(
    data.moderation.ruleChanges,
  );
  expect(data.moderation.activity.length).toBeGreaterThan(0);
});
