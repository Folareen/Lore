import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import {
  createServer as createNetServer,
  connect as connectSocket,
  type Server as NetServer,
  type Socket,
} from 'node:net';
import { Queue } from 'bullmq';
import { once } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  retentionStatusSchema,
  captureScopes,
  channelResponseSchema,
  ingestionStatusSchema,
  queueNames,
  sessionResponseSchema,
  twitchEventTypes,
  openLoopResponseSchema,
  openLoopHistorySchema,
  openLoopPageSchema,
  streamBriefSchema,
  type OpenLoop,
  type TwitchEventType,
} from '@lore/shared';
import { deliveryJobId } from '../src/ingestion/ingestion-job';
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
let apiEnvironment: NodeJS.ProcessEnv;
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
let captureGranted = false;
let redisUnavailable = false;
let redisProxy: NetServer;
let queue: Queue;
const redisSockets = new Set<Socket>();
const webhookSecret = 'test-eventsub-secret-32-characters';
const callbackUrl = 'https://lore-test.example/api/webhooks/twitch';
const remoteSubscriptions = new Map<
  string,
  {
    id: string;
    type: TwitchEventType;
    version: '1';
    status: string;
    condition: { broadcaster_user_id: string; user_id?: string };
    transport: { method: 'webhook'; callback: string };
  }
>();
let subscriptionSequence = 0;
const encryptionKey = randomBytes(32).toString('base64');
type Login = { cookie: string; token: string; csrf: string; id: string };
const identities = {
  owner: { id: '100', login: 'owner', display_name: 'Owner' },
  member: { id: '200', login: 'member', display_name: 'Member' },
  outsider: { id: '300', login: 'outsider', display_name: 'Outsider' },
};
async function listen(server: Server | NetServer) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing server port');
  return address.port;
}
async function eventually(check: () => Promise<boolean>, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Condition did not settle. API: ${output.slice(-2000)}`);
}
async function startApi() {
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: apiEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout?.on('data', (chunk) => {
    output += chunk.toString();
  });
  api.stderr?.on('data', (chunk) => {
    output += chunk.toString();
  });
  await eventually(async () => {
    if (api.exitCode !== null)
      throw new Error(`API exited: ${output.slice(-2000)}`);
    try {
      return (await request('/health')).ok;
    } catch {
      return false;
    }
  }, 10000);
}
async function restartApi() {
  const exited = once(api, 'exit');
  api.kill('SIGTERM');
  await exited;
  await startApi();
}
async function deliver(
  type: TwitchEventType,
  event?: unknown,
  options: {
    id?: string;
    kind?: string;
    timestamp?: string;
    subscriptionId?: string;
    broadcaster?: string;
    challenge?: string;
    status?: string;
    signature?: string;
  } = {},
) {
  const subscription =
    remoteSubscriptions.get(options.subscriptionId || '') ||
    [...remoteSubscriptions.values()].find((sub) => sub.type === type)!;
  if (!subscription) throw new Error(`Missing test subscription: ${type}`);
  const body = JSON.stringify({
    subscription: {
      ...subscription,
      ...(options.status ? { status: options.status } : {}),
      condition: {
        ...subscription.condition,
        ...(options.broadcaster
          ? { broadcaster_user_id: options.broadcaster }
          : {}),
      },
    },
    ...(event ? { event } : {}),
    ...(options.challenge ? { challenge: options.challenge } : {}),
  });
  const id = options.id || randomBytes(12).toString('hex');
  const timestamp = options.timestamp || new Date().toISOString();
  const signature = `sha256=${createHmac('sha256', webhookSecret).update(id).update(timestamp).update(body).digest('hex')}`;
  return fetch(`${origin}/api/webhooks/twitch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Twitch-Eventsub-Message-Id': id,
      'Twitch-Eventsub-Message-Timestamp': timestamp,
      'Twitch-Eventsub-Message-Type': options.kind || 'notification',
      'Twitch-Eventsub-Subscription-Type': type,
      'Twitch-Eventsub-Subscription-Version': '1',
      'Twitch-Eventsub-Message-Signature': options.signature || signature,
    },
    body,
  });
}
const chat = (messageId: string, chatter = '200') => ({
  broadcaster_user_id: '100',
  chatter_user_id: chatter,
  message_id: messageId,
  message: { text: 'Mock chat fixture, never real chat' },
  badges: [{ set_id: 'moderator', id: '1', info: '' }],
});
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
async function begin(captureUser?: Login) {
  const response = await request(
    captureUser ? '/auth/twitch/capture' : '/auth/twitch',
    captureUser,
  );
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
async function login(
  code: keyof typeof identities,
  capture = false,
): Promise<Login> {
  const start = await begin(capture ? owner : undefined);
  const response = await request(
    `/auth/twitch/callback?state=${start.state}&code=${code}`,
    undefined,
    'GET',
    undefined,
    { Cookie: start.cookie },
  );
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe(`${origin}/app`);
  const rawCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('lore_session='))!;
  expect(rawCookie).toContain('HttpOnly');
  expect(rawCookie).toContain('Path=/;');
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
    if (
      req.url === '/oauth2/token' &&
      params.get('grant_type') === 'client_credentials'
    ) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ access_token: 'app-access', expires_in: 3600 }));
      return;
    }
    if (req.url?.startsWith('/helix/eventsub/subscriptions')) {
      expect(req.headers.authorization).toBe('Bearer app-access');
      expect(req.headers['client-id']).toBe('test-client');
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST') {
        const requested = JSON.parse(Buffer.concat(chunks).toString());
        expect(requested.transport.secret).toBe(webhookSecret);
        const sub = {
          ...requested,
          id: `sub-${++subscriptionSequence}`,
          status: 'webhook_callback_verification_pending',
          transport: { method: 'webhook' as const, callback: callbackUrl },
        };
        remoteSubscriptions.set(sub.id, sub);
        const challenge = await deliver(sub.type, undefined, {
          kind: 'webhook_callback_verification',
          subscriptionId: sub.id,
          challenge: 'verified-challenge',
        });
        if (challenge.status === 200) {
          expect(challenge.headers.get('content-type')).toContain('text/plain');
          expect(await challenge.text()).toBe('verified-challenge');
          sub.status = 'enabled';
        } else sub.status = 'webhook_callback_verification_failed';
        res.writeHead(202).end(JSON.stringify({ data: [sub] }));
      } else if (req.method === 'DELETE') {
        remoteSubscriptions.delete(
          new URL(req.url, 'http://localhost').searchParams.get('id')!,
        );
        res.writeHead(204).end();
      } else
        res.end(
          JSON.stringify({
            data: [...remoteSubscriptions.values()],
            pagination: {},
          }),
        );
      return;
    }
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
          scopes: name === 'owner' && captureGranted ? captureScopes : [],
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
  const redisTarget = new URL(
    process.env.REDIS_URL || 'redis://127.0.0.1:56379',
  );
  redisProxy = createNetServer((socket) => {
    if (redisUnavailable) {
      socket.destroy();
      return;
    }
    const upstream = connectSocket(
      Number(redisTarget.port || 6379),
      redisTarget.hostname,
    );
    redisSockets.add(socket);
    redisSockets.add(upstream);
    const close = () => {
      socket.destroy();
      upstream.destroy();
      redisSockets.delete(socket);
      redisSockets.delete(upstream);
    };
    socket.on('error', close);
    upstream.on('error', close);
    socket.on('close', close);
    upstream.on('close', close);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  const redisProxyPort = await listen(redisProxy);
  const proxyUrl = new URL(redisTarget);
  proxyUrl.hostname = '127.0.0.1';
  proxyUrl.port = String(redisProxyPort);
  queue = new Queue(queueNames.ingestion, {
    prefix: database,
    connection: {
      host: redisTarget.hostname,
      port: Number(redisTarget.port || 6379),
      ...(redisTarget.password
        ? { password: decodeURIComponent(redisTarget.password) }
        : {}),
    },
  });
  apiEnvironment = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: isolatedUrl.toString(),
    QUEUE_PREFIX: database,
    REDIS_URL: proxyUrl.toString(),
    TWITCH_EVENTSUB_SECRET: webhookSecret,
    TWITCH_EVENTSUB_CALLBACK_URL: callbackUrl,
    API_PORT: String(port),
    APP_ORIGIN: origin,
    TWITCH_CLIENT_ID: 'test-client',
    TWITCH_CLIENT_SECRET: 'test-secret',
    AUTH_ENCRYPTION_KEY: encryptionKey,
    TWITCH_TEST_BASE_URL: `http://127.0.0.1:${mockPort}`,
  };
  await startApi();
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
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
  const cleanupRedis = new URL(
    process.env.REDIS_URL || 'redis://127.0.0.1:56379',
  );
  for (const name of [queueNames.ai, queueNames.caseAi, queueNames.catchup]) {
    const cleanup = new Queue(name, {
      prefix: database,
      connection: {
        host: cleanupRedis.hostname,
        port: Number(cleanupRedis.port),
      },
    });
    await cleanup.obliterate({ force: true });
    await cleanup.close();
  }
  for (const socket of redisSockets) socket.destroy();
  if (redisProxy)
    await new Promise<void>((done) => redisProxy.close(() => done()));
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.end();
});
describe('Twitch auth, channel management and EventSub over HTTP, PostgreSQL and Redis', () => {
  it('reports login availability without exposing secrets and redirects browser OAuth failures safely', async () => {
    const status = await request('/auth/status');
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ twitchConfigured: true });
    const failed = await request(
      '/auth/twitch/callback?state=bad',
      undefined,
      'GET',
      undefined,
      { Accept: 'text/html' },
    );
    expect(failed.status).toBe(302);
    expect(failed.headers.get('location')).toBe(`${origin}/login?error=signin`);
  });

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
  it('requires owner access, CSRF and explicit capture consent without broadening normal login', async () => {
    const ordinary = await request('/auth/twitch');
    expect(
      new URL(ordinary.headers.get('location')!).searchParams.get('scope'),
    ).toBe('');
    expect(
      (await request(`/channels/${channelId}/ingestion`, outsider)).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/channels/${channelId}/ingestion/start`,
          outsider,
          'POST',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/channels/${channelId}/ingestion/start`,
          owner,
          'POST',
          undefined,
          { 'x-csrf-token': '' },
        )
      ).status,
    ).toBe(403);
    expect(
      (await request(`/channels/${channelId}/ingestion/start`, owner, 'POST'))
        .status,
    ).toBe(409);
    const authorize = await request('/auth/twitch/capture', owner);
    expect(authorize.status).toBe(302);
    const url = new URL(authorize.headers.get('location')!);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(captureScopes);
    const browser = authorize.headers
      .getSetCookie()
      .find((value) => value.startsWith('lore_oauth='))!
      .split(';')[0];
    // Switching Twitch identity during an elevation flow must not elevate another account.
    expect(
      (
        await request(
          `/auth/twitch/callback?state=${url.searchParams.get('state')}&code=outsider`,
          undefined,
          'GET',
          undefined,
          { Cookie: browser },
        )
      ).status,
    ).toBe(401);
    captureGranted = true;
    owner = await login('owner', true);
    expect(
      (await request(`/channels/${channelId}/ingestion/start`, owner, 'POST'))
        .status,
    ).toBe(200);
    await eventually(
      async () => remoteSubscriptions.size === twitchEventTypes.length,
    );
    const status = ingestionStatusSchema.parse(
      await (await request(`/channels/${channelId}/ingestion`, owner)).json(),
    );
    expect(status.requested).toBe(true);
    expect(status.missingScopes).toEqual([]);
    expect(
      status.subscriptions.filter((sub) => sub.status === 'enabled'),
    ).toHaveLength(6);
  });
  it('authenticates callbacks and rejects stale, tampered, malformed and cross-channel payloads', async () => {
    expect(
      (
        await deliver('channel.chat.message', chat('bad-signature'), {
          signature: 'sha256=' + '0'.repeat(64),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await deliver('channel.chat.message', chat('stale'), {
          timestamp: new Date(Date.now() - 11 * 60_000).toISOString(),
        })
      ).status,
    ).toBe(401);
    expect(
      (await deliver('channel.chat.message', { broadcaster_user_id: '100' }))
        .status,
    ).toBe(400);
    expect(
      (
        await deliver('channel.chat.message', {
          ...chat('wrong-channel'),
          broadcaster_user_id: '300',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await deliver('channel.chat.message', {
          ...chat('foreign-shared'),
          source_broadcaster_user_id: '300',
        })
      ).status,
    ).toBe(204);
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM source_events'))
        .rows[0].count,
    ).toBe(0);
  });
  it('deduplicates deliveries and queues only identifiers while persisting normalized private chat', async () => {
    await queue.pause();
    const id = 'opaque:delivery-id';
    expect(
      (await deliver('channel.chat.message', chat('first-message'), { id }))
        .status,
    ).toBe(204);
    expect(
      (await deliver('channel.chat.message', chat('first-message'), { id }))
        .status,
    ).toBe(204);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM source_events WHERE id = $1',
          [id],
        )
      ).rows[0].count,
    ).toBe(1);
    await eventually(async () =>
      Boolean(await queue.getJob(deliveryJobId(id))),
    );
    const job = await queue.getJob(deliveryJobId(id));
    expect(job!.data).toEqual({ deliveryId: id });
    expect(JSON.stringify(job!.data)).not.toContain('Mock chat');
    await queue.resume();
    await eventually(
      async () =>
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM chat_messages WHERE channel_id = $1 AND message_id = $2',
            [channelId, 'first-message'],
          )
        ).rows[0].count === 1,
    );
    expect(
      (
        await pool.query(
          'SELECT origin, visibility, processed_at FROM source_events WHERE id = $1',
          [id],
        )
      ).rows[0],
    ).toMatchObject({
      origin: 'live_twitch',
      visibility: 'private',
      processed_at: expect.any(Date),
    });
  });
  it('does not acknowledge a delivery the database could not accept, allowing a safe retry', async () => {
    await pool.query(
      "ALTER TABLE source_events ADD CONSTRAINT integration_write_failure CHECK (id != 'database-write-failure')",
    );
    try {
      const rejected = await deliver(
        'channel.chat.message',
        chat('database-write-failure'),
        { id: 'database-write-failure' },
      );
      expect(rejected.status).toBe(500);
      expect(await rejected.json()).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    } finally {
      await pool.query(
        'ALTER TABLE source_events DROP CONSTRAINT integration_write_failure',
      );
    }
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM source_events WHERE id = 'database-write-failure'",
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await deliver('channel.chat.message', chat('database-write-failure'), {
          id: 'database-write-failure',
        })
      ).status,
    ).toBe(204);
    expect(output).not.toContain('Mock chat fixture');
  });
  it('acknowledges durable deliveries while Redis is unavailable and recovers them afterwards', async () => {
    redisUnavailable = true;
    const cleanupRedis = new URL(
      process.env.REDIS_URL || 'redis://127.0.0.1:56379',
    );
    for (const name of [queueNames.ai, queueNames.caseAi, queueNames.catchup]) {
      const cleanup = new Queue(name, {
        prefix: database,
        connection: {
          host: cleanupRedis.hostname,
          port: Number(cleanupRedis.port),
        },
      });
      await cleanup.obliterate({ force: true });
      await cleanup.close();
    }
    for (const socket of redisSockets) socket.destroy();
    try {
      const start = Date.now();
      expect(
        (
          await deliver('channel.chat.message', chat('redis-outage'), {
            id: 'redis-outage',
          })
        ).status,
      ).toBe(204);
      expect(Date.now() - start).toBeLessThan(2000);
      expect(
        (
          await pool.query('SELECT payload FROM source_events WHERE id = $1', [
            'redis-outage',
          ])
        ).rows[0].payload.message.text,
      ).toContain('Mock chat');
    } finally {
      redisUnavailable = false;
    }
    await eventually(
      async () =>
        (
          await pool.query(
            'SELECT processed_at FROM source_events WHERE id = $1',
            ['redis-outage'],
          )
        ).rows[0]?.processed_at !== null,
    );
  }, 30000);
  it('scrubs deleted chat and uses tombstones to prevent out-of-order resurrection', async () => {
    expect(
      (
        await deliver('channel.chat.message_delete', {
          broadcaster_user_id: '100',
          target_user_id: '200',
          message_id: 'first-message',
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM chat_messages WHERE message_id = $1',
          ['first-message'],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await pool.query('SELECT payload FROM source_events WHERE id = $1', [
          'opaque:delivery-id',
        ])
      ).rows[0].payload,
    ).toBeNull();
    await deliver('channel.chat.message_delete', {
      broadcaster_user_id: '100',
      target_user_id: '200',
      message_id: 'late-deleted',
    });
    await deliver('channel.chat.message', chat('late-deleted'), {
      id: 'late-deleted',
    });
    await eventually(async () =>
      Boolean(
        (
          await pool.query(
            'SELECT processed_at FROM source_events WHERE id = $1',
            ['late-deleted'],
          )
        ).rows[0]?.processed_at,
      ),
    );
    expect(
      (
        await pool.query('SELECT payload FROM source_events WHERE id = $1', [
          'late-deleted',
        ])
      ).rows[0].payload,
    ).toBeNull();
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM chat_messages WHERE message_id = $1',
          ['late-deleted'],
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it('handles user clears, room clears and normalized stream lifecycle deliveries', async () => {
    await deliver('channel.chat.clear_user_messages', {
      broadcaster_user_id: '100',
      target_user_id: '200',
    });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM chat_messages WHERE channel_id = $1 AND chatter_id = $2',
          [channelId, '200'],
        )
      ).rows[0].count,
    ).toBe(0);
    await deliver('channel.chat.message', chat('user-300', '300'), {
      id: 'user-300',
    });
    await eventually(async () =>
      Boolean(
        (
          await pool.query(
            'SELECT processed_at FROM source_events WHERE id = $1',
            ['user-300'],
          )
        ).rows[0]?.processed_at,
      ),
    );
    await deliver('channel.chat.clear', { broadcaster_user_id: '100' });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM chat_messages WHERE channel_id = $1',
          [channelId],
        )
      ).rows[0].count,
    ).toBe(0);
    await deliver(
      'stream.online',
      {
        broadcaster_user_id: '100',
        id: 'stream-1',
        type: 'live',
        started_at: new Date().toISOString(),
      },
      { id: 'stream-online' },
    );
    await deliver(
      'stream.offline',
      { broadcaster_user_id: '100' },
      { id: 'stream-offline' },
    );
    await eventually(
      async () =>
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM source_events WHERE id IN ('stream-online', 'stream-offline') AND processed_at IS NOT NULL",
          )
        ).rows[0].count === 2,
    );
  });
  it('applies shortened retention, expires raw payloads and retains payload-free deduplication receipts', async () => {
    await deliver('channel.chat.message', chat('expires'), { id: 'expires' });
    await eventually(async () =>
      Boolean(
        (
          await pool.query(
            'SELECT processed_at FROM source_events WHERE id = $1',
            ['expires'],
          )
        ).rows[0]?.processed_at,
      ),
    );
    await pool.query(
      "UPDATE source_events SET occurred_at = now() - interval '2 days' WHERE id = 'expires'",
    );
    await pool.query(
      "UPDATE chat_messages SET occurred_at = now() - interval '2 days' WHERE message_id = 'expires'",
    );
    // Run the same registered retention worker without waiting for the minute scheduler.
    const purge = await queue.add(
      'retention',
      {},
      { jobId: 'retention-integration-test', removeOnComplete: false },
    );
    await eventually(async () => (await purge.getState()) === 'completed');
    expect(
      (
        await pool.query(
          "SELECT payload FROM source_events WHERE id = 'expires'",
        )
      ).rows[0].payload,
    ).toBeNull();
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM chat_messages WHERE message_id = 'expires'",
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await deliver('channel.chat.message', chat('expires'), {
          id: 'expires',
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await pool.query(
          "SELECT payload FROM source_events WHERE id = 'expires'",
        )
      ).rows[0].payload,
    ).toBeNull();
  });
  it('makes shortened deadlines permanent, purges immediately and exposes owner-only cleanup status', async () => {
    await request(`/channels/${channelId}/settings`, owner, 'PATCH', {
      chatRetentionDays: 7,
    });
    await deliver('channel.chat.message', chat('permanent-expiry'), {
      id: 'permanent-expiry',
    });
    await eventually(async () =>
      Boolean(
        (
          await pool.query(
            "SELECT processed_at FROM source_events WHERE id='permanent-expiry'",
          )
        ).rows[0]?.processed_at,
      ),
    );
    await pool.query(
      "UPDATE source_events SET occurred_at=now()-interval '2 days' WHERE id='permanent-expiry'",
    );
    await pool.query(
      "UPDATE chat_messages SET occurred_at=now()-interval '2 days' WHERE message_id='permanent-expiry'",
    );
    expect(
      (
        await request(`/channels/${channelId}/settings`, owner, 'PATCH', {
          chatRetentionDays: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT payload FROM source_events WHERE id='permanent-expiry'",
        )
      ).rows[0].payload,
    ).toBeNull();
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM chat_messages WHERE message_id='permanent-expiry'",
        )
      ).rows[0].n,
    ).toBe(0);
    await request(`/channels/${channelId}/settings`, owner, 'PATCH', {
      chatRetentionDays: 7,
    });
    expect(
      (
        await pool.query(
          "SELECT expires_at<now() AS expired FROM source_events WHERE id='permanent-expiry'",
        )
      ).rows[0].expired,
    ).toBe(true);
    expect(
      (await request(`/channels/${channelId}/retention`, member)).status,
    ).toBe(404);
    expect(
      (await request(`/channels/${channelId}/retention`, outsider)).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/channels/${channelId}/retention/purge`,
          owner,
          'POST',
          {},
          { 'x-csrf-token': '' },
        )
      ).status,
    ).toBe(403);
    const response = await request(
      `/channels/${channelId}/retention/purge`,
      owner,
      'POST',
      {},
    );
    expect(response.status).toBe(200);
    const status = retentionStatusSchema.parse(await response.json());
    expect(status.lastPurgedAt).not.toBeNull();
    expect(status.expiredMessages).toBe(0);
    expect(JSON.stringify(status)).not.toContain('permanent-expiry');
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE channel_id=$1 AND action='retention.purged'",
          [channelId],
        )
      ).rows[0].n,
    ).toBeGreaterThan(0);
    await request(`/channels/${channelId}/settings`, owner, 'PATCH', {
      chatRetentionDays: 1,
    });
  });
  it('purges expired authentication material without waiting for another login', async () => {
    const userId = (
      await pool.query("SELECT id FROM users WHERE twitch_user_id='100'")
    ).rows[0].id;
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at)VALUES($1,$2,now()-interval '1 hour')",
      ['expired-session-receipt', userId],
    );
    await pool.query(
      "INSERT INTO oauth_states(state_hash,browser_hash,expires_at)VALUES('expired-oauth-state','synthetic',now()-interval '1 hour'),('active-oauth-state','synthetic',now()+interval '1 hour')",
    );
    const job = await queue.add(
      'retention',
      {},
      { jobId: 'authentication-retention-check' },
    );
    await eventually(async () => (await job.getState()) === 'completed');
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM sessions WHERE token_hash='expired-session-receipt'",
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM oauth_states WHERE state_hash='expired-oauth-state'",
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM oauth_states WHERE state_hash='active-oauth-state'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect((await request('/auth/session', owner)).status).toBe(200);
  });
  it('rejects malformed and oversized JSON without echoing request data', async () => {
    for (const [body, expected] of [
      ['PRIVATE_PARSE_SENTINEL {', 400],
      [
        JSON.stringify({ text: 'PRIVATE_SIZE_SENTINEL' + 'x'.repeat(110000) }),
        413,
      ],
    ] as const) {
      const response = await fetch(`${origin}/api/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      expect(response.status).toBe(expected);
      expect(await response.text()).not.toMatch(/PRIVATE_|xxxxx/);
    }
    const health = await request('/health');
    expect(health.headers.get('x-powered-by')).toBeNull();
    expect(health.headers.get('x-frame-options')).toBe('DENY');
  });
  it('bounds ingestion retries, validates persisted jobs and reports exhausted work', async () => {
    await pool.query(
      `INSERT INTO source_events (id, channel_id, subscription_id, type, occurred_at, payload, expires_at) VALUES ($1, $2, $3, $4, now(), $5, now() + interval '1 day')`,
      [
        'malformed-persisted',
        channelId,
        'fixture-sub',
        'channel.chat.message',
        { broadcaster_user_id: '100' },
      ],
    );
    await queue.add(
      'eventsub',
      { deliveryId: 'malformed-persisted' },
      {
        jobId: deliveryJobId('malformed-persisted'),
        attempts: 2,
        backoff: { type: 'fixed', delay: 10 },
      },
    );
    await eventually(async () =>
      Boolean(
        (
          await pool.query(
            "SELECT failed_at FROM source_events WHERE id = 'malformed-persisted'",
          )
        ).rows[0]?.failed_at,
      ),
    );
    expect(
      (await queue.getJob(deliveryJobId('malformed-persisted')))!.attemptsMade,
    ).toBe(2);
    const status = ingestionStatusSchema.parse(
      await (await request(`/channels/${channelId}/ingestion`, owner)).json(),
    );
    expect(status.failed).toBe(1);
  });
  describe('promise capture and next-stream brief', () => {
    let manual: OpenLoop;
    let commandLoop: OpenLoop;
    const commandId = 'promise-command-moderator';
    it('creates confirmed dashboard promises idempotently with scoped evidence and human attribution', async () => {
      await restartApi();
      const input = {
        wording: 'Finish the mock island tour.',
        ownerLabel: 'Owner',
        dueContext: 'Next stream',
        requestId: '10000000-0000-4000-8000-000000000001',
      };
      const created = await request(
        `/channels/${channelId}/open-loops`,
        owner,
        'POST',
        input,
      );
      expect(created.status).toBe(200);
      manual = openLoopResponseSchema.parse(await created.json());
      expect(manual).toMatchObject({
        status: 'confirmed',
        origin: 'manual_import',
        captureMethod: 'dashboard',
        version: 1,
        source: { excerpt: input.wording, originalAvailable: null },
      });
      const duplicate = await request(
        `/channels/${channelId}/open-loops`,
        owner,
        'POST',
        input,
      );
      expect(openLoopResponseSchema.parse(await duplicate.json()).id).toBe(
        manual.id,
      );
      expect(
        (
          await request(`/channels/${channelId}/open-loops`, owner, 'POST', {
            ...input,
            wording: 'Different intent.',
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM evidence WHERE channel_id = $1',
            [channelId],
          )
        ).rows[0].count,
      ).toBe(1);
      const history = await (
        await request(
          `/channels/${channelId}/open-loops/${manual.id}/history`,
          owner,
        )
      ).json();
      expect(history).toMatchObject([
        {
          version: 1,
          fromStatus: null,
          toStatus: 'confirmed',
          actorTwitchUserId: '100',
        },
      ]);
    });
    it('requires sessions, CSRF, connected membership and server-owned status/origin', async () => {
      const path = `/channels/${channelId}/open-loops`;
      const input = {
        wording: 'Mock promise.',
        requestId: '10000000-0000-4000-8000-000000000002',
      };
      expect((await request(path)).status).toBe(401);
      expect(
        (await request(path, owner, 'POST', input, { 'x-csrf-token': '' }))
          .status,
      ).toBe(403);
      for (const who of [outsider, member]) {
        expect((await request(path, who)).status).toBe(404);
        expect((await request(path, who, 'POST', input)).status).toBe(404);
        expect((await request(`${path}/${manual.id}`, who)).status).toBe(404);
        expect(
          (await request(`${path}/${manual.id}/history`, who)).status,
        ).toBe(404);
        expect(
          (await request(`/channels/${channelId}/brief`, who)).status,
        ).toBe(404);
      }
      for (const body of [
        { ...input, status: 'confirmed' },
        { ...input, origin: 'live_twitch' },
        { ...input, channelId },
        { ...input, wording: ' ' },
      ])
        expect((await request(path, owner, 'POST', body)).status).toBe(400);
      await request(`/channels/${channelId}/members`, owner, 'POST', {
        twitchUserId: '200',
        role: 'team',
      });
      expect((await request(path, member)).status).toBe(200);
      const ownOther = await pool.query(
        "SELECT id FROM channels WHERE twitch_channel_id = '300'",
      );
      expect(
        (
          await request(
            `/channels/${ownOther.rows[0].id}/open-loops/${manual.id}`,
            outsider,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await request(
            `/channels/${ownOther.rows[0].id}/open-loops/${manual.id}`,
            outsider,
            'PATCH',
            { status: 'in_progress', expectedVersion: 1 },
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await request(
            `/channels/${ownOther.rows[0].id}/open-loops?cursor=${manual.id}`,
            outsider,
          )
        ).status,
      ).toBe(404);
    });
    it('enforces allowed transitions, terminal reasons and optimistic concurrency', async () => {
      const path = `/channels/${channelId}/open-loops/${manual.id}`;
      expect(
        (
          await request(path, member, 'PATCH', {
            status: 'fulfilled',
            expectedVersion: 1,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(path, member, 'PATCH', {
            status: 'candidate',
            expectedVersion: 1,
          })
        ).status,
      ).toBe(409);
      const responses = await Promise.all([
        request(path, member, 'PATCH', {
          status: 'in_progress',
          expectedVersion: 1,
          reason: 'Working on it.',
        }),
        request(path, member, 'PATCH', {
          status: 'postponed',
          expectedVersion: 1,
          reason: 'Needs more time.',
        }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      manual = openLoopResponseSchema.parse(
        await (await request(path, owner)).json(),
      );
      expect(manual.version).toBe(2);
      if (manual.status === 'postponed')
        manual = openLoopResponseSchema.parse(
          await (
            await request(path, member, 'PATCH', {
              status: 'confirmed',
              expectedVersion: manual.version,
            })
          ).json(),
        );
      const fulfilled = await request(path, member, 'PATCH', {
        status: 'fulfilled',
        expectedVersion: manual.version,
        reason: 'Completed during the test stream.',
      });
      expect(fulfilled.status).toBe(200);
      manual = openLoopResponseSchema.parse(await fulfilled.json());
      expect(
        (
          await request(path, member, 'PATCH', {
            status: 'confirmed',
            expectedVersion: manual.version,
          })
        ).status,
      ).toBe(409);
      const history = z
        .array(openLoopHistorySchema)
        .parse(await (await request(`${path}/history`, owner)).json());
      expect(history.at(-1)).toMatchObject({
        toStatus: 'fulfilled',
        reason: 'Completed during the test stream.',
        actorTwitchUserId: '200',
      });
      const retry = await request(
        `/channels/${channelId}/open-loops`,
        owner,
        'POST',
        {
          wording: 'Finish the mock island tour.',
          ownerLabel: 'Owner',
          dueContext: 'Next stream',
          requestId: '10000000-0000-4000-8000-000000000001',
        },
      );
      expect(openLoopResponseSchema.parse(await retry.json()).status).toBe(
        'fulfilled',
      );
    });
    it('captures only explicit broadcaster/moderator commands and deduplicates by Twitch chat message across restarts', async () => {
      for (const [id, badges, text, chatter] of [
        ['viewer-command', [], '!promise not authorized', '300'],
        [
          'vip-command',
          [{ set_id: 'vip', id: '1', info: '' }],
          '!promise not authorized',
          '300',
        ],
        [
          'ordinary-moderator',
          [{ set_id: 'moderator', id: '1', info: '' }],
          'I might promise this later.',
          '200',
        ],
      ] as const)
        await deliver(
          'channel.chat.message',
          { ...chat(id, chatter), badges, message: { text } },
          { id },
        );
      const event = {
        ...chat(commandId),
        message: { text: '!promise Share the mock emote sketches.' },
      };
      expect(
        (
          await deliver('channel.chat.message', event, {
            id: 'promise-delivery-1',
          })
        ).status,
      ).toBe(204);
      await eventually(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int AS count FROM open_loops WHERE channel_id = $1 AND capture_method = 'chat_command'",
              [channelId],
            )
          ).rows[0].count === 1,
      );
      await restartApi();
      await deliver('channel.chat.message', event, {
        id: 'promise-delivery-2',
      });
      await eventually(async () =>
        Boolean(
          (
            await pool.query(
              "SELECT processed_at FROM source_events WHERE id = 'promise-delivery-2'",
            )
          ).rows[0]?.processed_at,
        ),
      );
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM open_loops WHERE channel_id = $1 AND capture_method = 'chat_command'",
            [channelId],
          )
        ).rows[0].count,
      ).toBe(1);
      const page = openLoopPageSchema.parse(
        await (
          await request(`/channels/${channelId}/open-loops`, owner)
        ).json(),
      );
      commandLoop = page.items.find(
        (loop) => loop.captureMethod === 'chat_command',
      )!;
      expect(commandLoop).toMatchObject({
        wording: 'Share the mock emote sketches.',
        status: 'confirmed',
        origin: 'live_twitch',
        source: { excerpt: event.message.text, originalAvailable: true },
      });
      const broadcaster = {
        ...chat('broadcaster-promise', '100'),
        badges: [{ set_id: 'broadcaster', id: '1', info: '' }],
        message: { text: '!promise Finish the mock community vote.' },
      };
      await deliver('channel.chat.message', broadcaster, {
        id: 'broadcaster-promise',
      });
      await eventually(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int AS count FROM open_loops WHERE channel_id = $1 AND capture_method = 'chat_command'",
              [channelId],
            )
          ).rows[0].count === 2,
      );
    });
    it('never turns a removed or out-of-order deleted message into a promise', async () => {
      await deliver('channel.chat.message_delete', {
        broadcaster_user_id: '100',
        target_user_id: '200',
        message_id: 'promise-deleted-first',
      });
      await deliver(
        'channel.chat.message',
        {
          ...chat('promise-deleted-first'),
          message: { text: '!promise Never retain this deleted fixture.' },
        },
        { id: 'promise-deleted-first' },
      );
      await eventually(async () =>
        Boolean(
          (
            await pool.query(
              "SELECT processed_at FROM source_events WHERE id = 'promise-deleted-first'",
            )
          ).rows[0]?.processed_at,
        ),
      );
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM open_loops WHERE capture_key = 'promise-deleted-first'",
          )
        ).rows[0].count,
      ).toBe(0);
    });
    it('retains confirmed evidence through chat deletion, purge and source receipt removal', async () => {
      await deliver('channel.chat.message_delete', {
        broadcaster_user_id: '100',
        target_user_id: '200',
        message_id: commandId,
      });
      let loop = openLoopResponseSchema.parse(
        await (
          await request(
            `/channels/${channelId}/open-loops/${commandLoop.id}`,
            member,
          )
        ).json(),
      );
      expect(loop.source).toEqual({
        excerpt: '!promise Share the mock emote sketches.',
        originalAvailable: false,
      });
      await pool.query(
        "DELETE FROM source_events WHERE id = 'promise-delivery-1'",
      );
      const purge = await queue.add(
        'retention',
        {},
        { jobId: 'promise-evidence-retention', removeOnComplete: false },
      );
      await eventually(async () => (await purge.getState()) === 'completed');
      loop = openLoopResponseSchema.parse(
        await (
          await request(
            `/channels/${channelId}/open-loops/${commandLoop.id}`,
            member,
          )
        ).json(),
      );
      expect(loop.source).toEqual({
        excerpt: '!promise Share the mock emote sketches.',
        originalAvailable: false,
      });
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM evidence WHERE channel_id = $1',
            [channelId],
          )
        ).rows[0].count,
      ).toBe(3);
    });
    it('builds a scoped brief with current active records, source references and no invented context', async () => {
      const updated = await request(
        `/channels/${channelId}/open-loops/${commandLoop.id}`,
        member,
        'PATCH',
        { status: 'in_progress', expectedVersion: 1 },
      );
      expect(updated.status).toBe(200);
      const brief = streamBriefSchema.parse(
        await (await request(`/channels/${channelId}/brief`, member)).json(),
      );
      expect(brief.method).toBe('saved_open_loops');
      expect(brief.activeCount).toBe(2);
      expect(brief.items[0].id).toBe(commandLoop.id);
      expect(brief.items.some((loop) => loop.id === manual.id)).toBe(false);
      expect(
        brief.items.every(
          (loop) => loop.channelId === channelId && loop.source.excerpt,
        ),
      ).toBe(true);
      const other = (
        await pool.query(
          "SELECT id FROM channels WHERE twitch_channel_id = '300'",
        )
      ).rows[0].id;
      expect(
        streamBriefSchema.parse(
          await (await request(`/channels/${other}/brief`, outsider)).json(),
        ).items,
      ).toEqual([]);
    });
    it('supports chronological pagination and status filters without crossing channels', async () => {
      const proof = (
        await pool.query('SELECT evidence_id FROM open_loops WHERE id = $1', [
          manual.id,
        ])
      ).rows[0].evidence_id;
      await pool.query(
        `INSERT INTO open_loops (channel_id, wording, status, origin, capture_method, capture_key, evidence_id, created_at) SELECT $1, 'Pagination fixture ' || n, 'confirmed', 'manual_import', 'dashboard', 'page-' || n, $2, now() - n * interval '1 minute' FROM generate_series(1, 52) n`,
        [channelId, proof],
      );
      const first = openLoopPageSchema.parse(
        await (
          await request(
            `/channels/${channelId}/open-loops?status=confirmed`,
            owner,
          )
        ).json(),
      );
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).not.toBeNull();
      const next = openLoopPageSchema.parse(
        await (
          await request(
            `/channels/${channelId}/open-loops?status=confirmed&cursor=${first.nextCursor}`,
            owner,
          )
        ).json(),
      );
      expect(next.items).toHaveLength(3);
      expect(next.nextCursor).toBeNull();
      expect(
        next.items.every(
          (loop) => !first.items.some((saved) => saved.id === loop.id),
        ),
      ).toBe(true);
      const brief = streamBriefSchema.parse(
        await (await request(`/channels/${channelId}/brief`, owner)).json(),
      );
      expect(brief.items).toHaveLength(20);
      expect(brief.activeCount).toBe(54);
      await pool.query(
        "DELETE FROM open_loops WHERE channel_id = $1 AND capture_key LIKE 'page-%'",
        [channelId],
      );
    });
    it('removes member access immediately and keeps disconnected owner views read-only', async () => {
      await request(
        `/channels/${channelId}/members/${member.id}`,
        owner,
        'DELETE',
      );
      expect(
        (await request(`/channels/${channelId}/brief`, member)).status,
      ).toBe(404);
      expect(
        (
          await request(
            `/channels/${channelId}/open-loops/${commandLoop.id}`,
            member,
            'PATCH',
            {
              status: 'fulfilled',
              expectedVersion: 2,
              reason: 'Not permitted.',
            },
          )
        ).status,
      ).toBe(404);
      await request(`/channels/${channelId}/disconnect`, owner, 'POST');
      expect(
        (await request(`/channels/${channelId}/open-loops`, owner)).status,
      ).toBe(200);
      expect(
        (
          await request(
            `/channels/${channelId}/open-loops/${commandLoop.id}`,
            owner,
            'PATCH',
            {
              status: 'fulfilled',
              expectedVersion: 2,
              reason: 'Disconnected.',
            },
          )
        ).status,
      ).toBe(409);
      await request('/channels/connect', owner, 'POST', {});
      await request(`/channels/${channelId}/ingestion/start`, owner, 'POST');
      await restartApi();
      await eventually(async () => {
        const live = await pool.query(
          "SELECT id FROM twitch_subscriptions WHERE channel_id = $1 AND status = 'enabled'",
          [channelId],
        );
        return (
          live.rows.length === 6 &&
          remoteSubscriptions.size === 6 &&
          live.rows.every(
            (row) => remoteSubscriptions.get(row.id)?.status === 'enabled',
          )
        );
      });
    });
  });
  it('stops processing on revocation, owner stop and channel disconnect', async () => {
    const sub = [...remoteSubscriptions.values()].find(
      (s) => s.type === 'channel.chat.message',
    )!;
    await deliver('channel.chat.message', undefined, {
      kind: 'revocation',
      status: 'authorization_revoked',
      subscriptionId: sub.id,
    });
    let status = ingestionStatusSchema.parse(
      await (await request(`/channels/${channelId}/ingestion`, owner)).json(),
    );
    expect(status.requested).toBe(false);
    expect(status.error).toBe('authorization_required');
    await deliver('channel.chat.message', chat('after-revocation'), {
      id: 'after-revocation',
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM source_events WHERE id = 'after-revocation'",
        )
      ).rows[0].count,
    ).toBe(0);
    await request(`/channels/${channelId}/ingestion/start`, owner, 'POST');
    expect(
      (await request(`/channels/${channelId}/ingestion/stop`, owner, 'POST'))
        .status,
    ).toBe(200);
    status = ingestionStatusSchema.parse(
      await (await request(`/channels/${channelId}/ingestion`, owner)).json(),
    );
    expect(status.requested).toBe(false);
    await request(`/channels/${channelId}/disconnect`, owner, 'POST');
    expect(
      (await request(`/channels/${channelId}/ingestion/start`, owner, 'POST'))
        .status,
    ).toBe(409);
    await request('/channels/connect', owner, 'POST', {});
    // A later login and reconnect never opt a channel back into capture.
    expect(
      ingestionStatusSchema.parse(
        await (await request(`/channels/${channelId}/ingestion`, owner)).json(),
      ).requested,
    ).toBe(false);
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
