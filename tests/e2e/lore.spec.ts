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
test('old preview links redirect to the same demo screen and preserve parameters', async ({
  page,
}) => {
  const response = await page.request.get(
    '/preview?view=case&case=00000000-0000-4000-8000-000000000001&channel=00000000-0000-4000-8000-000000000002',
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(308);
  const destination = new URL(
    response.headers().location,
    'http://127.0.0.1:4322',
  );
  expect(destination.pathname).toBe('/demo');
  expect(Object.fromEntries(destination.searchParams)).toEqual({
    view: 'case',
    case: '00000000-0000-4000-8000-000000000001',
    channel: '00000000-0000-4000-8000-000000000002',
  });
  await page.goto('/preview?view=chat');
  await expect(page).toHaveURL(/\/demo\?view=chat$/);
  await expect(page.getByLabel('Simulated chat message')).toBeVisible();
  await page.goto('/preview');
  await expect(page).toHaveURL(/\/demo$/);
  await expect(
    page.getByRole('heading', { name: 'The next stream remembers.' }),
  ).toBeVisible();
});
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
}, info) => {
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
    page.getByRole('heading', {
      name: 'Authenticated browser commitment.',
      exact: true,
    }),
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
  for (const width of [390, 1440]) {
    await visitor.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        visitor.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await visitor.screenshot({
      path: info.outputPath(`public-catchup-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }

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
  await page.getByRole('button', { name: 'Open navigation' }).click();
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
test('owner opts in, reviews a Gemini public draft and saves it without automatic publication', async ({
  page,
  context,
}) => {
  await signIn(context);
  const auth = await (await page.request.get('/api/auth/session')).json();
  const headers = {
    Origin: 'http://127.0.0.1:4322',
    'X-CSRF-Token': auth.csrfToken,
  };
  const sourceResponse = await page.request.post(
    `/api/channels/${channelId}/publications`,
    {
      headers,
      data: {
        requestId: crypto.randomUUID(),
        kind: 'milestone',
        title: 'Browser public garden source',
        body: 'The garden is ready for visitors.',
        chatSummary: '',
        sourceIds: [],
        promiseId: null,
      },
    },
  );
  expect(sourceResponse.status()).toBe(200);
  const source = await sourceResponse.json();
  expect(
    (
      await page.request.post(
        `/api/channels/${channelId}/publications/${source.id}/review`,
        {
          headers,
          data: {
            expectedVersion: source.version,
            action: 'publish',
            reason: 'Approved synthetic browser source.',
          },
        },
      )
    ).status(),
  ).toBe(200);
  await page.goto('/app/settings');
  await page
    .getByText('Additional channel capabilities', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Enable gemini public summary drafts' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enable capability' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Disable gemini public summary drafts' }),
  ).toBeVisible();
  await page.goto('/app/publications');
  await page
    .getByText('Draft a catch-up summary with Gemini', { exact: true })
    .click();
  await page
    .getByRole('checkbox', {
      name: 'Browser public garden source',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Generate summary draft' }).click();
  await expect(
    page.getByText('Gemini draft · not published', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use as editable draft' }).click();
  await expect(page.getByLabel('Public title', { exact: true })).toHaveValue(
    'Browser Gemini summary',
  );
  await page
    .getByLabel('Public title', { exact: true })
    .fill('Human-edited browser Gemini summary');
  await page
    .getByRole('button', { name: 'Save community draft', exact: true })
    .click();
  const article = page.getByRole('article').filter({
    has: page.getByRole('heading', {
      name: 'Human-edited browser Gemini summary',
      exact: true,
    }),
  });
  await expect(article.getByText('draft', { exact: true })).toBeVisible();
  const feed = await (
    await page.request.get('/api/public/channels/browser-test')
  ).json();
  expect(JSON.stringify(feed)).not.toContain(
    'Human-edited browser Gemini summary',
  );
});
test('records a synthetic clip after explicit consent, previews audio and confirms an unverified microphone suggestion', async ({
  page,
  context,
}) => {
  await signIn(context);
  await context.grantPermissions(['microphone']);
  // Generate local synthetic audio so this test does not depend on macOS device permissions.
  // MediaRecorder, browser WAV conversion, multipart transport and the API remain real.
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const destination = audio.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        await audio.resume();
        return destination.stream;
      },
    });
  });

  await page.goto('/app/settings');
  await page
    .getByText('Additional channel capabilities', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Enable microphone follow-up suggestions' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enable capability' })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Disable microphone follow-up suggestions',
    }),
  ).toBeVisible();
  await page.goto('/app/candidates');
  await page.getByText('Microphone follow-ups', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Start recording', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Stop recording', exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(400);
  await page
    .getByRole('button', { name: 'Stop recording', exact: true })
    .click();
  await expect(page.getByLabel('Recorded clip preview')).toBeVisible();
  await page
    .getByRole('button', { name: 'Transcribe and find suggestions' })
    .click();
  await expect(
    page.getByText('I will complete the browser garden tour.', { exact: true }),
  ).toHaveCount(2);
  await page
    .getByLabel('Confirmed wording', { exact: true })
    .fill('Human-confirmed microphone garden tour.');
  await page
    .getByRole('button', { name: 'Review microphone suggestion' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save confirmed promise' })
    .click();
  await expect(
    page.getByRole('link', { name: 'Open the brief', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open the brief', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Human-confirmed microphone garden tour.',
      exact: true,
    }),
  ).toBeVisible();
});
test('production SSE refreshes clean views and preserves edits when another client changes the channel', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/app/brief');
  await expect(
    page.getByText('Live updates connected', { exact: true }),
  ).toBeVisible();
  const auth = await (await page.request.get('/api/auth/session')).json();
  const headers = {
    Origin: 'http://127.0.0.1:4322',
    'X-CSRF-Token': auth.csrfToken,
  };
  const create = async (wording: string) => {
    expect(
      (
        await page.request.post(`/api/channels/${channelId}/open-loops`, {
          headers,
          data: { requestId: crypto.randomUUID(), wording },
        })
      ).status(),
    ).toBe(200);
  };
  await create('Promise from another client.');
  await expect(
    page.getByRole('heading', {
      name: 'Promise from another client.',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/app/publications');
  await expect(
    page.getByText('Live updates connected', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'New community draft', exact: true })
    .click();
  await page
    .getByLabel('Public title', { exact: true })
    .fill('Preserve my unsaved title');
  await create('Another client mutation while editing.');
  await expect(page.getByText(/Your edits have been preserved/)).toBeVisible();
  await expect(page.getByLabel('Public title', { exact: true })).toHaveValue(
    'Preserve my unsaved title',
  );
});
