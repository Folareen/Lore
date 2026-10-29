import { test, expect, type BrowserContext } from '@playwright/test';
const channelId = '00000000-0000-4000-8000-000000009200';
async function signIn(
  context: BrowserContext,
  role: 'owner' | 'moderator' | 'team' | 'outsider' = 'owner',
) {
  const token = { owner: 'a', moderator: 'b', team: 'c', outsider: 'd' }[
    role
  ].repeat(64);
  await context.addCookies([
    {
      name: 'lore_session',
      value: token,
      url: 'http://127.0.0.1:4322',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
test('production CSP permits hydration, themes and the seeded command-to-brief/reset journey', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      /Content Security Policy|Refused to execute|violates/.test(m.text())
    )
      failures.push(m.text());
  });
  const response = await page.goto('/demo');
  const csp = response!.headers()['content-security-policy'];
  expect(csp).toContain("'strict-dynamic'");
  expect(response!.headers()['cache-control']).toContain('no-store');
  expect(response!.headers()['referrer-policy']).toBe('no-referrer');
  const another = await page.request.get('/demo');
  expect(another.headers()['content-security-policy']).not.toBe(csp);
  expect(csp).not.toContain('unsafe-eval');
  expect(response!.headers()['x-powered-by']).toBeUndefined();
  await expect(
    page.getByRole('heading', { name: 'The next stream remembers.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Toggle light and dark mode' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('link', { name: 'Chat simulation', exact: true })
    .click();
  await page
    .getByLabel('Simulated chat message')
    .fill('!promise Browser journey commitment.');
  await page.getByRole('button', { name: 'Simulate command' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Simulated promise saved',
  );
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Next-stream brief', exact: true })
    .click();
  await expect(
    page.getByText('Browser journey commitment.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reset demo', exact: true })
    .click();
  await expect(
    page.getByText('Browser journey commitment.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Finish the community island tour next stream.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(failures).toEqual([]);
});
test('demo evidence, precedent and human decision remain connected across navigation', async ({
  page,
}) => {
  await page.goto('/demo?view=moderation');
  await page
    .getByRole('link', { name: /Review a repeated spoiler warning/ })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Review a repeated spoiler warning',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Moderator’s incident note' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Find potential precedents' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'AI suggestion · Human review required',
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Use recommendation as a draft' })
    .click();
  await page
    .getByLabel('How did you review the AI suggestion?')
    .selectOption('modified');
  await page
    .getByLabel('Decision rationale')
    .fill(
      'Browser review: checked the reminder, evidence gap and rule version.',
    );
  await page.getByRole('button', { name: 'Review human decision' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save human decision' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Modify · Human decision' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Community Lore', exact: true }).click();
  await expect(
    page.getByText(
      'Browser review: checked the reminder, evidence gap and rule version.',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Previously, in our corner of chat…' }),
  ).toBeVisible();
});
test('authenticated promise capture, retention and publication use real API data', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  await page.goto('/app/streamer');
  await page
    .getByLabel('What did we promise?')
    .fill('Authenticated browser commitment.');
  await page.getByRole('button', { name: 'Save promise', exact: true }).click();
  await expect(page.getByText('Promise saved and confirmed.')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Next-stream brief', exact: true })
    .click();
  await expect(
    page.getByText('Authenticated browser commitment.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Channel settings', exact: true })
    .click();
  await page.getByLabel('Ordinary chat retention').selectOption('1');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByLabel('Ordinary chat retention')).toHaveValue('1');
  const purged = page.waitForResponse((r) =>
    r.url().endsWith('/retention/purge'),
  );
  await page.getByRole('button', { name: 'Purge expired chat now' }).click();
  expect((await purged).status()).toBe(200);
  await expect(
    page.getByRole('region', { name: 'Retention status' }),
  ).toContainText('0 awaiting expiry cleanup');
  await page
    .getByRole('link', { name: 'Community publishing', exact: true })
    .click();
  await page.getByRole('button', { name: 'New community draft' }).click();
  await page.getByLabel('Entry type').selectOption('summary');
  await page
    .getByLabel('Public title', { exact: true })
    .fill('Browser-approved recap');
  await page
    .getByLabel('Public story', { exact: true })
    .fill(
      'Public story: <script>window.__loreInjected=true</script> shown as text.',
    );
  await page
    .getByLabel('Short !catchup reply')
    .fill('The browser story is ready for newcomers.');
  await page.getByRole('button', { name: 'Save community draft' }).click();
  const article = page.getByRole('article', { name: 'Browser-approved recap' });
  await article.getByRole('button', { name: 'Review for publication' }).click();
  await page
    .getByLabel('Publication review reason')
    .fill('Reviewed the exact public text in the browser.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Approve & publish' })
    .click();
  await expect(article.getByText('published', { exact: true })).toBeVisible();
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto('http://127.0.0.1:4322/c/browser-test/catch-up');
  await expect(
    visitor.getByRole('heading', { name: 'Browser-approved recap' }),
  ).toBeVisible();
  await expect(
    visitor.getByText(
      'Public story: <script>window.__loreInjected=true</script> shown as text.',
    ),
  ).toBeVisible();
  expect(await visitor.evaluate(() => '__loreInjected' in window)).toBe(false);
  await article.getByRole('button', { name: 'Unpublish', exact: true }).click();
  await page
    .getByLabel('Publication review reason')
    .fill('Withdraw the browser test recap.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Withdraw community entry' })
    .click();
  await expect(article.getByText('unpublished', { exact: true })).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByRole('heading', { name: 'Browser-approved recap' }),
  ).toHaveCount(0);
  await visitorContext.close();
});
test('protected routes, team role and CSRF boundaries survive direct browser navigation', async ({
  page,
  context,
}) => {
  await page.goto('/app/moderation');
  await expect(page).toHaveURL(/\/login/);
  await signIn(context, 'owner');
  const auth = await (await page.request.get('/api/auth/session')).json();
  const created = await page.request.post(`/api/channels/${channelId}/cases`, {
    headers: {
      Origin: 'http://127.0.0.1:4322',
      'X-CSRF-Token': auth.csrfToken,
    },
    data: {
      requestId: crypto.randomUUID(),
      title: 'Private browser case',
      subjectReference: 'Private synthetic viewer',
      incident: 'PRIVATE_BROWSER_INCIDENT',
      appeal: '',
      incidentAt: null,
      ruleTitle: 'No spoilers',
      ruleVersion: '1',
      ruleText: 'Keep story details private.',
    },
  });
  expect(created.status()).toBe(200);
  const record = await created.json();
  await context.clearCookies();
  await signIn(context, 'team');
  const guessed = await page.request.get(
    `/api/channels/${channelId}/cases/${record.id}`,
  );
  expect(guessed.status()).toBe(404);
  await page.goto(`/app/cases/${record.id}?channel=${channelId}`);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('PRIVATE_BROWSER_INCIDENT')).toHaveCount(0);
  await page.goto('/app/settings');
  await expect(page.getByLabel('Ordinary chat retention')).toBeDisabled();
  const response = await page.request.get(`/api/channels/${channelId}/cases`);
  expect(response.status()).toBe(404);
  const csrf = await page.request.patch(`/api/channels/${channelId}/settings`, {
    data: { chatRetentionDays: 7 },
  });
  expect(csrf.status()).toBe(403);
  const hidden = await page.request.get(`/api/channels/${channelId}/retention`);
  expect(hidden.status()).toBe(404);
});
test('mobile demo remains usable in light/dark and a missing-token OBS canvas stays transparent', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/demo');
  await expect(
    page.getByRole('heading', { name: 'The next stream remembers.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Toggle light and dark mode' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Account', exact: true })
    .focus();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto('/overlay/browser-test');
  await expect(
    page.getByRole('region', { name: 'Community overlay' }),
  ).toHaveCount(0);
  expect(
    await page
      .locator('body')
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgba(0, 0, 0, 0)');
});
