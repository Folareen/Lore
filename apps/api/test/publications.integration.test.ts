import { drizzle } from 'drizzle-orm/node-postgres';
import { seedDemo } from '../src/database/seed-demo';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  demoDatasetSchema,
  discoverPageSchema,
  demoSeed,
  overlaySettingsSchema,
  overlayTokenSchema,
  overlayDisplaySchema,
  managedPublicationSchema,
  publicationPageSchema,
  publicFeedSchema,
  publicCatchupSchema,
  publicEntrySchema,
  publicationHistorySchema,
  catchupSettingsSchema,
  catchupScopes,
  captureScopes,
  queueNames,
  type ManagedPublication,
  type PublicationFields,
} from '@lore/shared';
import { z } from 'zod';
import { csrfToken, hashToken, encryptTokens } from '../src/auth/auth-crypto';
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error('Set TEST_DATABASE_URL for isolated public Lore tests');
const database = `lore_public_test_${randomBytes(8).toString('hex')}`;
const admin = new Pool({ connectionString: url });
const isolated = new URL(url);
isolated.pathname = `/${database}`;
const pool = new Pool({ connectionString: isolated.toString() });
const actor = (twitch: string) => ({
  id: randomUUID(),
  twitch,
  token: randomBytes(32).toString('hex'),
});
const owner = actor('100'),
  moderator = actor('200'),
  team = actor('300'),
  outsider = actor('400');
const channelId = randomUUID(),
  foreignChannel = randomUUID(),
  key = randomBytes(32).toString('base64'),
  secret = 'synthetic-webhook-secret-32-characters',
  callback = 'https://lore-test.example/api/webhooks/twitch';
const imageObjects = new Map<string, Buffer>();
let holdImageReads = false;
let releaseImageRead: (() => void) | undefined;
let api: ChildProcess,
  mock: Server,
  origin: string,
  output = '',
  queue: Queue;
const subs = new Map<
  string,
  {
    id: string;
    type: string;
    version: string;
    status: string;
    condition: { broadcaster_user_id: string; user_id?: string };
    transport: { method: string; callback: string };
  }
>();
const sent: {
  message: string;
  sender_id: string;
  broadcaster_id: string;
  for_source_only: boolean;
}[] = [];
let sendMode: 'sent' | 'dropped' | 'ambiguous' = 'sent';
async function port(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return address.port;
}
async function eventually(check: () => Promise<boolean>, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw new Error(`Timed out: ${output.slice(-1200)}`);
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  user = owner,
  channel: string = channelId,
  csrf = true,
) {
  return fetch(`${origin}/api/channels/${channel}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      Cookie: `lore_session=${user.token}`,
      Origin: origin,
      ...(csrf ? { 'X-CSRF-Token': csrfToken(user.token) } : {}),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function publicRequest(path = '', channel = 'twitch-100') {
  return fetch(`${origin}/api/public/channels/${channel}${path}`);
}
const fields = (title = 'The garden is open') => ({
  kind: 'milestone',
  title,
  body: 'Chat chose the first three plants. Next up: naming the pond.',
  chatSummary: '',
  sourceIds: [],
  promiseId: null,
});
async function create(
  input: Partial<PublicationFields> = {},
  user = owner,
  channel: string = channelId,
) {
  const r = await request(
    '/publications',
    'POST',
    { ...fields(), ...input, requestId: randomUUID() },
    user,
    channel,
  );
  expect(r.status).toBe(200);
  return managedPublicationSchema.parse(await r.json());
}
async function action(
  record: ManagedPublication,
  action: 'publish' | 'unpublish' | 'delete',
  user = owner,
) {
  const r = await request(
    `/publications/${record.id}/review`,
    'POST',
    {
      expectedVersion: record.version,
      action,
      reason: 'Human reviewed the synthetic community wording.',
    },
    user,
    record.channelId,
  );
  expect(r.status).toBe(200);
  return managedPublicationSchema.parse(await r.json());
}
async function get(record: ManagedPublication) {
  const response = await request(
    `/publications/${record.id}`,
    'GET',
    undefined,
    owner,
    record.channelId,
  );
  return z
    .strictObject({
      entry: managedPublicationSchema,
      history: z.array(publicationHistorySchema),
    })
    .parse(await response.json());
}
async function deliver(
  type = 'channel.chat.message',
  text = '!catchup',
  messageId = randomUUID(),
  extras: Record<string, unknown> = {},
  options: {
    id?: string;
    timestamp?: string;
    kind?: string;
    subscription?: typeof subs extends Map<string, infer S> ? S : never;
  } = {},
) {
  const sub =
    options.subscription ?? [...subs.values()].find((s) => s.type === type)!;
  if (!sub) throw new Error('No test subscription');
  const body = JSON.stringify({
    subscription: sub,
    ...(options.kind === 'webhook_callback_verification'
      ? { challenge: 'synthetic-challenge' }
      : {
          event: {
            broadcaster_user_id: '100',
            chatter_user_id: '555',
            message_id: messageId,
            message: { text },
            badges: [],
            ...extras,
          },
        }),
  });
  const id = options.id ?? randomUUID(),
    timestamp = options.timestamp ?? new Date().toISOString();
  return fetch(`${origin}/api/webhooks/twitch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Twitch-Eventsub-Message-Id': id,
      'Twitch-Eventsub-Message-Timestamp': timestamp,
      'Twitch-Eventsub-Message-Type': options.kind ?? 'notification',
      'Twitch-Eventsub-Subscription-Type': type,
      'Twitch-Eventsub-Subscription-Version': '1',
      'Twitch-Eventsub-Message-Signature': `sha256=${createHmac('sha256', secret).update(id).update(timestamp).update(body).digest('hex')}`,
    },
    body,
  });
}
async function nextCommand() {
  await pool.query('UPDATE channels SET last_catchup_at=NULL WHERE id=$1', [
    channelId,
  ]);
  const messageId = randomUUID();
  expect(
    (await deliver('channel.chat.message', '!catchup', messageId)).status,
  ).toBe(204);
  let id = '';
  await eventually(async () => {
    const row = (
      await pool.query(
        'SELECT id FROM catchup_replies WHERE channel_id=$1 AND message_id=$2',
        [channelId, messageId],
      )
    ).rows[0];
    id = row?.id ?? '';
    return Boolean(id);
  });
  return { id, messageId };
}
async function waitStatus(id: string, status: string) {
  await eventually(
    async () =>
      (await pool.query('SELECT status FROM catchup_replies WHERE id=$1', [id]))
        .rows[0]?.status === status,
  );
}
beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${database}`);
  for (const file of readdirSync('apps/api/drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await pool.query(readFileSync(`apps/api/drizzle/${file}`, 'utf8'));
  for (const user of [owner, moderator, team, outsider]) {
    await pool.query(
      'INSERT INTO users(id,twitch_user_id,login,display_name) VALUES($1,$2,$3,$3)',
      [user.id, user.twitch, `user${user.twitch}`],
    );
    await pool.query(
      "INSERT INTO oauth_connections(user_id,encrypted_tokens,scopes,expires_at,validated_at)VALUES($1,$2,$3,now()+interval '1 day',now())",
      [
        user.id,
        encryptTokens(
          JSON.stringify({
            access_token: `access-${user.twitch}`,
            refresh_token: 'synthetic',
          }),
          user.id,
          key,
        ),
        user === owner ? [...captureScopes] : [],
      ],
    );
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at)VALUES($1,$2,now()+interval '1 day')",
      [hashToken(user.token), user.id],
    );
  }
  for (const [id, user] of [
    [channelId, owner],
    [foreignChannel, outsider],
  ] as const)
    await pool.query(
      "INSERT INTO channels(id,slug,twitch_channel_id,owner_user_id,display_name,origin,connected_at)VALUES($1,$2,$3,$4,$2,'live_twitch',now())",
      [id, `twitch-${user.twitch}`, user.twitch, user.id],
    );
  for (const [user, role] of [
    [moderator, 'moderator'],
    [team, 'team'],
  ] as const)
    await pool.query(
      'INSERT INTO memberships(channel_id,user_id,role,granted_by)VALUES($1,$2,$3,$4)',
      [channelId, user.id, role, owner.id],
    );
  mock = createServer(async (req, res) => {
    if (req.url?.startsWith('/test-bucket/')) {
      const key = new URL(req.url, 'http://test.local').pathname;
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        imageObjects.set(key, Buffer.concat(chunks));
        return void res.writeHead(200).end();
      }
      if (req.method === 'DELETE') {
        imageObjects.delete(key);
        return void res.writeHead(204).end();
      }
      const image = imageObjects.get(key);
      if (!image) return void res.writeHead(404).end();
      if (holdImageReads && req.method === 'GET')
        await new Promise<void>((resolve) => {
          releaseImageRead = resolve;
        });
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Content-Length', image.length);
      return void res.end(image);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/oauth2/token') {
      res.end(JSON.stringify({ access_token: 'app-access', expires_in: 3600 }));
      return;
    }
    if (req.url === '/oauth2/validate') {
      const id = req.headers.authorization?.replace('OAuth access-', '');
      res.end(
        JSON.stringify({
          client_id: 'test-client',
          user_id: id,
          login: `user${id}`,
          scopes: id === '100' ? catchupScopes : [],
          expires_in: 86400,
        }),
      );
      return;
    }
    if (req.url === '/helix/chat/messages') {
      expect(req.headers.authorization).toBe('Bearer app-access');
      expect(req.headers['client-id']).toBe('test-client');
      const body = JSON.parse(raw);
      sent.push(body);
      expect(body.for_source_only).toBe(true);
      expect(body.sender_id).toBe('100');
      expect(body.broadcaster_id).toBe('100');
      if (sendMode === 'ambiguous') {
        res.destroy();
        return;
      }
      res.end(
        JSON.stringify({
          data: [
            {
              is_sent: sendMode === 'sent',
              message_id: sendMode === 'sent' ? randomUUID() : '',
              drop_reason:
                sendMode === 'dropped'
                  ? { code: 'automod_held', message: 'Synthetic' }
                  : null,
            },
          ],
        }),
      );
      return;
    }
    if (req.url?.startsWith('/helix/eventsub/subscriptions')) {
      if (req.method === 'POST') {
        const requested = JSON.parse(raw);
        const sub = {
          ...requested,
          id: randomUUID(),
          status: 'enabled',
          transport: { method: 'webhook', callback },
        };
        subs.set(sub.id, sub);
        const challenge = await deliver(
          sub.type,
          '',
          randomUUID(),
          {},
          { kind: 'webhook_callback_verification', subscription: sub },
        );
        expect(challenge.status).toBe(200);
        res.end(JSON.stringify({ data: [sub] }));
        return;
      }
      if (req.method === 'DELETE') {
        subs.delete(new URL(req.url, 'http://test').searchParams.get('id')!);
        res.writeHead(204).end();
        return;
      }
      res.end(JSON.stringify({ data: [...subs.values()], pagination: {} }));
      return;
    }
    res.writeHead(404).end();
  });
  const mockPort = await port(mock),
    temp = createServer(),
    apiPort = await port(temp);
  await new Promise<void>((r) => temp.close(() => r()));
  origin = `http://127.0.0.1:${apiPort}`;
  const redis = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
  queue = new Queue(queueNames.catchup, {
    prefix: database,
    connection: { host: redis.hostname, port: Number(redis.port) },
  });
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: isolated.toString(),
      REDIS_URL: redis.toString(),
      QUEUE_PREFIX: database,
      API_PORT: String(apiPort),
      APP_ORIGIN: origin,
      TWITCH_CLIENT_ID: 'test-client',
      TWITCH_CLIENT_SECRET: 'test-secret',
      AUTH_ENCRYPTION_KEY: key,
      TWITCH_TEST_BASE_URL: `http://127.0.0.1:${mockPort}`,
      TWITCH_EVENTSUB_SECRET: secret,
      TWITCH_EVENTSUB_CALLBACK_URL: callback,
      GEMINI_API_KEY: '',
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_BUCKET: 'test-bucket',
      R2_ACCESS_KEY_ID: 'mock-key',
      R2_SECRET_ACCESS_KEY: 'mock-secret',
      R2_TEST_ENDPOINT: `http://127.0.0.1:${mockPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout?.on('data', (c) => (output += c.toString()));
  api.stderr?.on('data', (c) => (output += c.toString()));
  await eventually(async () => {
    if (api.exitCode !== null) throw new Error(output.slice(-1200));
    try {
      return (await request('/publications')).ok;
    } catch {
      return false;
    }
  });
}, 60000);
afterAll(async () => {
  if (api && api.exitCode === null) {
    const ended = once(api, 'exit');
    api.kill('SIGTERM');
    await ended;
  }
  if (mock) await new Promise<void>((r) => mock.close(() => r()));
  if (queue) await queue.close();
  const redis = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
  for (const name of Object.values(queueNames)) {
    const q = new Queue(name, {
      prefix: database,
      connection: { host: redis.hostname, port: Number(redis.port) },
    });
    await q.obliterate({ force: true });
    await q.close();
  }
  await pool.end();
  await eventually(
    async () =>
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',
          [database],
        )
      ).rows[0].n === 0,
  );
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.end();
});
it('serves only the explicitly seeded demo snapshot without sign-in and seeds it idempotently', async () => {
  const load = () => fetch(`${origin}/api/demo`);
  expect((await load()).status).toBe(503);
  const before = await pool.query(
    'SELECT id,display_name FROM channels ORDER BY id',
  );
  await seedDemo(drizzle(pool));
  await seedDemo(drizzle(pool));
  const response = await load();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBeNull();
  const data = demoDatasetSchema.parse(await response.json());
  expect(data).toEqual(demoSeed);
  expect(
    (await pool.query('SELECT count(*)::int AS n FROM demo_datasets')).rows[0]
      .n,
  ).toBe(1);
  expect(
    (await pool.query('SELECT id,display_name FROM channels ORDER BY id')).rows,
  ).toEqual(before.rows);
  expect(JSON.stringify(data)).not.toContain(channelId);
  expect(JSON.stringify(data)).not.toContain(owner.token);
  expect(JSON.stringify(data)).not.toContain(key);
  expect(data.cases.every((c) => c.origin === 'demo_fixture')).toBe(true);
  expect(data.moderation.handoffs).toHaveLength(1);
  expect(
    (
      await fetch(`${origin}/api/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await fetch(`${origin}/api/channels`, {
        headers: { Cookie: 'lore_session=preview-only' },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await request(
        '/publications',
        'GET',
        undefined,
        owner,
        data.channels[0].id,
      )
    ).status,
  ).toBe(404);
});
it('fails closed for an invalid demo snapshot and does not fall back to live data', async () => {
  await pool.query('UPDATE demo_datasets SET payload=$1 WHERE slug=$2', [
    JSON.stringify({ label: 'PRIVATE_DATA_SENTINEL' }),
    'lore-demo',
  ]);
  const response = await fetch(`${origin}/api/demo`);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('PRIVATE_DATA_SENTINEL');
  await seedDemo(drizzle(pool));
});
let entry: ManagedPublication, summary: ManagedPublication;
it('requires channel access and CSRF for drafts and human owner/moderator approval for publication', async () => {
  expect((await publicRequest()).status).toBe(404);
  expect(
    (await request('/publications', 'GET', undefined, outsider)).status,
  ).toBe(404);
  expect(
    (
      await request(
        '/publications',
        'POST',
        { ...fields(), requestId: randomUUID() },
        owner,
        channelId,
        false,
      )
    ).status,
  ).toBe(403);
  const input = { ...fields(), requestId: randomUUID() };
  const created = await request('/publications', 'POST', input, team);
  expect(created.status).toBe(200);
  entry = managedPublicationSchema.parse(await created.json());
  expect(
    managedPublicationSchema.parse(
      await (await request('/publications', 'POST', input, team)).json(),
    ).id,
  ).toBe(entry.id);
  expect((await publicRequest()).status).toBe(404);
  expect(
    (
      await request(
        `/publications/${entry.id}/review`,
        'POST',
        {
          expectedVersion: 1,
          action: 'publish',
          reason: 'Team cannot approve.',
        },
        team,
      )
    ).status,
  ).toBe(404);
  const responses = await Promise.all([
    request(`/publications/${entry.id}/review`, 'POST', {
      expectedVersion: 1,
      action: 'publish',
      reason: 'Owner reviewed exact wording.',
    }),
    request(
      `/publications/${entry.id}/review`,
      'POST',
      {
        expectedVersion: 1,
        action: 'publish',
        reason: 'Moderator reviewed exact wording.',
      },
      moderator,
    ),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  entry = managedPublicationSchema.parse(
    await responses.find((r) => r.status === 200)!.json(),
  );
  expect((await get(entry)).history).toHaveLength(2);
  expect(
    (
      await request(
        `/publications/${entry.id}`,
        'PATCH',
        { ...fields('Team edit'), expectedVersion: entry.version },
        team,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await request('/publications', 'POST', {
        ...fields(),
        requestId: randomUUID(),
        caseId: randomUUID(),
      })
    ).status,
  ).toBe(400);
});
it('returns only approved public projections and never searches or resolves private case, evidence or promise IDs', async () => {
  const promise = await request('/open-loops', 'POST', {
    wording: 'PRIVATE_PROMISE_SENTINEL',
    requestId: randomUUID(),
  });
  const promiseId = z.object({ id: z.uuid() }).parse(await promise.json()).id;
  const privateCase = await request('/cases', 'POST', {
    title: 'PRIVATE_CASE_SENTINEL',
    subjectReference: 'PRIVATE_IDENTITY_SENTINEL',
    incident: 'PRIVATE_APPEAL_SENTINEL',
    appeal: 'Private appeal',
    incidentAt: null,
    ruleTitle: 'Private rule',
    ruleVersion: '1',
    ruleText: 'Private text',
    requestId: randomUUID(),
  });
  const caseId = z.object({ id: z.uuid() }).parse(await privateCase.json()).id;
  const safe = await action(
    await create({
      kind: 'commitment',
      title: 'An approved commitment update',
      body: 'The community garden will get a pond next stream.',
      promiseId,
    }),
    'publish',
  );
  const feedResponse = await publicRequest();
  expect(feedResponse.headers.get('cache-control')).toBe('no-store');
  const raw = await feedResponse.text();
  const feed = publicFeedSchema.parse(JSON.parse(raw));
  expect(feed.items.some((e) => e.id === safe.id)).toBe(true);
  for (const secret of [
    promiseId,
    caseId,
    'PRIVATE_PROMISE_SENTINEL',
    'PRIVATE_CASE_SENTINEL',
    'PRIVATE_APPEAL_SENTINEL',
    'approvedByTwitchUserId',
    'sourceIds',
    'promiseId',
    'inputFingerprint',
  ])
    expect(raw).not.toContain(secret);
  expect((await publicRequest(`/entries/${caseId}`)).status).toBe(404);
  expect((await publicRequest(`/entries/${promiseId}`)).status).toBe(404);
  expect(
    publicFeedSchema.parse(await (await publicRequest(`?q=${caseId}`)).json())
      .items,
  ).toHaveLength(0);
  expect(
    publicFeedSchema.parse(
      await (await publicRequest('?q=PRIVATE_APPEAL_SENTINEL')).json(),
    ).items,
  ).toHaveLength(0);
  expect(
    publicFeedSchema.parse(await (await publicRequest('?q=%25')).json()).items,
  ).toHaveLength(0);
  expect(
    (
      await request('/publications', 'POST', {
        ...fields(),
        requestId: randomUUID(),
        sourceIds: [caseId],
      })
    ).status,
  ).toBe(404);
  const foreign = await action(
    await create({}, outsider, foreignChannel),
    'publish',
    outsider,
  );
  expect(
    (
      await request('/publications', 'POST', {
        ...fields(),
        requestId: randomUUID(),
        sourceIds: [foreign.id],
      })
    ).status,
  ).toBe(404);
  expect((await publicRequest(`/entries/${foreign.id}`)).status).toBe(404);
  expect(publicEntrySchema.safeParse(await feed.items[0]).success).toBe(true);
});
it('withdraws transitive summary dependencies when a source is edited, unpublished or deleted', async () => {
  const source = await action(
    await create({ title: 'A shared reference' }),
    'publish',
  );
  summary = await action(
    await create({
      kind: 'summary',
      title: 'The newcomer recap',
      body: 'Our approved garden story, explained for newcomers.',
      chatSummary: 'APPROVED_PUBLIC_CHAT: The garden is open.',
      sourceIds: [source.id],
    }),
    'publish',
  );
  const derived = await action(
    await create({
      kind: 'summary',
      title: 'A recap of the recap',
      body: 'A second reviewed summary.',
      chatSummary: 'A reviewed summary of the garden.',
      sourceIds: [summary.id],
    }),
    'publish',
  );
  expect(
    publicCatchupSchema.parse(await (await publicRequest('/catch-up')).json())
      .summary?.id,
  ).toBe(derived.id);
  const edited = await request(
    `/publications/${source.id}`,
    'PATCH',
    { ...fields('Updated shared reference'), expectedVersion: source.version },
    moderator,
  );
  expect(edited.status).toBe(200);
  for (const record of [summary, derived]) {
    expect((await get(record)).entry.status).toBe('unpublished');
    expect((await publicRequest(`/entries/${record.id}`)).status).toBe(404);
  }
  expect(
    publicCatchupSchema.parse(await (await publicRequest('/catch-up')).json())
      .summary,
  ).toBeNull();
  expect(
    (
      await request(`/publications/${summary.id}/review`, 'POST', {
        expectedVersion: (await get(summary)).entry.version,
        action: 'publish',
        reason: 'Unavailable source must block this.',
      })
    ).status,
  ).toBe(404);
  const updated = await action(
    managedPublicationSchema.parse(await edited.json()),
    'publish',
  );
  summary = await action((await get(summary)).entry, 'publish');
  expect(
    publicCatchupSchema.parse(await (await publicRequest('/catch-up')).json())
      .summary?.id,
  ).toBe(summary.id);
  await action(updated, 'delete');
  expect((await get(summary)).entry.status).toBe('unpublished');
  const row = (
    await pool.query(
      'SELECT body,title,promise_id FROM public_entries WHERE id=$1',
      [updated.id],
    )
  ).rows[0];
  expect(row).toEqual({ body: '', title: '', promise_id: null });
  expect((await publicRequest(`/entries/${updated.id}`)).status).toBe(404);
  summary = await action(
    await create({
      kind: 'summary',
      title: 'A fresh approved recap',
      body: 'Our garden is open. New viewers are welcome.',
      chatSummary: 'APPROVED_PUBLIC_CHAT: Our garden is open.',
    }),
    'publish',
  );
});
it('paginates approved channel records and rejects private or foreign cursors', async () => {
  await pool.query(
    "INSERT INTO public_entries(channel_id,request_id,input_fingerprint,kind,title,body,chat_summary,status,approved_by_twitch_user_id,published_at) SELECT $1,gen_random_uuid(),'synthetic-pagination','reference','Public reference '||i,'Approved public fixture','','published','100',now() FROM generate_series(1,55)i",
    [channelId],
  );
  const first = publicFeedSchema.parse(await (await publicRequest()).json());
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).not.toBeNull();
  const second = publicFeedSchema.parse(
    await (await publicRequest(`?cursor=${first.nextCursor}`)).json(),
  );
  expect(second.items.length).toBeGreaterThan(0);
  expect(second.items.some((e) => first.items.some((p) => p.id === e.id))).toBe(
    false,
  );
  const draft = await create({ title: 'Hidden cursor' });
  expect((await publicRequest(`?cursor=${draft.id}`)).status).toBe(404);
  const managed = publicationPageSchema.parse(
    await (await request('/publications')).json(),
  );
  expect(managed.items).toHaveLength(50);
  expect(managed.nextCursor).not.toBeNull();
});
it('requests sending scopes separately from ordinary login and requires owner opt-in plus live capture', async () => {
  const ordinary = await fetch(`${origin}/api/auth/twitch`, {
    redirect: 'manual',
  });
  expect(
    new URL(ordinary.headers.get('location')!).searchParams.get('scope'),
  ).toBe('');
  const chat = await fetch(`${origin}/api/auth/twitch/chat`, {
    redirect: 'manual',
    headers: { Cookie: `lore_session=${owner.token}` },
  });
  expect(
    new URL(chat.headers.get('location')!).searchParams
      .get('scope')
      ?.split(' '),
  ).toEqual(catchupScopes);
  expect(
    (await request('/catchup/settings', 'GET', undefined, moderator)).status,
  ).toBe(404);
  await pool.query(
    'UPDATE oauth_connections SET scopes=$2,validated_at=now() WHERE user_id=$1',
    [owner.id, [...captureScopes]],
  );
  expect(
    (await request('/catchup/settings', 'POST', { enabled: true })).status,
  ).toBe(409);
  expect((await request('/ingestion/start', 'POST', {})).status).toBe(200);
  await eventually(async () => subs.size === 6);
  await pool.query(
    'UPDATE oauth_connections SET scopes=$2,validated_at=now() WHERE user_id=$1',
    [owner.id, [...captureScopes]],
  );
  expect(
    (await request('/catchup/settings', 'POST', { enabled: true })).status,
  ).toBe(409);
  await pool.query(
    'UPDATE oauth_connections SET scopes=$2,validated_at=now() WHERE user_id=$1',
    [owner.id, [...catchupScopes]],
  );
  expect(
    (
      await request(
        '/catchup/settings',
        'POST',
        { enabled: true },
        owner,
        channelId,
        false,
      )
    ).status,
  ).toBe(403);
  expect(
    (await request('/catchup/settings', 'POST', { enabled: true })).status,
  ).toBe(200);
  expect(
    catchupSettingsSchema.parse(
      await (await request('/catchup/settings')).json(),
    ).enabled,
  ).toBe(true);
});
it('uses a durable identifier-only outbox, deduplicates commands and sends only the latest approved recap to its source channel', async () => {
  await queue.pause();
  const command = await nextCommand();
  await eventually(async () =>
    Boolean(await queue.getJob(`catchup-${command.id}`)),
  );
  const job = await queue.getJob(`catchup-${command.id}`);
  await job!.remove();
  await eventually(async () =>
    Boolean(await queue.getJob(`catchup-${command.id}`)),
  );
  expect(job?.data).toEqual({ replyId: command.id });
  expect(
    (await deliver('channel.chat.message', '!catchup', command.messageId))
      .status,
  ).toBe(204);
  const before = sent.length;
  await queue.resume();
  await waitStatus(command.id, 'sent');
  expect(sent).toHaveLength(before + 1);
  expect(sent.at(-1)?.message).toContain(summary.chatSummary);
  expect(sent.at(-1)?.message).toContain('/c/twitch-100/catch-up');
  expect(sent.at(-1)?.message).not.toContain('PRIVATE_');
  await deliver();
  await eventually(
    async () =>
      (
        await pool.query(
          'SELECT count(*)::int n FROM source_events WHERE processed_at IS NULL AND payload IS NOT NULL',
        )
      ).rows[0].n === 0,
  );
  await pool.query('UPDATE channels SET last_catchup_at=NULL WHERE id=$1', [
    channelId,
  ]);
  await deliver('channel.chat.message', '!catchup secret case');
  await deliver('channel.chat.message', '!catchup', randomUUID(), {
    source_broadcaster_user_id: '999',
  });
  await deliver(
    'channel.chat.message',
    '!catchup',
    randomUUID(),
    {},
    { timestamp: new Date(Date.now() - 100000).toISOString() },
  );
  await eventually(
    async () =>
      (
        await pool.query(
          'SELECT count(*)::int n FROM source_events WHERE processed_at IS NULL AND payload IS NOT NULL',
        )
      ).rows[0].n === 0,
  );
  expect(sent).toHaveLength(before + 1);
  expect(
    (await pool.query('SELECT count(*)::int n FROM catchup_replies')).rows[0].n,
  ).toBe(1);
});
it('rechecks publication, consent, scope and command deletion before sending queued work', async () => {
  await queue.pause();
  const neutral = await nextCommand();
  summary = await action(summary, 'unpublish');
  await queue.resume();
  await waitStatus(neutral.id, 'sent');
  expect(sent.at(-1)?.message).toBe(
    'No catch-up summary has been approved yet.',
  );
  summary = await action(summary, 'publish');
  await queue.pause();
  const disabled = await nextCommand();
  expect(
    (await request('/catchup/settings', 'POST', { enabled: false })).status,
  ).toBe(200);
  await queue.resume();
  await waitStatus(disabled.id, 'cancelled');
  expect(
    (await request('/catchup/settings', 'POST', { enabled: true })).status,
  ).toBe(200);
  await queue.pause();
  const lost = await nextCommand();
  await pool.query('UPDATE oauth_connections SET scopes=$2 WHERE user_id=$1', [
    owner.id,
    [...captureScopes],
  ]);
  await queue.resume();
  await waitStatus(lost.id, 'cancelled');
  await pool.query('UPDATE oauth_connections SET scopes=$2 WHERE user_id=$1', [
    owner.id,
    [...catchupScopes],
  ]);
  await queue.pause();
  const deleted = await nextCommand();
  expect(
    (
      await deliver('channel.chat.message_delete', '', deleted.messageId, {
        target_user_id: '555',
      })
    ).status,
  ).toBe(204);
  await eventually(
    async () =>
      (
        await pool.query(
          'SELECT count(*)::int n FROM chat_messages WHERE channel_id=$1 AND message_id=$2',
          [channelId, deleted.messageId],
        )
      ).rows[0].n === 0,
  );
  await queue.resume();
  await waitStatus(deleted.id, 'cancelled');
});
it('records dropped and ambiguous sends without replaying a potentially delivered message', async () => {
  sendMode = 'dropped';
  const dropped = await nextCommand();
  await waitStatus(dropped.id, 'dropped');
  sendMode = 'ambiguous';
  const unknown = await nextCommand();
  await waitStatus(unknown.id, 'uncertain');
  const before = sent.length;
  await queue.add(
    'catchup',
    { replyId: unknown.id },
    { jobId: `retry-${unknown.id}` },
  );
  await eventually(
    async () =>
      (await queue.getJob(`retry-${unknown.id}`))?.finishedOn !== undefined,
  );
  expect(sent).toHaveLength(before);
  sendMode = 'sent';
  expect((await request('/ingestion/stop', 'POST', {})).status).toBe(200);
  expect(
    catchupSettingsSchema.parse(
      await (await request('/catchup/settings')).json(),
    ).enabled,
  ).toBe(false);
});
let overlayToken = '';
async function overlaySettings() {
  return overlaySettingsSchema.parse(await (await request('/overlay')).json());
}
async function overlayRead(token = overlayToken, slug = 'twitch-100') {
  return fetch(`${origin}/api/overlay/${slug}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
it('cancels expired queued catch-up receipts even when delivery is paused', async () => {
  await queue.pause();
  const id = randomUUID();
  await pool.query(
    "INSERT INTO catchup_replies(id,channel_id,message_id,generation,expires_at)VALUES($1,$2,$3,0,now()-interval '1 minute')",
    [id, channelId, randomUUID()],
  );
  await waitStatus(id, 'cancelled');
  expect(await queue.getJob(`catchup-${id}`)).toBeUndefined();
  await queue.resume();
});
it('limits overlay management to reviewers, token management to owners, and requires versioned CSRF-protected approval', async () => {
  expect((await request('/overlay', 'GET', undefined, team)).status).toBe(404);
  expect((await request('/overlay', 'GET', undefined, outsider)).status).toBe(
    404,
  );
  expect((await request('/overlay', 'GET', undefined, moderator)).status).toBe(
    200,
  );
  expect((await overlayRead('')).status).toBe(404);
  expect((await overlayRead('a'.repeat(64))).status).toBe(404);
  const initial = await overlaySettings();
  expect(initial).toEqual({
    version: 0,
    enabled: false,
    mode: 'recap',
    entryIds: [],
    tokenActive: false,
  });
  expect(
    (
      await request(
        '/overlay-token/rotate',
        'POST',
        { expectedVersion: 0 },
        moderator,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await request(
        '/overlay-token/rotate',
        'POST',
        { expectedVersion: 0 },
        owner,
        channelId,
        false,
      )
    ).status,
  ).toBe(403);
  const rotations = await Promise.all([
    request('/overlay-token/rotate', 'POST', { expectedVersion: 0 }),
    request('/overlay-token/rotate', 'POST', { expectedVersion: 0 }),
  ]);
  expect(rotations.map((r) => r.status).sort()).toEqual([200, 409]);
  const issued = overlayTokenSchema.parse(
    await rotations.find((r) => r.status === 200)!.json(),
  );
  overlayToken = issued.token;
  const stored = (
    await pool.query('SELECT * FROM overlay_tokens WHERE channel_id=$1', [
      channelId,
    ])
  ).rows[0];
  expect(stored.token_hash).toBe(hashToken(overlayToken));
  expect(JSON.stringify(stored)).not.toContain(overlayToken);
  expect(JSON.stringify(await overlaySettings())).not.toContain(
    hashToken(overlayToken),
  );
  expect(
    overlayDisplaySchema.parse(await (await overlayRead()).json()).items,
  ).toEqual([]);
  expect((await overlayRead(overlayToken, 'twitch-400')).status).toBe(404);
  expect((await publicRequest(`?q=${overlayToken}`)).status).toBe(200);
  const anonymous = await fetch(
    `${origin}/api/channels/${channelId}/publications`,
    { headers: { Authorization: `Bearer ${overlayToken}` } },
  );
  expect(anonymous.status).toBe(401);
});
it('projects only selected approved recap or commitment text and drops withdrawn sources from the overlay', async () => {
  let recap = await action(
    await create({
      kind: 'summary',
      title: 'Overlay-only reviewed recap',
      chatSummary: 'The garden is open. Join us next stream.',
      sourceIds: [],
    }),
    'publish',
  );
  const commitment = await action(
    await create({
      kind: 'commitment',
      title: 'Name the pond',
      body: 'This longer public body is not needed on the overlay.',
    }),
    'publish',
  );
  const draft = await create({
    kind: 'summary',
    chatSummary: 'Unapproved text',
  });
  const foreign = await create(
    { kind: 'summary', chatSummary: 'Other channel' },
    outsider,
    foreignChannel,
  );
  let settings = await overlaySettings();
  for (const id of [draft.id, foreign.id, randomUUID()]) {
    expect(
      (
        await request(
          '/overlay',
          'POST',
          {
            expectedVersion: settings.version,
            enabled: true,
            mode: 'recap',
            entryIds: [id],
            entryVersions: { [id]: 1 },
          },
          moderator,
        )
      ).status,
    ).toBe(409);
  }
  expect(
    (
      await request('/overlay', 'POST', {
        expectedVersion: settings.version,
        enabled: true,
        mode: 'recap',
        entryIds: [commitment.id],
        entryVersions: { [commitment.id]: commitment.version },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request('/overlay', 'POST', {
        expectedVersion: settings.version,
        enabled: true,
        mode: 'recap',
        entryIds: [recap.id],
        entryVersions: { [recap.id]: recap.version },
        tokenHash: 'injected',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request('/overlay', 'POST', {
        expectedVersion: settings.version,
        enabled: true,
        mode: 'recap',
        entryIds: [],
        entryVersions: {},
      })
    ).status,
  ).toBe(400);
  const input = {
    expectedVersion: settings.version,
    enabled: true,
    mode: 'recap',
    entryIds: [recap.id],
    entryVersions: { [recap.id]: recap.version },
  };
  expect((await request('/overlay', 'POST', input, team)).status).toBe(404);
  expect(
    (await request('/overlay', 'POST', input, owner, channelId, false)).status,
  ).toBe(403);
  expect((await request('/overlay', 'POST', input, moderator)).status).toBe(
    200,
  );
  expect((await request('/overlay', 'POST', input)).status).toBe(409);
  const response = await overlayRead();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(overlayDisplaySchema.parse(await response.json())).toEqual({
    channel: 'twitch-100',
    mode: 'recap',
    items: [{ id: recap.id, title: recap.title, text: recap.chatSummary }],
  });
  recap = await action(recap, 'unpublish');
  expect(
    overlayDisplaySchema.parse(await (await overlayRead()).json()).items,
  ).toEqual([]);
  const withdrawnSettings = await overlaySettings();
  expect(withdrawnSettings.entryIds).toEqual([]);
  expect(withdrawnSettings.enabled).toBe(false);
  await action(recap, 'publish');
  expect(
    overlayDisplaySchema.parse(await (await overlayRead()).json()).items,
  ).toEqual([]);
  settings = await overlaySettings();
  expect(
    (
      await request('/overlay', 'POST', {
        expectedVersion: settings.version,
        enabled: true,
        mode: 'open_loops',
        entryIds: [commitment.id],
        entryVersions: { [commitment.id]: commitment.version },
      })
    ).status,
  ).toBe(200);
  const loops = overlayDisplaySchema.parse(await (await overlayRead()).json());
  expect(loops.items).toEqual([
    { id: commitment.id, title: commitment.title, text: '' },
  ]);
  expect(JSON.stringify(loops)).not.toMatch(
    /PRIVATE_|promiseId|sourceIds|approvedBy|tokenHash|body/,
  );
  await action(commitment, 'delete');
  expect(
    overlayDisplaySchema.parse(await (await overlayRead()).json()).items,
  ).toEqual([]);
  const audit = (
    await pool.query(
      "SELECT details FROM audit_events WHERE channel_id=$1 AND action='overlay.content_approved'",
      [channelId],
    )
  ).rows;
  expect(audit).toHaveLength(2);
  expect(JSON.stringify(audit)).not.toContain(overlayToken);
});
it('immediately rejects rotated and revoked overlay credentials without restoring them on regeneration', async () => {
  let settings = await overlaySettings();
  const old = overlayToken;
  const rotation = await request('/overlay-token/rotate', 'POST', {
    expectedVersion: settings.version,
  });
  const next = overlayTokenSchema.parse(await rotation.json());
  overlayToken = next.token;
  expect(overlayToken).not.toBe(old);
  expect((await overlayRead(old)).status).toBe(404);
  expect((await overlayRead()).status).toBe(200);
  expect(
    (
      await request(
        '/overlay-token/revoke',
        'POST',
        { expectedVersion: next.settings.version },
        moderator,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await request('/overlay-token/revoke', 'POST', {
        expectedVersion: next.settings.version,
      })
    ).status,
  ).toBe(200);
  expect((await overlayRead()).status).toBe(404);
  settings = await overlaySettings();
  expect(settings.enabled).toBe(false);
  const regenerated = overlayTokenSchema.parse(
    await (
      await request('/overlay-token/rotate', 'POST', {
        expectedVersion: settings.version,
      })
    ).json(),
  );
  expect((await overlayRead(overlayToken)).status).toBe(404);
  overlayToken = regenerated.token;
  expect((await overlayRead()).status).toBe(200);
});

it('rejects stale preview versions and requires fresh overlay approval after a source edit and republish', async () => {
  let source = await action(
    await create({ kind: 'milestone', title: 'Overlay source' }),
    'publish',
  );
  let recap = await action(
    await create({
      kind: 'summary',
      title: 'Versioned OBS recap',
      chatSummary: 'The exact reviewed wording.',
      sourceIds: [source.id],
    }),
    'publish',
  );
  let settings = await overlaySettings();
  const approve = (version: number) =>
    request('/overlay', 'POST', {
      expectedVersion: settings.version,
      enabled: true,
      mode: 'recap',
      entryIds: [recap.id],
      entryVersions: { [recap.id]: version },
    });
  const oldVersion = recap.version;
  const edited = await request(`/publications/${recap.id}`, 'PATCH', {
    ...fields('Changed OBS recap'),
    kind: 'summary',
    chatSummary: 'Changed reviewed wording.',
    sourceIds: [source.id],
    expectedVersion: recap.version,
  });
  expect(edited.status).toBe(200);
  recap = await action(
    managedPublicationSchema.parse(await edited.json()),
    'publish',
  );
  expect((await approve(oldVersion)).status).toBe(409);
  expect((await approve(recap.version)).status).toBe(200);
  expect(
    overlayDisplaySchema.parse(await (await overlayRead()).json()).items[0]
      .text,
  ).toBe('Changed reviewed wording.');
  settings = await overlaySettings();
  source = await action(source, 'unpublish');
  expect(
    overlayDisplaySchema.parse(await (await overlayRead()).json()).items,
  ).toEqual([]);
  expect((await overlaySettings()).version).toBeGreaterThan(settings.version);
  await action(source, 'publish');
  recap = await action((await get(recap)).entry, 'publish');
  expect(
    overlayDisplaySchema.parse(await (await overlayRead()).json()).items,
  ).toEqual([]);
  settings = await overlaySettings();
  expect((await approve(recap.version)).status).toBe(200);
  expect(
    overlayDisplaySchema.parse(await (await overlayRead()).json()).items[0].id,
  ).toBe(recap.id);
});

it('publishes clip and screenshot attachments only after review and revokes old image access on edits or withdrawal', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWOY6PYfjhiI4wAA9TIdYRk26IEAAAAASUVORK5CYII=',
    'base64',
  );
  let story = await create({
    title: 'The visual garden',
    clipId: 'GardenCrew-abc_123',
  });
  const upload = async (
    record: ManagedPublication,
    user = owner,
    csrf = true,
  ) => {
    const form = new FormData();
    form.set('expectedVersion', String(record.version));
    form.set('alt', 'A purple garden screenshot');
    form.set('file', new Blob([png], { type: 'image/png' }), 'garden.png');
    return fetch(
      `${origin}/api/channels/${channelId}/publications/${record.id}/screenshot`,
      {
        method: 'POST',
        headers: {
          Cookie: `lore_session=${user.token}`,
          Origin: origin,
          ...(csrf ? { 'X-CSRF-Token': csrfToken(user.token) } : {}),
        },
        body: form,
      },
    );
  };
  expect((await upload(story, outsider)).status).toBe(404);
  expect((await upload(story, owner, false)).status).toBe(403);
  const attached = await upload(story);
  expect(attached.status).toBe(200);
  story = managedPublicationSchema.parse(await attached.json());
  expect(story.status).toBe('draft');
  expect(story.clipId).toBe('GardenCrew-abc_123');
  const imageId = story.screenshot!.id;
  const publicImage = `/entries/${story.id}/screenshot/${imageId}`;
  expect((await publicRequest(publicImage)).status).toBe(404);
  const privateImage = await request(
    `/publications/${story.id}/screenshot/${imageId}`,
    'GET',
  );
  expect(privateImage.status).toBe(200);
  expect(privateImage.headers.get('content-type')).toContain('image/webp');
  expect(
    (
      await request(
        `/publications/${story.id}/screenshot/${imageId}`,
        'GET',
        undefined,
        outsider,
      )
    ).status,
  ).toBe(404);
  story = await action(story, 'publish');
  const projection = publicEntrySchema.parse(
    (
      (await (await publicRequest(`/entries/${story.id}`)).json()) as {
        entry: unknown;
      }
    ).entry,
  );
  expect(projection.screenshot).toEqual({
    id: imageId,
    alt: 'A purple garden screenshot',
  });
  expect(projection.clipId).toBe('GardenCrew-abc_123');
  expect(JSON.stringify(projection)).not.toMatch(
    /storageKey|community-images|test-bucket/,
  );
  const visible = await publicRequest(publicImage);
  expect(visible.status).toBe(200);
  expect(visible.headers.get('cache-control')).toBe('no-store');
  expect((await visible.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect((await upload(story, team)).status).toBe(404);
  expect((await publicRequest(publicImage)).status).toBe(200);
  const replaced = await upload(story);
  expect(replaced.status).toBe(200);
  story = managedPublicationSchema.parse(await replaced.json());
  expect((await publicRequest(publicImage)).status).toBe(404);
  expect(story.screenshot!.id).not.toBe(imageId);
  story = await action(story, 'publish');
  const currentImage = `/entries/${story.id}/screenshot/${story.screenshot!.id}`;
  expect((await publicRequest(currentImage)).status).toBe(200);
  holdImageReads = true;
  releaseImageRead = undefined;
  const inflightImage = publicRequest(currentImage);
  await eventually(async () => Boolean(releaseImageRead));
  story = await action(story, 'unpublish');
  holdImageReads = false;
  releaseImageRead!();
  expect((await inflightImage).status).toBe(404);
  expect((await publicRequest(currentImage)).status).toBe(404);
  story = await action(story, 'delete');
  expect(story.clipId).toBeNull();
  expect(story.screenshot).toBeNull();
});

it('revokes anonymous pages on disconnect while retaining owner withdrawal access', async () => {
  expect((await request('/disconnect', 'POST', {})).status).toBe(204);
  expect((await publicRequest()).status).toBe(404);
  expect((await overlayRead()).status).toBe(404);
  expect((await overlaySettings()).tokenActive).toBe(false);
  expect((await publicRequest('/catch-up')).status).toBe(404);
  expect(
    (await request('/publications', 'GET', undefined, moderator)).status,
  ).toBe(404);
  expect(
    (
      await request(`/publications/${entry.id}/review`, 'POST', {
        expectedVersion: entry.version,
        action: 'publish',
        reason: 'Cannot republish after disconnect.',
      })
    ).status,
  ).toBe(409);
  expect((await action(entry, 'unpublish')).status).toBe('unpublished');
  expect(
    (
      await request('/overlay-token/rotate', 'POST', {
        expectedVersion: (await overlaySettings()).version,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await fetch(`${origin}/api/channels/connect`, {
        method: 'POST',
        headers: {
          Cookie: `lore_session=${owner.token}`,
          Origin: origin,
          'X-CSRF-Token': csrfToken(owner.token),
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    ).status,
  ).toBe(200);
  expect((await overlayRead()).status).toBe(404);
});

it('discovers only connected, non-demo communities with published previews and stable anonymous pagination', async () => {
  const batch = randomBytes(5).toString('hex');
  const name = `Discover Garden ${batch}`;
  const visible: string[] = [];
  async function seed(
    slug: string,
    state = 'published',
    originType = 'live_twitch',
    connected = true,
    disconnected = false,
    displayName = name,
  ) {
    const id = randomUUID();
    const twitch = BigInt('0x' + randomBytes(6).toString('hex')).toString();
    const identity = await pool.query(
      'INSERT INTO users(twitch_user_id,login,display_name) VALUES($1,$2,$2) RETURNING id',
      [twitch, slug],
    );
    await pool.query(
      'INSERT INTO channels(id,slug,display_name,origin,connected_at,disconnected_at,owner_user_id,twitch_channel_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        slug,
        displayName,
        originType,
        connected ? new Date() : null,
        disconnected ? new Date() : null,
        identity.rows[0].id,
        twitch,
      ],
    );
    const result = await pool.query(
      "INSERT INTO public_entries(channel_id,request_id,input_fingerprint,kind,title,body,chat_summary,status,approved_by_twitch_user_id,published_at) VALUES($1,gen_random_uuid(),'discover-fixture','story',$2,$3,'',$4,$5,$6) RETURNING id",
      [
        id,
        state === 'published'
          ? 'Welcome to the public garden'
          : 'PRIVATE-QA-ONLY draft title',
        state === 'published' ? '🌱'.repeat(240) : 'PRIVATE-QA-ONLY body',
        state,
        state === 'published' ? '100' : null,
        state === 'published' ? new Date() : null,
      ],
    );
    return { id, entryId: result.rows[0].id };
  }
  let firstId = '';
  for (let i = 0; i < 14; i++) {
    const slug = `discover-${batch}-${String(i).padStart(2, '0')}`;
    const channel = await seed(slug);
    if (i === 0) firstId = channel.id;
    visible.push(slug);
  }
  for (const state of ['draft', 'unpublished', 'deleted'])
    await seed(`hidden-${state}-${batch}`, state);
  await seed(`hidden-demo-${batch}`, 'published', 'demo_fixture');
  await seed(
    `hidden-disconnected-${batch}`,
    'published',
    'live_twitch',
    true,
    true,
  );
  await seed(
    `hidden-never-connected-${batch}`,
    'published',
    'live_twitch',
    false,
  );
  await pool.query(
    "INSERT INTO public_entries(channel_id,request_id,input_fingerprint,kind,title,body,chat_summary,status) VALUES($1,gen_random_uuid(),'private-latest','story','PRIVATE-QA-ONLY','PRIVATE-QA-ONLY','','draft')",
    [firstId],
  );
  const endpoint = `${origin}/api/public/channels`;
  const firstResponse = await fetch(
    `${endpoint}?q=${encodeURIComponent(name.toUpperCase())}`,
  );
  expect(firstResponse.status).toBe(200);
  const first = discoverPageSchema.parse(await firstResponse.json());
  expect(first.items).toHaveLength(12);
  expect(first.items.map((item) => item.slug)).toEqual(visible.slice(0, 12));
  expect(first.items[0].storyCount).toBe(1);
  expect(first.items[0].latest.excerpt).toBe('🌱'.repeat(240));
  expect(JSON.stringify(first)).not.toMatch(
    /PRIVATE-QA-ONLY|ownerUserId|twitchUserId|promiseId|hidden-/,
  );
  const second = discoverPageSchema.parse(
    await (
      await fetch(
        `${endpoint}?q=${encodeURIComponent(name)}&cursor=${first.nextCursor}`,
      )
    ).json(),
  );
  expect(second.items.map((item) => item.slug)).toEqual(visible.slice(12));
  expect(second.nextCursor).toBeNull();
  const handleSearch = discoverPageSchema.parse(
    await (
      await fetch(`${endpoint}?q=${encodeURIComponent('@' + name)}`)
    ).json(),
  );
  expect(handleSearch.items).toHaveLength(12);
  const publicPage = await fetch(`${endpoint}/${first.items[0].slug}`);
  expect(publicFeedSchema.parse(await publicPage.json()).items[0].id).toBe(
    first.items[0].latest.id,
  );
  await pool.query(
    "UPDATE public_entries SET status='unpublished', published_at=null, approved_by_twitch_user_id=null WHERE channel_id=$1",
    [firstId],
  );
  const refreshed = discoverPageSchema.parse(
    await (await fetch(`${endpoint}?q=${encodeURIComponent(name)}`)).json(),
  );
  expect(refreshed.items.map((item) => item.slug)).not.toContain(visible[0]);
  await seed(
    `literal-${batch}`,
    'published',
    'live_twitch',
    true,
    false,
    `Literal%_Garden ${batch}`,
  );
  const literal = discoverPageSchema.parse(
    await (
      await fetch(
        `${endpoint}?q=${encodeURIComponent('Literal%_Garden ' + batch)}`,
      )
    ).json(),
  );
  expect(literal.items.map((item) => item.slug)).toEqual([`literal-${batch}`]);
  expect((await fetch(`${endpoint}?cursor=not-a-valid-cursor`)).status).toBe(
    400,
  );
  expect((await fetch(`${endpoint}?q=${'x'.repeat(101)}`)).status).toBe(400);
  const empty = discoverPageSchema.parse(
    await (await fetch(`${endpoint}?q=PRIVATE-QA-ONLY`)).json(),
  );
  expect(empty.items).toEqual([]);
});
