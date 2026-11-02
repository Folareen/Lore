import { expect, it } from 'vitest';
import { demoSeed } from '@lore/shared';
import { audiences, demoGuideHref, guides } from './guides';
import { previewPrecedents } from '../../lib/preview-cases';
it('takes every guide task to a valid demo view and existing public story or case', () => {
  for (const audience of audiences)
    for (const step of guides[audience].steps) {
      const url = new URL(demoGuideHref(step.view), 'https://demo.test');
      expect(url.pathname).toBe('/demo');
      expect(url.searchParams.get('view')).toBeTruthy();
      const entry = url.searchParams.get('entry');
      if (entry)
        expect(
          demoSeed.publications.find((row) => row.id === entry)?.status,
        ).toBe('published');
      const caseId = url.searchParams.get('case');
      if (caseId)
        expect(
          demoSeed.cases.some(
            (row) =>
              row.id === caseId &&
              row.channelId === url.searchParams.get('channel'),
          ),
        ).toBe(true);
    }
});
it('does not pretend an unrelated demo decision is a comparable precedent', () => {
  const run = previewPrecedents(demoSeed.cases[2], demoSeed.cases);
  expect(run.matches).toEqual([]);
  expect(run.recommendation).toBeNull();
  expect(
    previewPrecedents(demoSeed.cases[0], demoSeed.cases).matches[0].case.id,
  ).toBe(demoSeed.cases[1].id);
});
