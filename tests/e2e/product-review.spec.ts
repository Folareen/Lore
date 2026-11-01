import { test, expect } from '@playwright/test';
for (const width of [390, 1440]) {
  test(`focused review and public reading at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.goto('/demo');
      await page.evaluate(
        (value) => localStorage.setItem('lore-theme', value),
        theme,
      );
      await page.goto('/demo?view=candidates');
      const row = page.getByRole('article').first();
      await expect(
        row.getByRole('button', { name: 'Review suggestion' }),
      ).toBeVisible();
      await expect(
        row.getByRole('button', { name: 'Confirm promise' }),
      ).toHaveCount(0);
      await row.getByRole('button', { name: 'Review suggestion' }).click();
      const review = page.getByRole('dialog', {
        name: 'Review suggestion',
        exact: true,
      });
      await expect(
        review.getByRole('heading', { name: 'Original chat' }),
      ).toBeVisible();
      await expect(
        review.getByRole('heading', { name: 'What to check' }),
      ).toBeVisible();
      await review.getByRole('button', { name: 'Review as promise' }).click();
      await review
        .getByRole('textbox', { name: 'Promise wording', exact: true })
        .fill('Keep this unfinished review.');
      await page.screenshot({
        path: info.outputPath(`${width}-${theme}-suggestion-review.png`),
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      await expect(review).not.toBeVisible();
      await expect(
        row.getByRole('button', { name: 'Review suggestion' }),
      ).toBeFocused();
      await row.getByRole('button', { name: 'Review suggestion' }).click();
      await expect(
        review.getByRole('textbox', { name: 'Promise wording', exact: true }),
      ).toHaveValue('Keep this unfinished review.');
      await review.getByRole('button', { name: 'Close review' }).click();

      await page.goto('/demo?view=publications');
      await expect(page.locator('.workspace-topbar h1')).toHaveText(
        'Public stories',
      );
      await expect(page.locator('main h1')).toHaveCount(0);
      const filterBounds = await page
        .getByRole('combobox', { name: 'Publication status' })
        .boundingBox();
      const refresh = page.getByRole('button', {
        name: 'Refresh entries',
        exact: true,
      });
      await expect(refresh).toBeEnabled();
      const refreshBounds = await refresh.boundingBox();
      expect(
        Math.abs(
          filterBounds!.y +
            filterBounds!.height -
            refreshBounds!.y -
            refreshBounds!.height,
        ),
      ).toBeLessThan(2);
      await refresh.focus();
      await expect(
        page.getByRole('tooltip', { name: 'Refresh entries' }),
      ).toBeVisible();

      await page
        .getByRole('article')
        .first()
        .getByRole('button', { name: 'Manage story' })
        .click();
      await expect(
        page.getByRole('dialog', { name: 'Manage public story' }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${width}-${theme}-publication-review.png`),
        fullPage: true,
      });
      await page.keyboard.press('Escape');

      await page.goto('/demo?view=moderation');
      await page
        .getByRole('link', { name: /Review a repeated spoiler warning/ })
        .click();
      await page.getByRole('tab', { name: 'Evidence', exact: true }).click();
      await expect(
        page.getByRole('article', { name: 'Moderator’s incident note' }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${width}-${theme}-case-evidence.png`),
        fullPage: true,
      });
      await page.getByRole('tab', { name: 'Review & decision' }).click();
      await page
        .getByRole('textbox', { name: 'Decision rationale', exact: true })
        .fill('My unfinished case review.');
      await page.getByRole('tab', { name: 'Incident & rule' }).click();
      await page.getByRole('tab', { name: 'Review & decision' }).click();
      await expect(
        page.getByRole('textbox', { name: 'Decision rationale', exact: true }),
      ).toHaveValue('My unfinished case review.');

      await page.goto('/demo?view=community&public=feed');
      await expect(page.locator('.sidebar')).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Community stories', exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${width}-${theme}-public-feed.png`),
        fullPage: true,
      });
      await page
        .getByRole('link', { name: /Read story/ })
        .first()
        .click();
      await expect(page.locator('.reader-article h1')).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${width}-${theme}-public-article.png`),
        fullPage: true,
      });
      await page.getByRole('link', { name: /All community stories/ }).click();
      await expect(page.locator('.reader-grid')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
    await page.goto('/demo?view=overlay');
    const setup = page.locator('.obs-setup');
    if (width < 851) {
      await expect(setup).not.toHaveAttribute('open');
      await expect(
        page.getByRole('heading', { name: 'On-screen preview' }),
      ).toBeVisible();
      await setup.locator('summary').click();
      await expect(
        setup.getByRole('button', {
          name: /Create overlay link|Regenerate overlay link/,
        }),
      ).toBeVisible();
      await page.goto('/demo');
      await page.getByRole('button', { name: 'Open navigation' }).click();
      const menu = page.getByRole('dialog', { name: 'Community menu' });
      await expect(
        menu.getByRole('link', { name: 'Stream overlay', exact: true }),
      ).toHaveCount(0);
      await menu.getByText('More tools & settings', { exact: true }).click();
      await menu
        .getByRole('link', { name: 'Stream overlay', exact: true })
        .click();
      await expect(menu).not.toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Stream overlay', exact: true }),
      ).toBeVisible();
    } else await expect(setup).toHaveAttribute('open');
    await page.context().addCookies([
      {
        name: 'lore_session',
        value: 'a'.repeat(64),
        url: 'http://127.0.0.1:4322',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/app/settings');
    await page.getByRole('tab', { name: 'Features', exact: true }).click();
    await expect(page.getByRole('switch')).toHaveCount(5);
    await page.screenshot({
      path: info.outputPath(`${width}-live-settings.png`),
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  });
}

test('demo community guide uses only local public fixtures', async ({
  page,
}, info) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/assistant')) calls.push(request.url());
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/demo?view=community');
  await page
    .getByRole('button', { name: 'Ask about the community', exact: true })
    .click();
  const panel = page.getByRole('dialog', { name: /Ask about cozybyte/ });
  await expect(panel.getByText('Demo · sample stories only')).toBeVisible();
  await panel.getByRole('textbox').fill('Tell me about the garden tour');
  await panel.getByRole('button', { name: 'Send question' }).click();
  await expect(
    panel.getByRole('navigation', { name: 'Answer sources' }),
  ).toBeVisible();
  expect(calls).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('demo-guide-320.png'),
    fullPage: true,
  });
  await panel
    .getByRole('navigation', { name: 'Answer sources' })
    .getByRole('link')
    .first()
    .click();
  await expect(page.locator('.reader-article h1')).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`dialogs and floating menus have dark backdrops at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.goto('/demo');
      await page.evaluate(
        (value) => localStorage.setItem('lore-theme', value),
        theme,
      );
      await page.goto('/demo?view=candidates');
      if (width < 851) {
        const trigger = page.getByRole('button', { name: 'Open navigation' });
        await expect(trigger).toHaveText('');
        await trigger.click();
        const navigation = page.getByRole('dialog', { name: 'Community menu' });
        expect(
          await navigation.evaluate(
            (element) =>
              getComputedStyle(element, '::backdrop').backgroundColor,
          ),
        ).toBe('rgba(8, 6, 12, 0.94)');
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
      }
      await page
        .getByRole('article')
        .first()
        .getByRole('button', { name: 'Review suggestion' })
        .click();
      const review = page.getByRole('dialog', {
        name: 'Review suggestion',
        exact: true,
      });
      expect(
        await review.evaluate(
          (element) => getComputedStyle(element, '::backdrop').backgroundColor,
        ),
      ).toBe('rgba(8, 6, 12, 0.94)');
      await page.screenshot({
        path: info.outputPath(`${width}-${theme}-dark-review.png`),
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      await page.locator('.demo-tools summary').click();
      expect(
        await page
          .locator('.demo-tools details')
          .evaluate(
            (element) => getComputedStyle(element, '::before').backgroundColor,
          ),
      ).toBe('rgba(8, 6, 12, 0.88)');
      await page.mouse.click(5, 880);
      await expect(
        page.getByRole('navigation', { name: 'Demo tools', exact: true }),
      ).not.toBeVisible();
      await page.locator('.demo-tools summary').click();
      await page
        .getByRole('button', { name: 'Reset demo', exact: true })
        .click();
      const confirm = page.getByRole('dialog', { name: 'Reset your demo?' });
      expect(
        await confirm.evaluate(
          (element) => getComputedStyle(element, '::backdrop').backgroundColor,
        ),
      ).toBe('rgba(8, 6, 12, 0.94)');
      await confirm
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      await page.goto('/demo?view=publications');
      await page
        .getByRole('article')
        .first()
        .getByRole('button', { name: 'Manage story' })
        .click();
      const publication = page.getByRole('dialog', {
        name: 'Manage public story',
        exact: true,
      });
      await publication
        .getByRole('button', { name: 'Edit as draft', exact: true })
        .click();
      await publication
        .getByRole('combobox', { name: 'Entry type', exact: true })
        .click();
      await expect(publication.locator('.select-scrim')).toBeVisible();
      await expect(publication.getByRole('listbox')).toBeVisible();
      expect(
        await publication
          .locator('.select-scrim')
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      ).toBe('rgba(8, 6, 12, 0.88)');
      await page.screenshot({
        path: info.outputPath(`${width}-${theme}-dark-select.png`),
        fullPage: false,
      });
      await page
        .getByRole('option', { name: 'Milestone', exact: true })
        .click();
      await expect(publication.locator('.select-scrim')).not.toBeVisible();
      await expect(publication).toBeVisible();
      await expect(
        publication.getByRole('combobox', { name: 'Entry type', exact: true }),
      ).toContainText('Milestone');
      await publication
        .getByRole('button', { name: 'Close review', exact: true })
        .click();
      if (width < 851) {
        await page.goto('/');
        await page.getByLabel('Explore Lore', { exact: true }).click();
        expect(
          await page
            .locator('.marketing-menu')
            .evaluate(
              (element) =>
                getComputedStyle(element, '::before').backgroundColor,
            ),
        ).toBe('rgba(8, 6, 12, 0.88)');
        await expect(
          page.getByRole('navigation', { name: 'Mobile site navigation' }),
        ).toBeVisible();
        await page.mouse.click(5, 880);
        await expect(
          page.getByRole('navigation', { name: 'Mobile site navigation' }),
        ).not.toBeVisible();
      }
    }
  });
}
