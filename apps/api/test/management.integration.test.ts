import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { channelResponseSchema, sessionResponseSchema } from '@lore/shared';
import { csrfToken, decryptTokens, hashToken } from '../src/auth/auth-crypto';

// Explicit test URL is required. Every run creates its own database and never truncates application tables.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error(
    'Set TEST_DATABASE_URL to a disposable PostgreSQL database before running integration tests',
  );
const database = `lore_test_${randomBytes(8).toString('hex')}`;
const admin = new Pool({ connectionString: testUrl });
const isolatedUrl = new URL(testUrl);
isolatedUrl.pathname = `/${database}`;
const pool = new Pool({ connectionString: isolatedUrl.toString() });
let mock: Server;
let api: ChildProcess;
let origin: string;
let output = '';
let owner: Login;
let member: Login;
let outsider: Login;
let channelId: string;
let providerUnavailable = false;
const revoked = new Set<string>();
let refreshes = 0;
let invalidClient = false;
const encryptionKey = randomBytes(32).toString('base64');
type Login = { cookie: string; token: string; csrf: string; id: string };
const identities = {
  owner: { id: '100', login: 'owner', display_name: 'Owner' },
  member: { id: '200', login: 'member', display_name: 'Member' },
  outsider: { id: '300', login: 'outsider', display_name: 'Outsider' },
};
async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing server port');
  return address.port;
}
async function request(
  path: string,
  user?: Login,
  method = 'GET',
  body?: unknown,
  extra: Record<string, string> = {},
) {
  return fetch(`${origin}/api${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(user
        ? { Cookie: user.cookie, Origin: origin, 'x-csrf-token': user.csrf }
        : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...extra,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function begin() {
  const response = await request('/auth/twitch');
  expect(response.status).toBe(302);
  const state = new URL(response.headers.get('location')!).searchParams.get(
    'state',
  )!;
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('lore_oauth='))!
    .split(';')[0];
  return { state, cookie };
}
async function login(code: keyof typeof identities): Promise<Login> {
  const start = await begin();
  const response = await request(
    `/auth/twitch/callback?state=${start.state}&code=${code}`,
    undefined,
    'GET',
    undefined,
    { Cookie: start.cookie },
  );
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe(`${origin}/api/auth/session`);
  const rawCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('lore_session='))!;
  expect(rawCookie).toContain('HttpOnly');
  expect(rawCookie).toContain('SameSite=Lax');
  const cookie = rawCookie.split(';')[0];
  const token = cookie.split('=')[1];
  const session = await fetch(`${origin}/api/auth/session`, {
    headers: { Cookie: cookie },
  });
  const body = sessionResponseSchema.parse(await session.json());
  expect(session.status).toBe(200);
  expect(body.user.twitchUserId).toBe(identities[code].id);
  return { cookie, token, csrf: body.csrfToken, id: body.user.id };
}
beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${database}`);
  const migrations = resolve('apps/api/drizzle');
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await pool.query(readFileSync(resolve(migrations, file), 'utf8'));
  mock = createServer(async (req, res) => {
    if (providerUnavailable) {
      res.writeHead(503).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const params = new URLSearchParams(Buffer.concat(chunks).toString());
    const bearer = req.headers.authorization?.split(' ')[1] || '';
    const name = (params.get('code') ||
      params.get('refresh_token')?.replace('refresh-', '') ||
      bearer.split('-')[1]) as keyof typeof identities;
    const identity = identities[name];
    res.setHeader('Content-Type', 'application/json');
    if (!identity || revoked.has(name)) {
      res.writeHead(401).end('{}');
      return;
    }
    if (req.url === '/oauth2/token') {
      if (params.get('grant_type') === 'refresh_token') refreshes++;
      res.end(
        JSON.stringify({
          access_token: `access-${name}`,
          refresh_token: `refresh-${name}${params.get('grant_type') === 'refresh_token' ? '-rotated' : ''}`,
          scope: [],
          token_type: 'bearer',
          expires_in: 3600,
        }),
      );
    } else if (req.url === '/oauth2/validate') {
      res.end(
        JSON.stringify({
          client_id: invalidClient ? 'other-client' : 'test-client',
          user_id: identity.id,
          login: identity.login,
          scopes: [],
          expires_in: 3600,
        }),
      );
    } else if (req.url === '/helix/users')
      res.end(JSON.stringify({ data: [identity] }));
    else res.writeHead(404).end('{}');
  });
  const mockPort = await listen(mock);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>((done) => reservation.close(() => done()));
  origin = `http://127.0.0.1:${port}`;
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: isolatedUrl.toString(),
      API_PORT: String(port),
      APP_ORIGIN: origin,
      TWITCH_CLIENT_ID: 'test-client',
      TWITCH_CLIENT_SECRET: 'test-secret',
      AUTH_ENCRYPTION_KEY: encryptionKey,
      TWITCH_TEST_BASE_URL: `http://127.0.0.1:${mockPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout?.on('data', (chunk) => {
    output += chunk.toString();
  });
  api.stderr?.on('data', (chunk) => {
    output += chunk.toString();
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await request('/health');
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the process to bind. */
    }
    if (api.exitCode !== null) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready) throw new Error(`API did not start: ${output.slice(-4000)}`);
  owner = await login('owner');
  member = await login('member');
  outsider = await login('outsider');
});
afterAll(async () => {
  if (api && api.exitCode === null) {
    const exited = once(api, 'exit');
    api.kill('SIGTERM');
    await exited;
  }
  if (mock) await new Promise<void>((done) => mock.close(() => done()));
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.end();
});
describe('auth and channel management over HTTP and PostgreSQL', () => {
  it('stores encrypted credentials and hashed sessions, returning only safe user fields', async () => {
    const result = await pool.query(
      'SELECT encrypted_tokens FROM oauth_connections WHERE user_id = $1',
      [owner.id],
    );
    expect(result.rows[0].encrypted_tokens).not.toContain('access-owner');
    expect(result.rows[0].encrypted_tokens).not.toContain('refresh-owner');
    const sessions = await pool.query(
      'SELECT token_hash FROM sessions WHERE user_id = $1',
      [owner.id],
    );
    expect(sessions.rows[0].token_hash).toBe(hashToken(owner.token));
    const response = await request('/auth/session', owner);
    const body = sessionResponseSchema.parse(await response.json());
    expect(Object.keys(body.user).sort()).toEqual([
      'displayName',
      'id',
      'login',
      'twitchUserId',
    ]);
    expect(body.csrfToken).toBe(csrfToken(owner.token));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await request('/channels')).status).toBe(401);
  });
  it('rejects missing sessions, forged cookies, foreign origins and missing CSRF tokens', async () => {
    expect(
      (await request('/channels', { ...owner, cookie: 'lore_session=forged' }))
        .status,
    ).toBe(401);
    expect(
      (
        await request(
          '/channels/connect',
          owner,
          'POST',
          {},
          { Origin: 'https://attacker.example' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          '/channels/connect',
          owner,
          'POST',
          {},
          { 'x-csrf-token': '' },
        )
      ).status,
    ).toBe(403);
    expect(
      (await request('/channels/connect', owner, 'POST', {}, { Origin: '' }))
        .status,
    ).toBe(403);
  });
  it('connects only the authenticated Twitch channel and is idempotent', async () => {
    expect(
      (
        await request('/channels/connect', owner, 'POST', {
          twitchChannelId: '300',
        })
      ).status,
    ).toBe(400);
    const response = await request('/channels/connect', owner, 'POST', {});
    expect(response.status).toBe(200);
    const channel = channelResponseSchema.parse(await response.json());
    channelId = channel.id;
    expect(channel).toMatchObject({
      twitchChannelId: '100',
      role: 'owner',
      connected: true,
    });
    expect(
      channelResponseSchema.parse(
        await (await request('/channels/connect', owner, 'POST', {})).json(),
      ).id,
    ).toBe(channelId);
    expect(
      (await request('/channels/connect', outsider, 'POST', {})).status,
    ).toBe(200);
  });
  it('isolates channel reads, writes and membership management from unrelated users', async () => {
    expect(await (await request('/channels', member)).json()).toEqual([]);
    expect((await request(`/channels/${channelId}`, outsider)).status).toBe(
      404,
    );
    expect(
      (
        await request(`/channels/${channelId}/settings`, outsider, 'PATCH', {
          chatRetentionDays: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (await request(`/channels/${channelId}/members`, outsider)).status,
    ).toBe(404);
    expect(
      (
        await request(`/channels/${channelId}/members`, outsider, 'POST', {
          twitchUserId: '200',
          role: 'moderator',
        })
      ).status,
    ).toBe(404);
  });
  it('grants explicit roles, prevents escalation, and removes access immediately', async () => {
    expect(
      (
        await request(`/channels/${channelId}/members`, owner, 'POST', {
          twitchUserId: '200',
          role: 'owner',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/channels/${channelId}/members`, owner, 'POST', {
          twitchUserId: '100',
          role: 'team',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`/channels/${channelId}/members`, owner, 'POST', {
          twitchUserId: '999',
          role: 'team',
        })
      ).status,
    ).toBe(404);
    const granted = await request(
      `/channels/${channelId}/members`,
      owner,
      'POST',
      { twitchUserId: '200', role: 'moderator' },
    );
    expect(await granted.json()).toMatchObject({
      userId: member.id,
      role: 'moderator',
      verificationState: 'owner_approved',
    });
    expect(
      await (await request(`/channels/${channelId}`, member)).json(),
    ).toMatchObject({ role: 'moderator' });
    expect(
      (
        await request(`/channels/${channelId}/members`, member, 'POST', {
          twitchUserId: '300',
          role: 'team',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/channels/${channelId}/settings`, member, 'PATCH', {
          chatRetentionDays: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (await request(`/channels/${channelId}/disconnect`, member, 'POST'))
        .status,
    ).toBe(404);
    expect(
      (
        await request(
          `/channels/${channelId}/members/${owner.id}`,
          owner,
          'DELETE',
        )
      ).status,
    ).toBe(403);
    await request(`/channels/${channelId}/members`, owner, 'POST', {
      twitchUserId: '200',
      role: 'team',
    });
    expect(
      await (await request(`/channels/${channelId}`, member)).json(),
    ).toMatchObject({ role: 'team' });
    expect(
      (
        await request(
          `/channels/${channelId}/members/${member.id}`,
          owner,
          'DELETE',
        )
      ).status,
    ).toBe(204);
    expect((await request(`/channels/${channelId}`, member)).status).toBe(404);
  });
  it('constrains retention, rejects mass assignment, and audits successful changes', async () => {
    for (const days of [0, 8, 1.5])
      expect(
        (
          await request(`/channels/${channelId}/settings`, owner, 'PATCH', {
            chatRetentionDays: days,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(`/channels/${channelId}/settings`, owner, 'PATCH', {
          chatRetentionDays: 1,
          ownerUserId: member.id,
        })
      ).status,
    ).toBe(400);
    const response = await request(
      `/channels/${channelId}/settings`,
      owner,
      'PATCH',
      { chatRetentionDays: 1 },
    );
    expect(await response.json()).toMatchObject({ chatRetentionDays: 1 });
    const audit = await pool.query(
      'SELECT action, details FROM audit_events WHERE channel_id = $1',
      [channelId],
    );
    expect(audit.rows).toContainEqual({
      action: 'channel.settings_updated',
      details: { chatRetentionDays: 1 },
    });
    expect(audit.rows.some((row) => row.action === 'membership.removed')).toBe(
      true,
    );
    await expect(
      pool.query('UPDATE channels SET chat_retention_days = 8 WHERE id = $1', [
        channelId,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query('UPDATE channels SET owner_user_id = $1 WHERE id = $2', [
        outsider.id,
        channelId,
      ]),
    ).rejects.toThrow();
  });
  it('disconnects a channel and clears team grants without deleting retained records', async () => {
    await request(`/channels/${channelId}/members`, owner, 'POST', {
      twitchUserId: '200',
      role: 'team',
    });
    expect(
      (await request(`/channels/${channelId}/disconnect`, owner, 'POST'))
        .status,
    ).toBe(204);
    expect((await request(`/channels/${channelId}`, member)).status).toBe(404);
    expect(
      await (await request(`/channels/${channelId}`, owner)).json(),
    ).toMatchObject({ connected: false });
    expect(
      (
        await request(`/channels/${channelId}/members`, owner, 'POST', {
          twitchUserId: '200',
          role: 'team',
        })
      ).status,
    ).toBe(409);
    await request('/channels/connect', owner, 'POST', {});
    expect((await request(`/channels/${channelId}`, member)).status).toBe(404);
    expect(
      await (await request(`/channels/${channelId}/members`, owner)).json(),
    ).toEqual([]);
  });
  it('binds OAuth state to its browser, consumes it once, and rejects denial or expiry', async () => {
    const start = await begin();
    const path = `/auth/twitch/callback?state=${start.state}&code=owner`;
    expect(
      (
        await request(path, undefined, 'GET', undefined, {
          Cookie: 'lore_oauth=' + 'a'.repeat(64),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(path, undefined, 'GET', undefined, {
          Cookie: start.cookie,
        })
      ).status,
    ).toBe(302);
    expect(
      (
        await request(path, undefined, 'GET', undefined, {
          Cookie: start.cookie,
        })
      ).status,
    ).toBe(401);
    const expired = await begin();
    await pool.query(
      "UPDATE oauth_states SET expires_at = now() - interval '1 minute' WHERE state_hash = $1",
      [hashToken(expired.state)],
    );
    expect(
      (
        await request(
          `/auth/twitch/callback?state=${expired.state}&code=owner`,
          undefined,
          'GET',
          undefined,
          { Cookie: expired.cookie },
        )
      ).status,
    ).toBe(401);
    const denied = await begin();
    expect(
      (
        await request(
          `/auth/twitch/callback?state=${denied.state}&error=access_denied`,
          undefined,
          'GET',
          undefined,
          { Cookie: denied.cookie },
        )
      ).status,
    ).toBe(401);
  });
  it('expires sessions server-side and invalidates the exact session on logout', async () => {
    const temporary = await login('member');
    await pool.query(
      "UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1",
      [hashToken(temporary.token)],
    );
    expect((await request('/auth/session', temporary)).status).toBe(401);
    expect((await request('/auth/logout', member, 'POST')).status).toBe(204);
    expect((await request('/auth/session', member)).status).toBe(401);
    expect((await request('/auth/session', owner)).status).toBe(200);
  });
  it('serializes expired-token refreshes and preserves sessions during provider outages', async () => {
    await pool.query(
      "UPDATE oauth_connections SET expires_at = now() - interval '1 minute' WHERE user_id = $1",
      [owner.id],
    );
    const responses = await Promise.all([
      request('/auth/session', owner),
      request('/auth/session', owner),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(refreshes).toBe(1);
    const credentials = await pool.query(
      'SELECT encrypted_tokens FROM oauth_connections WHERE user_id = $1',
      [owner.id],
    );
    expect(
      JSON.parse(
        decryptTokens(
          credentials.rows[0].encrypted_tokens,
          owner.id,
          encryptionKey,
        ),
      ).refresh_token,
    ).toBe('refresh-owner-rotated');
    await pool.query(
      "UPDATE oauth_connections SET validated_at = now() - interval '2 hours' WHERE user_id = $1",
      [owner.id],
    );
    providerUnavailable = true;
    expect((await request('/auth/session', owner)).status).toBe(503);
    providerUnavailable = false;
    expect((await request('/auth/session', owner)).status).toBe(200);
  });
  it('rejects an OAuth token issued to a different client without creating a session', async () => {
    const start = await begin();
    const before = await pool.query(
      'SELECT count(*)::int AS count FROM sessions',
    );
    invalidClient = true;
    try {
      const response = await request(
        `/auth/twitch/callback?state=${start.state}&code=outsider`,
        undefined,
        'GET',
        undefined,
        { Cookie: start.cookie },
      );
      expect(response.status).toBe(401);
      expect(
        response.headers
          .getSetCookie()
          .some((cookie) => cookie.startsWith('lore_session=')),
      ).toBe(false);
      expect(
        (await pool.query('SELECT count(*)::int AS count FROM sessions')).rows,
      ).toEqual(before.rows);
    } finally {
      invalidClient = false;
    }
  });
  it('ends all sessions and disables owned channels when Twitch authorization is revoked', async () => {
    revoked.add('owner');
    await pool.query(
      "UPDATE oauth_connections SET validated_at = now() - interval '2 hours' WHERE user_id = $1",
      [owner.id],
    );
    expect((await request('/auth/session', owner)).status).toBe(401);
    const result = await pool.query(
      'SELECT encrypted_tokens, revoked_at FROM oauth_connections WHERE user_id = $1',
      [owner.id],
    );
    expect(result.rows[0].encrypted_tokens).toBeNull();
    expect(result.rows[0].revoked_at).not.toBeNull();
    expect(
      (
        await pool.query('SELECT * FROM sessions WHERE user_id = $1', [
          owner.id,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await pool.query('SELECT disconnected_at FROM channels WHERE id = $1', [
          channelId,
        ])
      ).rows[0].disconnected_at,
    ).not.toBeNull();
  });
});
