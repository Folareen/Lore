import { afterEach, expect, it, vi } from 'vitest';
import { captureScopes } from '@lore/shared';
import {
  catchupScopes,
  moderationReadScopes,
  twitchModeratorScope,
} from '@lore/shared';
import { TwitchClient } from './twitch.client';

vi.mock('../config', () => ({
  env: {
    TWITCH_CLIENT_ID: 'test-client',
    TWITCH_CLIENT_SECRET: 'test-secret',
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    APP_ORIGIN: 'http://localhost:3000',
  },
}));
const tokens = {
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
  expires_in: 3600,
  token_type: 'bearer',
};
afterEach(() => vi.unstubAllGlobals());
it('requests team management separately and preserves it through later scope upgrades', () => {
  const client = new TwitchClient();
  const requested = new URL(
    client.authorizationUrl('state', { manageModerators: true }),
  );
  expect(requested.searchParams.get('scope')).toBe(twitchModeratorScope);
  const preserved = new URL(
    client.authorizationUrl('state', {
      capture: true,
      chat: true,
      moderation: true,
      existingScopes: [twitchModeratorScope, 'unrelated:scope'],
    }),
  );
  expect(preserved.searchParams.get('scope')?.split(' ')).toEqual([
    ...new Set([
      ...catchupScopes,
      ...moderationReadScopes,
      twitchModeratorScope,
    ]),
  ]);
  expect(
    new URL(client.authorizationUrl('state')).searchParams.get('scope'),
  ).toBe('');
});

it('accepts Twitch exchange and refresh responses without scope for ordinary sign-in', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => Response.json(tokens));
  vi.stubGlobal('fetch', fetchMock);
  const client = new TwitchClient();
  expect(
    new URL(client.authorizationUrl('synthetic-state')).searchParams.get(
      'scope',
    ),
  ).toBe('');
  await expect(client.exchange('synthetic-code')).resolves.toEqual(tokens);
  await expect(client.refresh('synthetic-refresh')).resolves.toEqual(tokens);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('accepts scoped capture responses and preserves the separate authorization flow', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(Response.json({ ...tokens, scope: captureScopes })),
  );
  const client = new TwitchClient();
  expect(
    new URL(
      client.authorizationUrl('synthetic-state', { capture: true }),
    ).searchParams
      .get('scope')
      ?.split(' '),
  ).toEqual(captureScopes);
  await expect(client.exchange('synthetic-code')).resolves.toEqual({
    ...tokens,
    scope: captureScopes,
  });
});

it.each([
  { ...tokens, scope: null },
  { ...tokens, scope: 'user:read:chat' },
  { ...tokens, access_token: '' },
  { ...tokens, refresh_token: '' },
  { ...tokens, token_type: 'unexpected' },
])(
  'still rejects malformed token responses without exposing their contents',
  async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(new TwitchClient().exchange('synthetic-code')).rejects.toThrow(
      'Twitch returned an invalid response',
    );
  },
);

it.each([undefined, null, []])(
  'treats absent or empty validated scopes as zero permissions (%j)',
  async (scopes) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          client_id: 'test-client',
          user_id: '100',
          login: 'synthetic',
          expires_in: 3600,
          scopes,
        }),
      ),
    );
    const validated = await new TwitchClient().validate('synthetic-access');
    expect(validated.scopes).toEqual([]);
    expect(
      captureScopes.some((scope) => validated.scopes.includes(scope)),
    ).toBe(false);
  },
);
it.each(['user:read:chat', true, {}])(
  'rejects malformed validated scopes (%j)',
  async (scopes) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          client_id: 'test-client',
          user_id: '100',
          login: 'synthetic',
          expires_in: 3600,
          scopes,
        }),
      ),
    );
    await expect(
      new TwitchClient().validate('synthetic-access'),
    ).rejects.toThrow('Twitch returned an invalid response');
  },
);
it('adds optional moderation reads while preserving supported existing capture and chat grants', () => {
  const scopes = new URL(
    new TwitchClient().authorizationUrl('state', {
      capture: true,
      moderation: true,
      existingScopes: ['user:write:chat', 'unrelated:permission'],
    }),
  ).searchParams
    .get('scope')!
    .split(' ');
  expect(scopes).toContain('channel:moderate');
  expect(scopes).toContain('moderator:read:unban_requests');
  expect(scopes).toContain('user:write:chat');
  expect(scopes).toContain('user:read:chat');
  expect(scopes).not.toContain('unrelated:permission');
});
