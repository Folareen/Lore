import { test, expect } from '@playwright/test';
for (const width of [320, 390, 1440]) {
  test(`anonymous channel discovery works at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.goto('/discover');
      await page.evaluate(
        (value) => localStorage.setItem('lore-theme', value),
        theme,
      );
      await page.goto('/discover');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Find your next community.',
      );
      const form = page.getByRole('search', { name: 'Find a community' });
      await form
        .getByRole('searchbox', { name: 'Search channels' })
        .fill('DISCOVERY FIXTURE');
      await form.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Results for “DISCOVERY FIXTURE”' }),
      ).toBeVisible();
      await expect(page.locator('.discover-card')).toHaveCount(12);
      await expect(page.locator('main')).not.toContainText('PRIVATE-QA-ONLY');
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`discover-${width}-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole('link', { name: 'More communities', exact: true })
        .click();
      await expect(page.locator('.discover-card')).toHaveCount(2);
      await expect(
        page.getByRole('article', { name: 'Discovery fixture 13' }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Back to first page' }).click();
      const card = page.getByRole('article', {
        name: 'Discovery fixture 01',
        exact: true,
      });
      await card.getByRole('link', { name: 'Catch up', exact: true }).click();
      await expect(page).toHaveURL(/\/c\/discovery-fixture-01\/catch-up$/);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'Discovery fixture 01',
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`discover-channel-${width}-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole('link', { name: 'Discover communities', exact: true })
        .click();
      await page
        .getByRole('searchbox', { name: 'Search channels' })
        .fill('There is no such community here');
      await page
        .getByRole('search', { name: 'Find a community' })
        .getByRole('button', { name: 'Search', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'No community found yet' }),
      ).toBeVisible();
      await page
        .getByRole('link', { name: 'Browse all communities', exact: true })
        .click();
      await expect(page.locator('.discover-card').first()).toBeVisible();
    }
    await page.goto('/');
    if (width <= 850)
      await page.getByLabel('Explore Lore', { exact: true }).click();
    const nav = page.getByRole('navigation', {
      name: width <= 850 ? 'Mobile site navigation' : 'Main navigation',
      exact: true,
    });
    await nav.getByRole('link', { name: /Discover/ }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}
test('discovery rejects oversized queries with a useful way back to search', async ({
  page,
}) => {
  await page.goto(`/discover?q=${'x'.repeat(101)}`);
  await expect(
    page.getByText('Search using up to 100 characters.'),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Start a new search', exact: true })
    .click();
  await expect(
    page.getByRole('searchbox', { name: 'Search channels' }),
  ).toBeVisible();
});
