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
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
        if (view === 'brief') {
          const toolbar = page.locator('.brief-toolbar');
          await expect(
            toolbar.getByRole('button', { name: 'Refresh brief' }),
          ).toBeEnabled();
          const centers = await toolbar.evaluate((element) => {
            const count = element.querySelector('p')!.getBoundingClientRect();
            const refresh = element
              .querySelector('button')!
              .getBoundingClientRect();
            return Math.abs(
              count.y + count.height / 2 - refresh.y - refresh.height / 2,
            );
          });
          expect(centers).toBeLessThan(1);
        }
        if (
          [
            'overview',
            'brief',
            'candidates',
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
  await page.getByLabel('Explore Lore', { exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Mobile site navigation' })
    .getByRole('link', { name: 'How it works', exact: true })
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
    page.getByRole('navigation', { name: 'Community navigation' }),
  ).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('dialog', { name: 'Community menu' }),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Community menu' })
    .getByText('More tools & settings', { exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Community navigation' })
    .getByRole('link', { name: 'Account', exact: true })
    .focus();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole('navigation', { name: 'Community navigation' })
    .getByRole('link', { name: 'Promises', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Promises', exact: true }),
  ).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const card = page.getByRole('article').first();
  await expect(card.getByLabel('Next status')).toBeHidden();
  await card.getByText('Change status', { exact: true }).click();
  await chooseSelect(page, card.getByLabel('Next status'), 'fulfilled');
  await expect(card.getByLabel('Reason (required)')).toBeVisible();
  await page.getByText('New promise', { exact: true }).click();
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
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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

test('sign-in stays balanced on phones and tall desktops', async ({
  page,
}, info) => {
  await page.route('**/api/auth/status', (route) =>
    route.fulfill({ json: { twitchConfigured: true } }),
  );
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 660 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1280, height: 1347 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/login');
      const signIn = page.getByRole('link', {
        name: 'Continue with Twitch',
      });
      await expect(signIn).toBeInViewport({ ratio: 1 });
      await expect(signIn).toHaveAttribute('href', '/api/auth/twitch');
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (viewport.width > 600) {
        const story = await page.locator('.auth-story > div').boundingBox();
        const form = await page.locator('.auth-form').boundingBox();
        expect(story).not.toBeNull();
        expect(form).not.toBeNull();
        expect(
          Math.abs(story!.y + story!.height / 2 - form!.y - form!.height / 2),
        ).toBeLessThan(2);
      }
      await page.screenshot({
        path: info.outputPath(`login-${viewport.width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 660 });
  await page.goto('/login?error=signin');
  await expect(
    page.getByRole('alert').filter({ hasText: 'That sign-in didn’t finish.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Continue with Twitch' }),
  ).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Lore home' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Toggle light and dark mode' }),
  ).toBeFocused();
});

test('case detail and sign-in remain readable on phones and desktops', async ({
  page,
}, info) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo?view=moderation');
    await page.locator('.case-list-row').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
      const title = page.getByRole('heading', { level: 1 });
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
    const heading = await page.getByRole('heading', { level: 1 }).boundingBox();
    const top = await header.boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(top!.y);
    expect(heading!.y + heading!.height).toBeLessThanOrEqual(
      top!.y + top!.height,
    );
    await expect(page.locator('main h1')).toHaveCount(0);
    expect(
      (await page.locator('main').boundingBox())!.y,
    ).toBeGreaterThanOrEqual(top!.y + top!.height);
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
  await expect(header.locator('.login-link')).toBeHidden();
  await expect(header.locator('.login-link')).toHaveClass(/primary/);
  await expect(
    header.getByRole('link', { name: 'Try the demo', exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator('.hero-actions')
      .getByRole('link', { name: 'Try the demo', exact: true }),
  ).toHaveAttribute('href', '/demo');
  await page.getByLabel('Explore Lore', { exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile site navigation' })
      .getByRole('link', { name: 'Try the demo', exact: true }),
  ).toHaveAttribute('href', '/demo');
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile site navigation' })
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  const story = page.getByRole('region', {
    name: 'An illustrative Lore story',
  });
  const chapters = story.getByRole('group', { name: 'Story chapters' });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 1440)
      await expect(header.locator('.login-link')).toBeVisible();
    // Measure both in one frame while their shared entrance animation runs.
    const { controlsBottom, sceneTop } = await story.evaluate((element) => {
      const controls = element.querySelector('.chapter-nav');
      const scene = element.querySelector('.stage-scene');
      if (!controls || !scene) throw new Error('Story layout is missing');
      return {
        controlsBottom: controls.getBoundingClientRect().bottom,
        sceneTop: scene.getBoundingClientRect().top,
      };
    });
    expect(controlsBottom).toBeLessThanOrEqual(sceneTop);
    expect(
      await chapters.getByRole('button').evaluateAll((buttons) =>
        buttons.every((button) => {
          const bounds = button.getBoundingClientRect();
          return (
            bounds.height >= 44 && button.scrollWidth <= button.clientWidth
          );
        }),
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
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
  await story.getByRole('button', { name: 'The payoff', exact: true }).click();
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

test('saved account themes hydrate with the correct selected control', async ({
  page,
}) => {
  const hydrationWarnings: string[] = [];
  page.on('console', (message) => {
    if (/hydration|hydrated|data-scroll-behavior/i.test(message.text()))
      hydrationWarnings.push(message.text());
  });
  await page.goto('/demo?view=account');
  await expect(page.locator('html')).toHaveAttribute(
    'data-scroll-behavior',
    'smooth',
  );
  const choices = page.getByRole('group', { name: 'Color theme' });
  for (const theme of ['Dark', 'Light', 'System']) {
    await choices.getByRole('button', { name: theme, exact: true }).click();
    await page.reload();
    await expect(
      choices.getByRole('button', { name: theme, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(choices.locator('[aria-pressed="true"]')).toHaveCount(1);
  }
  expect(hydrationWarnings).toEqual([]);
});

test('mobile community menu isolates the page and fits narrow and landscape screens', async ({
  page,
}, info) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/demo?view=account');
    const trigger = page.getByRole('button', { name: 'Open navigation' });
    await trigger.click();
    const menu = page.getByRole('dialog', { name: 'Community menu' });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('button', { name: 'Close navigation' }),
    ).toBeFocused();
    await expect
      .poll(() =>
        page.locator('html').evaluate((element) => element.style.overflow),
      )
      .toBe('hidden');
    const links = menu.getByRole('navigation').getByRole('link');
    const positions = await links.evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          height: bounds.height,
          fits: element.scrollWidth <= element.clientWidth,
        };
      }),
    );
    expect(positions.length).toBeGreaterThan(0);
    expect(
      positions.every(
        (position) =>
          position.left === positions[0].left &&
          position.height >= 48 &&
          position.fits,
      ),
    ).toBe(true);
    const account = menu.getByRole('link', { name: 'Account', exact: true });
    await expect(account).toHaveAttribute('aria-current', 'page');
    await account.focus();
    await page.keyboard.press('Tab');
    expect(
      await menu.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await account.scrollIntoViewIfNeeded();
    const accountBounds = await account.boundingBox();
    const footerBounds = await menu
      .locator('.mobile-nav-account')
      .boundingBox();
    expect(accountBounds!.y + accountBounds!.height).toBeLessThanOrEqual(
      footerBounds!.y,
    );
    await page.screenshot({
      path: info.outputPath(`menu-${viewport.width}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect
      .poll(() =>
        page.locator('html').evaluate((element) => element.style.overflow),
      )
      .toBe('');
    await trigger.click();
    await page.mouse.click(4, viewport.height / 2);
    await expect(menu).not.toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('lore-theme', 'dark'));
  await page.reload();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.screenshot({
    path: info.outputPath('menu-dark.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole('dialog', { name: 'Community menu' }),
  ).not.toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Community navigation' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator('html').evaluate((element) => element.style.overflow),
    )
    .toBe('');
});
