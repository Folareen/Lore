import { afterEach, expect, it, vi } from 'vitest';
import { TwitchModeratorsClient } from './twitch-moderators.client';
vi.mock('../config', () => ({ env: { TWITCH_CLIENT_ID: 'test-client' } }));
afterEach(() => vi.unstubAllGlobals());
const listed = (ids: string[]) =>
  Response.json({ data: ids.map((user_id) => ({ user_id })) });
it('promotes only after checking current Twitch status and accepts an empty 204 body', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(listed([]))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  await new TwitchModeratorsClient().ensure('synthetic-token', '100', '200');
  const [url, init] = fetcher.mock.calls[1];
  expect(new URL(url).searchParams.get('broadcaster_id')).toBe('100');
  expect(new URL(url).searchParams.getAll('user_id')).toEqual(['200']);
  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({
    Authorization: 'Bearer synthetic-token',
    'Client-Id': 'test-client',
  });
});
it('does not promote an existing moderator again and tolerates a concurrent promotion', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(listed(['200']));
  vi.stubGlobal('fetch', fetcher);
  const client = new TwitchModeratorsClient();
  await client.ensure('synthetic-token', '100', '200');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher
    .mockResolvedValueOnce(listed([]))
    .mockResolvedValueOnce(new Response(null, { status: 400 }))
    .mockResolvedValueOnce(listed(['200']));
  await expect(
    client.ensure('synthetic-token', '100', '200'),
  ).resolves.toBeUndefined();
});
it.each([401, 403, 422, 429, 500])(
  'fails closed on Twitch promotion status %s without exposing the body',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(listed([]))
        .mockResolvedValueOnce(
          new Response('sensitive-provider-body', { status }),
        ),
    );
    await expect(
      new TwitchModeratorsClient().ensure('synthetic-token', '100', '200'),
    ).rejects.not.toThrow('sensitive-provider-body');
  },
);
it('bounds moderator-list queries and rejects unrelated IDs or malformed responses', async () => {
  const ids = Array.from({ length: 101 }, (_, n) => String(n + 1));
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(listed(ids.slice(0, 100)))
    .mockResolvedValueOnce(listed(ids.slice(100)));
  vi.stubGlobal('fetch', fetcher);
  const client = new TwitchModeratorsClient();
  await expect(client.list('token', '1000', ids)).resolves.toEqual(ids);
  expect(
    fetcher.mock.calls.map(
      ([url]) => new URL(url).searchParams.getAll('user_id').length,
    ),
  ).toEqual([100, 1]);
  fetcher.mockResolvedValueOnce(listed(['999']));
  await expect(client.list('token', '1000', ['1'])).rejects.toThrow(
    'invalid moderator response',
  );
  fetcher.mockResolvedValueOnce(Response.json({ data: [{ user_id: null }] }));
  await expect(client.list('token', '1000', ['1'])).rejects.toThrow(
    'invalid moderator response',
  );
});
