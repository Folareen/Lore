import { chooseSelect } from './select-control';
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
    page.getByRole('heading', { name: 'Hey, cozybyte.' }),
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
    page.getByRole('heading', { name: 'Hey, cozybyte.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Toggle light and dark mode' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('.demo-tools summary').click();
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
    .getByRole('navigation', { name: 'Community navigation' })
    .getByRole('link', { name: 'Next-stream brief', exact: true })
    .click();
  await expect(
    page.getByText('Browser journey commitment.', { exact: true }),
  ).toBeVisible();
  await page.locator('.demo-tools summary').click();
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
  await chooseSelect(
    page,
    page.getByLabel('How did you review the AI suggestion?'),
    'modified',
  );
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
  await page.locator('.demo-tools summary').click();
  await page
    .getByRole('link', { name: 'Public viewer preview', exact: true })
    .click();
  await expect(
    page.getByText(
      'Browser review: checked the reminder, evidence gap and rule version.',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Previously, in our corner of chat…' }),
  ).toBeVisible();
});
test('setup marks a team complete after adding a moderator and reopens it after removal', async ({
  page,
  context,
}, info) => {
  await signIn(context, 'outsider');
  await page.goto('/app');
  await page
    .getByRole('button', { name: 'Connect channel', exact: true })
    .click();
  await page.getByText('Channels & setup', { exact: true }).click();
  await expect(page.getByRole('link', { name: /Add your team/ })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Community navigation' });
  await nav.getByRole('link', { name: 'Teams', exact: true }).click();
  await page.getByLabel('Twitch user ID', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Add to team', exact: true }).click();
  await expect(
    page.getByText('Moderator enabled in Lore and Twitch.', { exact: true }),
  ).toBeVisible();
  await nav.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByText('Channels & setup', { exact: true }).click();
  const completed = page.getByRole('link', {
    name: /Team added 1 teammate has access/,
  });
  await expect(completed).toHaveClass(/done/);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
    await page
      .locator('.panel')
      .filter({
        has: page.getByRole('heading', { name: 'Get set up', exact: true }),
      })
      .screenshot({ path: info.outputPath(`setup-complete-${width}.png`) });
  }
  await completed.click();
  await page
    .getByRole('button', { name: 'Remove user200', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Remove access', exact: true })
    .click();
  await expect(
    page.getByText('Access removed from Lore and Twitch.', { exact: true }),
  ).toBeVisible();
  await nav.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByText('Channels & setup', { exact: true }).click();
  await expect(
    page.getByRole('link', { name: /Add your team/ }),
  ).not.toHaveClass(/done/);
  await expect(page.getByText('Team added', { exact: true })).toHaveCount(0);
});

test('one account can switch between teams with three different roles', async ({
  page,
  context,
  browser,
}, info) => {
  await signIn(context, 'moderator');
  const rosterRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/channels\/[^/]+\/members$/.test(new URL(request.url()).pathname))
      rosterRequests.push(request.url());
  });
  await page.goto('/app/team');
  await expect(page.getByText(/You’re a moderator here/)).toBeVisible();
  expect(rosterRequests).toEqual([]);
  await page
    .getByRole('button', { name: 'Connect your channel', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'user200 team', exact: true }),
  ).toBeVisible();
  const otherOwner = await browser.newContext({
    baseURL: 'http://127.0.0.1:4322',
  });
  try {
    await signIn(otherOwner, 'team');
    const auth = await (
      await otherOwner.request.get('/api/auth/session')
    ).json();
    const headers = {
      'X-CSRF-Token': auth.csrfToken,
      Origin: 'http://127.0.0.1:4322',
    };
    const connected = await otherOwner.request.post('/api/channels/connect', {
      headers,
      data: {},
    });
    expect(connected.ok()).toBe(true);
    const third = await connected.json();
    const granted = await otherOwner.request.post(
      `/api/channels/${third.id}/members`,
      { headers, data: { twitchUserId: '200', role: 'team' } },
    );
    expect(granted.ok()).toBe(true);
    for (const width of [390, 1440]) {
      await page.emulateMedia({
        colorScheme: width === 390 ? 'dark' : 'light',
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/app/team');
      const teams = page.getByRole('region', { name: 'Your teams' });
      await expect(teams.getByText('Owner', { exact: true })).toBeVisible();
      await expect(teams.getByText('Moderator', { exact: true })).toBeVisible();
      await expect(
        teams.getByText('Team member', { exact: true }),
      ).toBeVisible();
      await teams
        .getByRole('button', { name: 'Select user200 team', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Add to team' }),
      ).toBeVisible();
      await teams
        .getByRole('button', { name: 'Select user300 team', exact: true })
        .click();
      await expect(page.getByText(/You’re a team member here/)).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Add to team' }),
      ).toHaveCount(0);
      await teams
        .getByRole('button', { name: 'Select Browser test team', exact: true })
        .click();
      await expect(page.getByText(/You’re a moderator here/)).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Add to team' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('combobox', { name: 'Selected channel' }),
      ).toContainText('Browser test');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`teams-${width}.png`),
        fullPage: true,
      });
    }
    expect(
      (await page.request.get(`/api/channels/${channelId}/members`)).status(),
    ).toBe(404);
  } finally {
    await otherOwner.close();
  }
});

test('Moderator assignment promotes on Twitch and legacy roles can be synced explicitly', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.route('**/members/twitch', (route) =>
    route.fulfill({ json: { authorized: false, moderators: [] } }),
  );
  await page.goto('/app/team');
  await expect(
    page.getByRole('button', { name: 'Add to team', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: 'Moderator access', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('teams-before-promotion.png'),
    fullPage: true,
  });
  let promotions = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/members'))
      promotions++;
  });
  await page.route('**/api/auth/twitch/team', async (route) => {
    await page.unroute('**/members/twitch');
    await route.fulfill({
      status: 302,
      headers: { location: '/app/team?moderator=resume' },
    });
  });
  await page
    .getByRole('button', { name: 'Enable on Twitch', exact: true })
    .click();
  await expect(
    page.getByText('Moderator in Lore and Twitch', { exact: true }),
  ).toHaveCount(1);
  expect(promotions).toBe(1);
  await page.reload();
  await expect(
    page.getByText('Moderator in Lore and Twitch', { exact: true }),
  ).toHaveCount(1);
  expect(promotions).toBe(1);
  await chooseSelect(
    page,
    page.getByRole('combobox', { name: 'Role for user300', exact: true }),
    'moderator',
  );
  await expect(
    page.getByText('Moderator in Lore and Twitch', { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByText('Moderator enabled in Lore and Twitch.', { exact: true }),
  ).toBeVisible();
  for (const width of [390, 1440]) {
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`teams-twitch-moderators-${width}.png`),
      fullPage: true,
    });
  }
  await chooseSelect(
    page,
    page.getByRole('combobox', { name: 'Role for user300', exact: true }),
    'team',
  );
  await expect(
    page.getByText('Team member saved. Twitch moderator access removed.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('adding a moderator handles Twitch cancellation and resumes approval once', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.route('**/members/twitch', (route) =>
    route.fulfill({ json: { authorized: false, moderators: [] } }),
  );
  await page.goto('/app/team');
  let approved = false;
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/members'))
      writes++;
  });
  await page.route('**/api/auth/twitch/team', async (route) => {
    if (approved) await page.unroute('**/members/twitch');
    await route.fulfill({
      status: 302,
      headers: {
        location: `/app/team?moderator=${approved ? 'resume' : 'cancelled'}`,
      },
    });
  });
  await page.getByLabel('Twitch user ID', { exact: true }).fill('300');
  await page.getByRole('button', { name: 'Add to team', exact: true }).click();
  await expect(
    page.getByText('Twitch authorization was cancelled. No role was changed.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(writes).toBe(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem('lore:pending-moderator')),
  ).toBeNull();
  approved = true;
  await page.getByLabel('Twitch user ID', { exact: true }).fill('300');
  await page.getByRole('button', { name: 'Add to team', exact: true }).click();
  await expect(
    page.getByText('Moderator enabled in Lore and Twitch.', { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Role for user300', exact: true }),
  ).toContainText('Moderator');
  expect(writes).toBe(1);
  await chooseSelect(
    page,
    page.getByRole('combobox', { name: 'Role for user300', exact: true }),
    'team',
  );
  await expect(
    page.getByText('Team member saved. Twitch moderator access removed.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('demotion and removal resume the exact Twitch role change after approval', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/app/team');
  const role = () =>
    page.getByRole('combobox', { name: 'Role for user300', exact: true });
  await chooseSelect(page, role(), 'moderator');
  await expect(
    page.getByText('Moderator enabled in Lore and Twitch.', { exact: true }),
  ).toBeVisible();
  await page.route('**/members/twitch', (route) =>
    route.fulfill({ json: { authorized: false, moderators: [] } }),
  );
  await page.reload();
  let approve = false;
  await page.route('**/api/auth/twitch/team', async (route) => {
    if (approve) await page.unroute('**/members/twitch');
    await route.fulfill({
      status: 302,
      headers: {
        location: `/app/team?moderator=${approve ? 'resume' : 'cancelled'}`,
      },
    });
  });
  await chooseSelect(page, role(), 'team');
  await expect(
    page.getByText('Twitch authorization was cancelled. No role was changed.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(role()).toContainText('Moderator');
  approve = true;
  await chooseSelect(page, role(), 'team');
  await expect(
    page.getByText('Team member saved. Twitch moderator access removed.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(role()).toContainText('Team member');
  await chooseSelect(page, role(), 'moderator');
  await expect(
    page.getByText('Moderator enabled in Lore and Twitch.', { exact: true }),
  ).toBeVisible();
  await page.route('**/members/twitch', (route) =>
    route.fulfill({ json: { authorized: false, moderators: [] } }),
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Remove user300', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'their moderator role on Twitch',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove access', exact: true })
    .click();
  await expect(
    page.getByText('Access removed from Lore and Twitch.', { exact: true }),
  ).toBeVisible();
  await expect(role()).toHaveCount(0);
  await page.reload();
  await expect(role()).toHaveCount(0);
  await page.getByLabel('Twitch user ID', { exact: true }).fill('300');
  await chooseSelect(
    page,
    page.getByRole('combobox', { name: 'Role', exact: true }),
    'team',
  );
  await page.getByRole('button', { name: 'Add to team', exact: true }).click();
  await expect(
    page.getByText('Team access updated.', { exact: true }),
  ).toBeVisible();
});

test('capture can retry a prior authorization failure with a currently valid grant', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  const types = [
    'channel.chat.message',
    'channel.chat.message_delete',
    'channel.chat.clear',
    'channel.chat.clear_user_messages',
    'stream.online',
    'stream.offline',
  ];
  await page.route('**/ingestion{,/start}', (route) => {
    const running = route.request().method() === 'POST';
    return route.fulfill({
      json: {
        configured: true,
        requested: running,
        missingScopes: [],
        error: running ? null : 'authorization_required',
        subscriptions: running
          ? types.map((type) => ({ type, status: 'enabled' }))
          : [],
        pending: 0,
        failed: 0,
        lastReceivedAt: null,
      },
    });
  });
  await page.goto('/app/settings');
  await page
    .getByRole('button', { name: 'Manage live capture', exact: true })
    .click();
  const capture = page.locator('section.panel').filter({
    has: page.getByRole('heading', { name: 'Live capture', exact: true }),
  });
  await expect(
    capture.getByText('Capture needs attention', { exact: true }),
  ).toBeVisible();
  await expect(
    capture.getByRole('button', { name: 'Start capture', exact: true }),
  ).toHaveCount(0);
  await expect(
    capture.getByRole('link', {
      name: 'Reconnect Twitch permissions',
      exact: true,
    }),
  ).toHaveAttribute('href', '/api/auth/twitch/capture');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture.screenshot({
      path: info.outputPath(`capture-recovery-${width}.png`),
    });
  }
  await capture
    .getByRole('button', { name: 'Retry capture', exact: true })
    .click();
  await expect(
    capture.getByText('Listening on Twitch', { exact: true }),
  ).toBeVisible();
  await expect(
    capture.getByRole('link', {
      name: 'Reconnect Twitch permissions',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    capture.getByRole('button', { name: 'Stop capture', exact: true }),
  ).toBeVisible();
});

test('team rows keep names readable and controls usable', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  const names = ['folareen_', 'A_very_long_community_member_name'];
  await page.route('**/api/channels/*/members', (route) =>
    route.fulfill({
      json: names.map((displayName, index) => ({
        userId: `00000000-0000-4000-8000-00000000000${index + 1}`,
        twitchUserId: String(100 + index),
        login: displayName.toLowerCase(),
        displayName,
        role: 'moderator',
        verificationState: 'owner_approved',
      })),
    }),
  );
  for (const width of [320, 390, 1440]) {
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/team');
    for (const name of names) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      const identity = await page
        .getByText(name, { exact: true })
        .boundingBox();
      expect(identity!.width).toBeGreaterThan(110);
      await expect(
        page.getByRole('combobox', { name: `Role for ${name}` }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`team-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole('combobox', { name: 'Role for folareen_' }).click();
  await expect(
    page.getByRole('option', { name: 'Team member', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Remove folareen_', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('folareen_', { exact: true })).toBeVisible();
});

test('moderation list has aligned controls and useful empty states', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.route(/\/api\/channels\/[^/]+\/cases\?/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  for (const width of [320, 390, 1440]) {
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/moderation');
    await expect(
      page.getByRole('heading', { name: 'No cases yet', exact: true }),
    ).toBeVisible();
    const filter = page.getByRole('combobox', { name: 'Case status' });
    const refresh = page.getByRole('button', { name: 'Refresh cases' });
    await expect(filter).toBeVisible();
    await expect(refresh).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 1440) {
      const selectBox = await filter.boundingBox();
      const refreshBox = await refresh.boundingBox();
      expect(
        Math.abs(
          selectBox!.y + selectBox!.height - refreshBox!.y - refreshBox!.height,
        ),
      ).toBeLessThan(2);
    }
    await page.screenshot({
      path: info.outputPath(`moderation-empty-${width}.png`),
      fullPage: true,
    });
    await chooseSelect(page, filter, 'open');
    await expect(
      page.getByRole('heading', { name: 'No matching cases' }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: 'New case', exact: true }).click();
  await expect(page.getByLabel('Case title')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Case title')).toHaveCount(0);
  await page.getByRole('link', { name: 'Shift desk', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/moderation\/workflows/);
});

test('channel updates preserve editing until refresh is confirmed', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'EventSource', {
      value: class extends EventTarget {
        constructor() {
          super();
          window.addEventListener('qa:revision', (event) => {
            this.dispatchEvent(
              new MessageEvent('changed', {
                data: JSON.stringify({
                  revision: (event as CustomEvent).detail,
                }),
              }),
            );
          });
        }
        close() {}
      },
    });
  });
  await page.goto('/app/streamer');
  await page.getByText('New promise', { exact: true }).click();
  const wording = page.getByLabel('What did we promise?');
  await wording.fill('Keep this unsaved promise');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('qa:revision', { detail: 1 }));
    window.dispatchEvent(new CustomEvent('qa:revision', { detail: 2 }));
  });
  await expect(
    page.getByText('New channel updates', { exact: true }),
  ).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole('button', { name: 'Refresh', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`update-notice-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Refresh this page?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(wording).toHaveValue('Keep this unsaved promise');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh page', exact: true }).click();
  await expect(wording).toHaveValue('');
  await expect(
    page.getByText('New channel updates', { exact: true }),
  ).toHaveCount(0);
});

test('authenticated promise capture, retention and publication use real API data', async ({
  page,
  context,
  browser,
}, info) => {
  await signIn(context);
  await page.goto('/app/streamer');
  await page.getByText('New promise', { exact: true }).click();
  await page
    .getByLabel('What did we promise?')
    .fill('Authenticated browser commitment.');
  await page.getByRole('button', { name: 'Save promise', exact: true }).click();
  await expect(page.getByText('Promise saved and confirmed.')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Community navigation' })
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
  await page.getByRole('tab', { name: 'Privacy & data' }).click();
  await chooseSelect(page, page.getByLabel('Ordinary chat retention'), '1');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByLabel('Ordinary chat retention')).toHaveText('1 day');
  const purged = page.waitForResponse((r) =>
    r.url().endsWith('/retention/purge'),
  );
  await page.getByRole('button', { name: 'Purge expired chat now' }).click();
  expect((await purged).status()).toBe(200);
  await expect(
    page.getByRole('region', { name: 'Retention status' }),
  ).toContainText('0 awaiting expiry cleanup');
  await page.getByRole('link', { name: 'Public stories', exact: true }).click();
  await page.getByRole('button', { name: 'New story' }).click();
  await chooseSelect(page, page.getByLabel('Entry type'), 'summary');
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
  await page.getByRole('tab', { name: 'Privacy & data' }).click();
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
    page.getByRole('heading', { name: 'Hey, cozybyte.' }),
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
    .getByRole('navigation', { name: 'Community navigation' })
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
  await page.goto('/app/publications');
  await page.getByRole('tab', { name: 'Create a recap' }).click();
  await page
    .getByRole('button', { name: 'Enable gemini public summary drafts' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enable capability' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Generate summary draft' }),
  ).toBeDisabled();
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

  await page.goto('/app/candidates');
  await page.getByText('Microphone follow-ups', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Enable microphone follow-up suggestions' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enable capability' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Start recording', exact: true }),
  ).toBeEnabled();
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
  await page.getByRole('button', { name: 'New story', exact: true }).click();
  await page
    .getByLabel('Public title', { exact: true })
    .fill('Preserve my unsaved title');
  await create('Another client mutation while editing.');
  await expect(
    page.getByText('New channel updates', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Public title', { exact: true })).toHaveValue(
    'Preserve my unsaved title',
  );
});

test('a promise leads to a viewer-safe draft without publishing, and task tabs preserve edits', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/app/streamer');
  await page.getByText('New promise', { exact: true }).click();
  await page
    .getByLabel('What did we promise?')
    .fill('Finish the launch garden tour.');
  await page.getByRole('button', { name: 'Save promise', exact: true }).click();
  const promise = page.getByRole('article', {
    name: 'Finish the launch garden tour.',
    exact: true,
  });
  await promise.getByRole('link', { name: 'Create public story →' }).click();
  await expect(
    page.getByRole('heading', { name: 'New story draft', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Confirmed promise (optional)')).toHaveText(
    'Finish the launch garden tour.',
  );
  await page
    .getByRole('button', { name: 'Use promise wording as a draft' })
    .click();
  await page
    .getByLabel('Public title', { exact: true })
    .fill('Launch tour update');
  await page
    .getByRole('textbox', { name: 'Public story', exact: true })
    .fill('The garden tour continues next stream. Come help name the pond.');
  await page.getByRole('tab', { name: 'Create a recap' }).click();
  await page.getByRole('tab', { name: 'Stories & drafts' }).click();
  await expect(page.getByLabel('Public title', { exact: true })).toHaveValue(
    'Launch tour update',
  );
  await page
    .getByRole('button', { name: 'Save community draft', exact: true })
    .click();
  const draft = page.getByRole('article', {
    name: 'Launch tour update',
    exact: true,
  });
  await expect(draft.getByText('draft', { exact: true })).toBeVisible();
  const feed = await (
    await page.request.get('/api/public/channels/browser-test')
  ).json();
  expect(JSON.stringify(feed)).not.toContain('Launch tour update');
});

test('a promise shortcut keeps the channel switcher usable and manual recaps keep human authorship', async ({
  page,
  context,
  browser,
}) => {
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4322' });
  let otherChannel: { id: string; displayName: string };
  try {
    await signIn(other, 'team');
    const session = await (await other.request.get('/api/auth/session')).json();
    const headers = {
      'X-CSRF-Token': session.csrfToken,
      Origin: 'http://127.0.0.1:4322',
    };
    const connected = await other.request.post('/api/channels/connect', {
      headers,
      data: {},
    });
    expect(connected.ok()).toBe(true);
    otherChannel = await connected.json();
    const grant = await other.request.post(
      `/api/channels/${otherChannel.id}/members`,
      { headers, data: { twitchUserId: '100', role: 'team' } },
    );
    expect(grant.ok()).toBe(true);
  } finally {
    await other.close();
  }
  await signIn(context);
  await page.goto('/app/streamer');
  await chooseSelect(page, page.getByLabel('Selected channel'), channelId);
  await page
    .getByRole('article')
    .first()
    .getByRole('link', { name: 'Create public story →' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'New story draft', exact: true }),
  ).toBeVisible();
  await chooseSelect(
    page,
    page.getByLabel('Selected channel'),
    otherChannel.id,
  );
  await expect(page.getByLabel('Selected channel')).toHaveText(
    otherChannel.displayName,
  );
  await expect(
    page.getByRole('heading', { name: 'New story draft', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Twitch replies' })).toHaveCount(
    0,
  );
  await page.getByRole('tab', { name: 'Create a recap' }).click();
  await page.getByRole('button', { name: 'Write a recap yourself' }).click();
  await expect(page.getByLabel('Entry type')).toHaveText('Catch-up summary');
  await expect(page.getByLabel('Short !catchup reply')).toBeVisible();
  await expect(page.getByText(/Gemini draft · verify/)).toHaveCount(0);
});
