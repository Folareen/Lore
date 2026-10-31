import { chooseSelect } from './select-control';
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
  await page.evaluate(() => scrollTo(0, 0));
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
  await page.locator('.memory-game').screenshot({
    path: info.outputPath('game-desktop.png'),
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
  await chooseSelect(page, card.getByLabel('Next status'), 'fulfilled');
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

test('marketing headers stay fixed and tour layout and anchor navigation stay clear', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/how-it-works']) {
      await page.goto(path);
      const header = page.locator('.marketing-header');
      const title = page.locator('main h1');
      const initialHeader = await header.boundingBox();
      const heading = await title.boundingBox();
      expect(heading!.y).toBeGreaterThanOrEqual(initialHeader!.height);
      await page.evaluate(() => scrollTo(0, 600));
      await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
      if (path === '/how-it-works') {
        expect(
          await title.evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          ),
        ).toBeLessThanOrEqual(68);
        const steps = await page.locator('.how-steps').boundingBox();
        const intro = await page.locator('.how-intro').boundingBox();
        expect(Math.abs(steps!.x - intro!.x)).toBeLessThan(2);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath(`tour-${width}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
    if (width === 390) {
      await page.getByLabel('Explore Lore', { exact: true }).click();
      const menu = page.getByRole('navigation', {
        name: 'Mobile site navigation',
      });
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await page.getByLabel('Explore Lore', { exact: true }).click();
      await menu.getByRole('link', { name: 'Questions', exact: true }).click();
      await expect(menu).toBeHidden();
    } else {
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'Questions', exact: true })
        .click();
    }
    await expect(page).toHaveURL(/\/#questions$/);
    await expect
      .poll(async () => {
        const section = await page.locator('#questions').boundingBox();
        const header = await page.locator('.marketing-header').boundingBox();
        return section!.y >= header!.height;
      })
      .toBe(true);
  }
});

test('demo uses the real workspace, fixed headers and keyboard-accessible custom selects', async ({
  page,
}, info) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo');
    await expect(
      page.getByRole('heading', { name: 'Hey, cozybyte.', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'The next stream remembers.' }),
    ).toHaveCount(0);
    await expect(page.locator('.demo-session-bar')).toBeVisible();
    await expect(page.locator('.demo-toolbar')).toHaveCount(0);
    const header = page.locator('.workspace-topbar');
    const heading = await page.locator('main h1').boundingBox();
    const top = await header.boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(top!.y + top!.height);
    await page.evaluate(() => scrollTo(0, 600));
    await expect
      .poll(async () => (await header.boundingBox())!.y)
      .toBe(width === 390 ? 68 : 0);
    await page.goto('/demo?view=moderation');
    const filter = page.getByRole('combobox', { name: 'Case status' });
    await filter.click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    const bounds = await list.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await page.screenshot({
      path: info.outputPath(`select-${width}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('End');
    await expect(
      page.getByRole('option', { name: 'Decided', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(filter).toHaveText('Decided');
    await expect(filter).toBeFocused();
    await expect(list).toBeHidden();
    await filter.click();
    await page.keyboard.press('Home');
    await expect(
      page.getByRole('option', { name: 'All cases', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(filter).toHaveText('Decided');
    await expect(filter).toBeFocused();
    if (width === 1440) {
      await page
        .getByRole('button', { name: 'Toggle light and dark mode' })
        .click();
      await filter.click();
      await page.screenshot({
        path: info.outputPath('select-dark-desktop.png'),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
    }
    await page.locator('.demo-tools summary').click();
    await page.getByRole('link', { name: 'Demo guide', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'The next stream remembers.' }),
    ).toBeVisible();
  }
});

test('the memory game supports a self-paced peek, matching and a completed round', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const game = page.locator('.memory-game');
  await game.getByRole('button', { name: 'Play a quick round' }).click();
  await game.getByRole('button', { name: 'Take a peek' }).click();
  const groups: Record<string, number[]> = {};
  for (const label of await game
    .locator('.memory-tile')
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('aria-label')!),
    )) {
    const [pair, card] = label.split(', card ');
    (groups[pair] ??= []).push(Number(card));
  }
  await game.screenshot({
    path: info.outputPath('game-peek-mobile.png'),
    animations: 'disabled',
  });
  await game.getByRole('button', { name: 'Hide the cards' }).click();
  for (const indexes of Object.values(groups)) {
    for (const index of indexes)
      await game
        .getByRole('button', { name: `Turn card ${index}`, exact: true })
        .click();
  }
  await expect(
    game.getByRole('heading', { name: 'Chat has receipts.' }),
  ).toBeVisible();
  await expect(game.getByRole('status')).toContainText('All four pairs found');
  await expect(game.getByText('4 / 4 pairs')).toBeVisible();
  await game.getByRole('button', { name: 'New round' }).click();
  await expect(game.getByText('0 / 4 pairs')).toBeVisible();
});

test('the illustrative story loops, can be paused, and respects reduced motion', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const header = page.locator('.marketing-header');
  await expect(header.locator('.desktop-demo-link')).toBeHidden();
  await page.getByLabel('Explore Lore', { exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile site navigation' })
      .getByRole('link', { name: 'Try the demo', exact: true }),
  ).toHaveAttribute('href', '/demo');
  await page.keyboard.press('Escape');
  const story = page.getByRole('region', {
    name: 'An illustrative Lore story',
  });
  const image = story.locator('.hero-illustration img');
  await expect
    .poll(() =>
      image.evaluate((element) =>
        element
          .getAnimations()
          .some(
            (animation) =>
              animation.playState === 'running' &&
              animation.effect?.getTiming().iterations === Infinity,
          ),
      ),
    )
    .toBe(true);
  const initial = await image.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await expect
    .poll(() =>
      image.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(initial);
  await story.getByRole('button', { name: 'Pause story animation' }).click();
  await expect(story).toHaveAttribute('data-motion', 'paused');
  const moving = story.locator(
    '.memory-note, .hero-illustration img, .story-receipt, .receipt-icon svg',
  );
  await expect
    .poll(() =>
      moving.evaluateAll((elements) =>
        elements.every((element) =>
          element
            .getAnimations()
            .every((animation) => animation.playState === 'paused'),
        ),
      ),
    )
    .toBe(true);
  await story.getByRole('button', { name: /The follow-through/ }).click();
  await expect(
    story.getByRole('heading', { name: 'Promise fulfilled' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      story
        .locator('.memory-note')
        .evaluate((element) =>
          element
            .getAnimations()
            .every((animation) => animation.playState === 'paused'),
        ),
    )
    .toBe(true);
  await story.screenshot({
    path: info.outputPath('story-paused-mobile.png'),
    animations: 'disabled',
  });
  await story.getByRole('button', { name: 'Resume story animation' }).click();
  await expect
    .poll(() =>
      image.evaluate((element) =>
        element
          .getAnimations()
          .some((animation) => animation.playState === 'running'),
      ),
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(story.locator('.story-motion-control')).toBeHidden();
  await expect
    .poll(() =>
      moving.evaluateAll((elements) =>
        elements.every(
          (element) => getComputedStyle(element).animationName === 'none',
        ),
      ),
    )
    .toBe(true);
});
