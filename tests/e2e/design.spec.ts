import { test, expect } from '@playwright/test';
const views = [
  'overview',
  'streamer',
  'brief',
  'candidates',
  'moderation',
  'workflows',
  'publications',
  'community',
  'overlay',
  'settings',
  'team',
  'account',
];
for (const width of [390, 1440]) {
  test(`workspace views fit ${width}px in both themes`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({
        colorScheme: theme === 'light' ? 'light' : 'dark',
      });
      await page.goto('/demo');
      await page.evaluate((value) => {
        localStorage.setItem('lore-theme', value);
      }, theme);
      for (const view of views) {
        await page.goto(`/demo?view=${view}`);
        await expect(page.locator('main h1')).toBeVisible();
        await expect(page.locator('main')).not.toContainText(
          'coming in later chapters',
        );
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        if (
          [
            'streamer',
            'publications',
            'community',
            'moderation',
            'settings',
          ].includes(view)
        )
          await page.screenshot({
            path: info.outputPath(`${width}-${theme}-${view}.png`),
            fullPage: true,
            animations: 'disabled',
          });
      }
    }
  });
}
test('landing content, optional memory game, FAQ and tour work on mobile', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'The stream ends.',
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const arrival = await page
    .locator('.newcomer-arrival blockquote')
    .boundingBox();
  expect(arrival?.width).toBeGreaterThan(160);
  await expect(
    page.getByRole('heading', {
      name: 'You don’t have to have been there.',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText('Do I need a Twitch account?', { exact: true }).click();
  await expect(
    page.getByText(
      /Viewers can read published community pages without signing in/,
    ),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Play a quick round', exact: true })
    .click();
  await page.getByRole('button', { name: 'Turn card 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Turn card 1', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'New round', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Turn card 1', exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: info.outputPath('landing-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('link', { name: 'Take a look around', exact: true })
    .click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(
    page.getByRole('heading', { name: /One community.*Fewer loose ends/ }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('how-it-works-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const closing = await page.locator('.closing-section h2').boundingBox();
  expect(closing).not.toBeNull();
  expect(Math.abs(closing!.x + closing!.width / 2 - 720)).toBeLessThan(2);
  await page.screenshot({
    path: info.outputPath('landing-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.evaluate(() => localStorage.setItem('lore-theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('landing-desktop-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
test('mobile workspace navigation opens, closes with Escape and follows a destination', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await expect(
    page.getByRole('navigation', { name: 'Workspace navigation' }),
  ).toBeHidden();
  await trigger.click();
  await expect(
    page.getByRole('button', { name: 'Close navigation' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Account', exact: true })
    .focus();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Open loops', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Open loops', exact: true }),
  ).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const card = page.getByRole('article').first();
  await expect(card.getByLabel('Next status')).toBeHidden();
  await card.getByText('Change status', { exact: true }).click();
  await card.getByLabel('Next status').selectOption('fulfilled');
  await expect(card.getByLabel('Reason (required)')).toBeVisible();
  const input = page.getByLabel('What did we promise?');
  expect(
    await input.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeGreaterThanOrEqual(16);
});

test('narrow phones and tablets keep marketing and core tasks within the viewport', async ({
  page,
}) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      '/',
      '/how-it-works',
      '/demo?view=streamer',
      '/demo?view=publications',
    ]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  }
});

test('case detail and sign-in remain readable on phones and desktops', async ({
  page,
}, info) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo?view=moderation');
    await page.locator('.case-list-row').first().click();
    await expect(page.locator('main h1')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath(`case-detail-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Welcome in.', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath(`sign-in-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
});
