import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  caseDetailSchema,
  caseAiRunSchema,
  casePageSchema,
  caseAiSettingsSchema,
  moderationDeskSchema,
  repairActionSchema,
  consistencyFlagSchema,
  ruleChangeSchema,
  queueNames,
  type CaseDetail,
} from '@lore/shared';
import { csrfToken, hashToken, encryptTokens } from '../src/auth/auth-crypto';
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error('Set TEST_DATABASE_URL for isolated case integration tests');
const database = `lore_cases_test_${randomBytes(8).toString('hex')}`;
const admin = new Pool({ connectionString: testUrl });
const isolated = new URL(testUrl);
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
  encryptionKey = randomBytes(32).toString('base64');
let origin: string,
  mockOrigin: string,
  api: ChildProcess,
  mock: Server,
  output = '';
let queue: Queue;
let main: CaseDetail, prior: CaseDetail;
let calls = 0;
const sent: string[] = [];
const objects = new Map<string, Buffer>();
let mode: 'valid' | 'citation' | 'vector' | 'pause' = 'valid';
let release: (() => void) | undefined;
let pauseUpload = false;
let releaseUpload: (() => void) | undefined;
async function port(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return address.port;
}
async function eventually(check: () => Promise<boolean>, timeout = 18000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Timed out; API: ${output.slice(-1500)}`);
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
      ...(body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    ...(body !== undefined
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
}
const fields = (title = 'Spoiler appeal') => ({
  title,
  subjectReference: 'Synthetic viewer',
  incident: 'A spoiler was posted after a reminder.',
  appeal: 'Please review the timeout.',
  incidentAt: null,
  ruleTitle: 'No spoilers',
  ruleVersion: '2',
  ruleText: 'Do not reveal story locations; start with a clear reminder.',
});
async function create(
  title = 'Spoiler appeal',
  user = owner,
  channel: string = channelId,
) {
  const response = await request(
    '/cases',
    'POST',
    { ...fields(title), requestId: randomUUID() },
    user,
    channel,
  );
  expect(response.status).toBe(200);
  return caseDetailSchema.parse(await response.json());
}
async function get(record: CaseDetail) {
  return caseDetailSchema.parse(
    await (
      await request(
        `/cases/${record.id}`,
        'GET',
        undefined,
        owner,
        record.channelId,
      )
    ).json(),
  );
}
async function decide(record: CaseDetail, user = owner) {
  const response = await request(
    `/cases/${record.id}/decision`,
    'POST',
    {
      expectedVersion: record.version,
      requestId: randomUUID(),
      outcome: 'modify',
      rationale: 'The reminder was unclear; a moderator shortened the timeout.',
      followUp: 'Explain the rule.',
    },
    user,
    record.channelId,
  );
  expect(response.status).toBe(200);
  return caseDetailSchema.parse(await response.json());
}
async function toggle(enabled: boolean) {
  expect(
    (await request('/cases/ai/settings', 'POST', { enabled })).status,
  ).toBe(200);
}
async function retrieve(record = main) {
  const response = await request(`/cases/${record.id}/precedents`, 'POST', {});
  expect(response.status).toBe(200);
  return z.object({ runId: z.uuid() }).parse(await response.json()).runId;
}
async function waitRun(id: string, status = 'completed') {
  await eventually(async () => {
    const row = (
      await pool.query('SELECT status,error FROM case_ai_runs WHERE id=$1', [
        id,
      ])
    ).rows[0];
    if (row?.status === 'failed' && status === 'completed')
      throw new Error(`Case AI failed: ${row.error}`);
    return row?.status === status;
  });
  return caseAiRunSchema.parse(
    await (await request(`/cases/${main.id}/precedents`)).json(),
  );
}
async function upload(
  record: CaseDetail,
  user = owner,
  name = 'proof.txt',
  content = 'Synthetic incident evidence',
  type = 'text/plain',
) {
  const form = new FormData();
  form.set('file', new Blob([content], { type }), name);
  form.set('label', 'Uploaded incident context');
  form.set('requestId', randomUUID());
  form.set('expectedVersion', String(record.version));
  return request(
    `/cases/${record.id}/files`,
    'POST',
    form,
    user,
    record.channelId,
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
      'INSERT INTO users (id,twitch_user_id,login,display_name) VALUES ($1,$2,$3,$3)',
      [user.id, user.twitch, `user${user.twitch}`],
    );
    await pool.query(
      "INSERT INTO oauth_connections (user_id,encrypted_tokens,scopes,expires_at,validated_at) VALUES ($1,$2,'{}',now()+interval '1 day',now())",
      [
        user.id,
        encryptTokens(
          JSON.stringify({
            access_token: `access-${user.twitch}`,
            refresh_token: 'refresh',
          }),
          user.id,
          encryptionKey,
        ),
      ],
    );
    await pool.query(
      "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day')",
      [hashToken(user.token), user.id],
    );
  }
  for (const [id, user] of [
    [channelId, owner],
    [foreignChannel, outsider],
  ] as const)
    await pool.query(
      "INSERT INTO channels (id,slug,twitch_channel_id,owner_user_id,display_name,origin,connected_at) VALUES ($1,$2,$3,$4,$2,'live_twitch',now())",
      [id, `channel-${user.twitch}`, user.twitch, user.id],
    );
  for (const [user, role] of [
    [moderator, 'moderator'],
    [team, 'team'],
  ] as const)
    await pool.query(
      'INSERT INTO memberships (channel_id,user_id,role,granted_by) VALUES ($1,$2,$3,$4)',
      [channelId, user.id, role, owner.id],
    );
  mock = createServer(async (req, res) => {
    if (req.url === '/oauth2/validate') {
      const twitch = req.headers.authorization?.replace('OAuth access-', '');
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          client_id: 'test-client',
          user_id: twitch,
          login: `user${twitch}`,
          scopes: [],
          expires_in: 86400,
        }),
      );
      return;
    }
    const url = new URL(req.url || '/', mockOrigin);
    if (url.pathname.startsWith('/test-bucket/')) {
      if (req.method === 'PUT') {
        expect(req.headers.authorization).toContain('AWS4-HMAC-SHA256');
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        objects.set(url.pathname, Buffer.concat(chunks));
        if (pauseUpload)
          await new Promise<void>((resolve) => {
            releaseUpload = resolve;
          });
        res.setHeader('ETag', '"synthetic"');
        res.end();
        return;
      }
      if (req.method === 'DELETE') {
        objects.delete(url.pathname);
        res.writeHead(204).end();
        return;
      }
      if (!objects.has(url.pathname)) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader('Content-Length', objects.get(url.pathname)!.length);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(req.method === 'HEAD' ? undefined : objects.get(url.pathname));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString();
    const body = JSON.parse(text);
    sent.push(text);
    calls++;
    if (url.pathname.includes(':embedContent')) {
      if (mode === 'pause')
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      const vector = Array(768).fill(0);
      vector[
        body.content.parts[0].text.includes('Repeated spam links') ? 1 : 0
      ] = 1;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          embedding: { values: mode === 'vector' ? [1] : vector },
        }),
      );
      return;
    }
    if (url.pathname.endsWith(':generateContent')) {
      expect(req.headers['x-goog-api-key']).toBe('mock');
      expect(body.tools).toBeUndefined();
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.generationConfig.responseJsonSchema.required).toContain(
        'requires_human_approval',
      );
      expect(body.systemInstruction.parts[0].text).toContain('UNTRUSTED DATA');
      const context = JSON.parse(
        body.contents[0].parts[0].text
          .replace('<untrusted_case_json>\n', '')
          .replace('\n</untrusted_case_json>', ''),
      );
      const ids = [
        context.currentCase.id,
        ...context.precedents.map((p: { id: string }) => p.id),
      ];
      const draft = {
        task_type: 'case_review',
        proposed_action: 'modify',
        summary: 'Review the reminder before deciding.',
        source_record_ids:
          mode === 'citation' ? [context.currentCase.id, randomUUID()] : ids,
        comparisons: context.precedents.map((p: { id: string }) => ({
          case_id: p.id,
          similarities: 'Both concern a spoiler.',
          differences: 'Check the rule version and reminder context.',
        })),
        evidence_gaps: ['The complete chat is unavailable.'],
        uncertainties: ['Intent cannot be established.'],
        requires_human_approval: true,
        suggested_next_step: 'Review the evidence and record a human decision.',
      };
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(draft) }] },
            },
          ],
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  mockOrigin = `http://127.0.0.1:${await port(mock)}`;
  const temp = createServer();
  const apiPort = await port(temp);
  await new Promise<void>((resolve) => temp.close(() => resolve()));
  origin = `http://127.0.0.1:${apiPort}`;
  const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
  queue = new Queue(queueNames.caseAi, {
    prefix: database,
    connection: { host: redisUrl.hostname, port: Number(redisUrl.port) },
  });
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: isolated.toString(),
      REDIS_URL: redisUrl.toString(),
      QUEUE_PREFIX: database,
      API_PORT: String(apiPort),
      APP_ORIGIN: origin,
      TWITCH_CLIENT_ID: 'test-client',
      TWITCH_CLIENT_SECRET: 'test-secret',
      AUTH_ENCRYPTION_KEY: encryptionKey,
      TWITCH_TEST_BASE_URL: mockOrigin,
      TWITCH_EVENTSUB_SECRET: '',
      TWITCH_EVENTSUB_CALLBACK_URL: '',
      GEMINI_API_KEY: 'mock',
      GEMINI_MODEL: 'test-model',
      AI_TEST_BASE_URL: mockOrigin,
      AI_DAILY_CALL_LIMIT: '50',
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_BUCKET: 'test-bucket',
      R2_ACCESS_KEY_ID: 'mock-key',
      R2_SECRET_ACCESS_KEY: 'mock-secret',
      R2_TEST_ENDPOINT: mockOrigin,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout?.on('data', (chunk) => {
    output += chunk.toString();
  });
  api.stderr?.on('data', (chunk) => {
    output += chunk.toString();
  });
  await eventually(async () => {
    if (api.exitCode !== null) throw new Error(output.slice(-1500));
    try {
      return (await request('/cases')).ok;
    } catch {
      return false;
    }
  });
}, 60000);
afterAll(async () => {
  release?.();
  releaseUpload?.();
  if (api && api.exitCode === null) {
    const ended = once(api, 'exit');
    api.kill('SIGTERM');
    await ended;
  }
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
  const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
  for (const name of [
    queueNames.ingestion,
    queueNames.ai,
    queueNames.catchup,
  ]) {
    const q = new Queue(name, {
      prefix: database,
      connection: { host: redisUrl.hostname, port: Number(redisUrl.port) },
    });
    await q.obliterate({ force: true });
    await q.close();
  }
  if (mock) await new Promise<void>((resolve) => mock.close(() => resolve()));
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
it('limits every private case surface to owners and moderators, with CSRF on mutations', async () => {
  for (const user of [team, outsider]) {
    expect((await request('/cases', 'GET', undefined, user)).status).toBe(404);
    expect(
      (
        await request(
          '/cases',
          'POST',
          { ...fields(), requestId: randomUUID() },
          user,
        )
      ).status,
    ).toBe(404);
    expect(
      (await request('/cases/ai/settings', 'GET', undefined, user)).status,
    ).toBe(404);
  }
  expect(
    (
      await request(
        '/cases',
        'POST',
        { ...fields(), requestId: randomUUID() },
        owner,
        channelId,
        false,
      )
    ).status,
  ).toBe(403);
  const data = { ...fields(), requestId: randomUUID() };
  const response = await request('/cases', 'POST', data, moderator);
  expect(response.status).toBe(200);
  main = caseDetailSchema.parse(await response.json());
  expect(main.origin).toBe('manual_import');
  expect(main.history[0].actorTwitchUserId).toBe('200');
  expect(
    caseDetailSchema.parse(
      await (await request('/cases', 'POST', data, moderator)).json(),
    ).id,
  ).toBe(main.id);
  expect(
    (
      await request(
        '/cases',
        'POST',
        { ...data, title: 'Different' },
        moderator,
      )
    ).status,
  ).toBe(409);
  prior = await decide(await create('Earlier spoiler appeal'));
  const unrelated = await create('Spam appeal');
  const response2 = await request(`/cases/${unrelated.id}`, 'PATCH', {
    ...fields('Spam appeal'),
    incident: 'Repeated spam links were posted.',
    appeal: 'Please review the spam timeout.',
    expectedVersion: unrelated.version,
    status: 'reviewing',
  });
  expect(response2.status).toBe(200);
  await decide(caseDetailSchema.parse(await response2.json()));
  const foreign = await create(
    'FOREIGN PRIVATE DO NOT SEND',
    outsider,
    foreignChannel,
  );
  await pool.query(
    "UPDATE cases SET status='decided',outcome='uphold',rationale='FOREIGN PRIVATE DO NOT SEND',decided_by_twitch_user_id='400',decided_at=now(),embedding=$1::vector,embedding_version=version,embedding_model='gemini-embedding-2' WHERE id=$2",
    [JSON.stringify([1, ...Array(767).fill(0)]), foreign.id],
  );
  expect((await request(`/cases/${foreign.id}`)).status).toBe(404);
  expect(
    casePageSchema
      .parse(await (await request('/cases')).json())
      .items.some((c) => c.id === foreign.id),
  ).toBe(false);
});
it('retains exact channel-scoped chat evidence and rejects forged or foreign sources', async () => {
  const sourceId = randomUUID(),
    text = 'A spoiler was posted after the reminder.';
  await pool.query(
    "INSERT INTO source_events(id,channel_id,subscription_id,type,occurred_at,payload,expires_at,processed_at) VALUES($1,$2,'test','channel.chat.message',now(),$3,now()+interval '7 days',now())",
    [sourceId, channelId, { message_id: sourceId, message: { text } }],
  );
  await pool.query(
    "INSERT INTO chat_messages(channel_id,message_id,source_event_id,chatter_id,text,badges,occurred_at,expires_at)VALUES($1,$2,$2,'100',$3,'[]',now(),now()+interval '7 days')",
    [channelId, sourceId, text],
  );
  const input = {
    expectedVersion: main.version,
    requestId: randomUUID(),
    label: 'Captured chat',
    excerpt: 'spoiler was posted',
    sourceEventId: sourceId,
    occurredAt: null,
  };
  expect(
    (
      await request(`/cases/${main.id}/evidence`, 'POST', {
        ...input,
        excerpt: 'Invented quotation',
      })
    ).status,
  ).toBe(409);
  const response = await request(
    `/cases/${main.id}/evidence`,
    'POST',
    input,
    moderator,
  );
  expect(response.status).toBe(200);
  main = caseDetailSchema.parse(await response.json());
  expect(main.evidence[0].excerpt).toBe(text);
  await pool.query('UPDATE source_events SET payload=NULL WHERE id=$1', [
    sourceId,
  ]);
  await pool.query('DELETE FROM chat_messages WHERE source_event_id=$1', [
    sourceId,
  ]);
  main = await get(main);
  expect(main.evidence[0].originalAvailable).toBe(false);
  expect(main.evidence[0].excerpt).toBe(text);
  expect(
    (
      await request(`/cases/${main.id}/evidence`, 'POST', {
        ...input,
        requestId: randomUUID(),
        expectedVersion: main.version,
      })
    ).status,
  ).toBe(409);
  expect(
    (await request(`/cases/${main.id}`, 'GET', undefined, team)).status,
  ).toBe(404);
});
it('stores private R2 evidence and signs attachment downloads only after moderation authorization', async () => {
  expect((await upload(main, team)).status).toBe(404);
  expect(
    (await upload(main, owner, 'fake.png', '<svg/>', 'image/png')).status,
  ).toBe(400);
  const response = await upload(main);
  expect(response.status).toBe(200);
  main = caseDetailSchema.parse(await response.json());
  const file = main.evidence.find((e) => e.file)!;
  expect(file.file?.available).toBe(true);
  expect(objects.size).toBe(1);
  expect(JSON.stringify(main)).not.toContain('storageKey');
  expect(
    (
      await request(
        `/cases/${main.id}/files/${file.id}/download`,
        'GET',
        undefined,
        team,
      )
    ).status,
  ).toBe(404);
  const download = await request(`/cases/${main.id}/files/${file.id}/download`);
  expect(download.status).toBe(302);
  const url = new URL(download.headers.get('location')!);
  expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  expect(url.searchParams.get('response-content-disposition')).toContain(
    'attachment;',
  );
  expect((await fetch(url)).status).toBe(200);
  expect(
    (
      await request(`/cases/${main.id}/evidence/${file.id}`, 'DELETE', {
        expectedVersion: main.version,
        reason: '',
      })
    ).status,
  ).toBe(400);
  const removed = await request(
    `/cases/${main.id}/evidence/${file.id}`,
    'DELETE',
    { expectedVersion: main.version, reason: 'Wrong supporting file.' },
  );
  expect(removed.status).toBe(200);
  main = caseDetailSchema.parse(await removed.json());
  expect(main.evidence.find((e) => e.id === file.id)?.excerpt).toBeNull();
  await eventually(async () => objects.size === 0);
  expect(
    (await request(`/cases/${main.id}/files/${file.id}/download`)).status,
  ).toBe(404);
});
it('rechecks moderator access after an R2 upload and cleans up an abandoned object', async () => {
  pauseUpload = true;
  releaseUpload = undefined;
  const pending = upload(main, moderator);
  await eventually(async () => Boolean(releaseUpload));
  expect((await request(`/members/${moderator.id}`, 'DELETE')).status).toBe(
    204,
  );
  releaseUpload!();
  pauseUpload = false;
  expect((await pending).status).toBe(404);
  await eventually(async () => objects.size === 0);
  expect(
    (
      await request('/members', 'POST', {
        twitchUserId: moderator.twitch,
        role: 'moderator',
      })
    ).status,
  ).toBe(200);
  main = await get(main);
});
it('uses separate case AI consent and filters channel/private eligibility before vector ranking and reasoning', async () => {
  expect(
    caseAiSettingsSchema.parse(
      await (await request('/cases/ai/settings')).json(),
    ),
  ).toMatchObject({
    enabled: false,
    embeddingsConfigured: true,
    reasoningConfigured: true,
    reasoningModel: 'test-model',
  });
  expect(
    (await request(`/cases/${main.id}/precedents`, 'POST', {})).status,
  ).toBe(409);
  expect(
    (await request('/cases/ai/settings', 'POST', { enabled: true }, moderator))
      .status,
  ).toBe(404);
  await toggle(true);
  const result = await waitRun(await retrieve());
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].case.id).toBe(prior.id);
  expect(result.recommendation?.requires_human_approval).toBe(true);
  expect(result.eligibleCount).toBe(2);
  expect(result.indexedCount).toBe(2);
  expect(sent.join('\n')).not.toContain('FOREIGN PRIVATE DO NOT SEND');
  expect((await get(main)).status).toBe('open');
  const jobs = await queue.getJobs(['completed', 'waiting', 'active']);
  for (const job of jobs)
    expect(Object.keys(job.data).sort()).toEqual(['revision', 'runId']);
});
it('fails closed for malformed recommendations, bounds retries, and allows an explicit new retrieval', async () => {
  mode = 'citation';
  const runId = await retrieve();
  const result = await waitRun(runId, 'failed');
  expect(result.error).toBe('invalid_output');
  expect(result.recommendation).toBeNull();
  mode = 'valid';
  const repaired = await waitRun(await retrieve());
  expect(repaired.recommendation?.source_record_ids).toContain(prior.id);
});
it('rejects stale or unauthorized in-flight results and clears AI data on consent withdrawal', async () => {
  mode = 'pause';
  release = undefined;
  const id = await retrieve();
  await eventually(async () => Boolean(release));
  const response = await request(`/cases/${main.id}`, 'PATCH', {
    ...fields('Updated spoiler appeal'),
    expectedVersion: main.version,
    status: 'reviewing',
  });
  expect(response.status).toBe(200);
  main = caseDetailSchema.parse(await response.json());
  release!();
  mode = 'valid';
  await waitRun(id, 'cancelled');
  expect(
    (
      await request(`/cases/${main.id}`, 'PATCH', {
        ...fields(),
        expectedVersion: 1,
        status: 'reviewing',
      })
    ).status,
  ).toBe(409);
  await waitRun(await retrieve());
  await toggle(false);
  const latest = caseAiRunSchema.parse(
    await (await request(`/cases/${main.id}/precedents`)).json(),
  );
  expect(latest.stale).toBe(true);
  expect(latest.recommendation).toBeNull();
  expect(latest.matches).toEqual([]);
  expect(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM cases WHERE channel_id=$1 AND embedding IS NOT NULL',
        [channelId],
      )
    ).rows[0].n,
  ).toBe(0);
  await toggle(true);
  await waitRun(await retrieve());
});
it('rejects a retrieval result after the requesting moderator is downgraded to a team role', async () => {
  mode = 'pause';
  release = undefined;
  const response = await request(
    `/cases/${main.id}/precedents`,
    'POST',
    {},
    moderator,
  );
  expect(response.status).toBe(200);
  const { runId } = z.object({ runId: z.uuid() }).parse(await response.json());
  await eventually(async () => Boolean(release));
  expect(
    (
      await request('/members', 'POST', {
        twitchUserId: moderator.twitch,
        role: 'team',
      })
    ).status,
  ).toBe(200);
  release!();
  mode = 'valid';
  await waitRun(runId, 'cancelled');
  expect(
    (await request(`/cases/${main.id}`, 'GET', undefined, moderator)).status,
  ).toBe(404);
  expect(
    (
      await request('/members', 'POST', {
        twitchUserId: moderator.twitch,
        role: 'moderator',
      })
    ).status,
  ).toBe(200);
  await waitRun(await retrieve());
});
it('recovers an identifier-only case AI job from the durable run', async () => {
  await queue.pause();
  const runId = await retrieve();
  const jobId = `case-${runId}-0`;
  await eventually(async () => Boolean(await queue.getJob(jobId)));
  await (await queue.getJob(jobId))!.remove();
  expect(await queue.getJob(jobId)).toBeUndefined();
  expect(await retrieve()).toBe(runId);
  await eventually(async () => Boolean(await queue.getJob(jobId)));
  await queue.resume();
  await waitRun(runId);
});
it('saves only an explicit human decision with AI disposition, idempotence and an immutable audit trail', async () => {
  const run = caseAiRunSchema.parse(
    await (await request(`/cases/${main.id}/precedents`)).json(),
  );
  const input = {
    expectedVersion: main.version,
    requestId: randomUUID(),
    outcome: 'modify',
    rationale: 'I reviewed the reminder and evidence; shorten the timeout.',
    followUp: 'Explain the current spoiler rule.',
    aiRunId: run.id,
    aiDisposition: 'modified',
  };
  const responses = await Promise.all([
    request(`/cases/${main.id}/decision`, 'POST', input, moderator),
    request(
      `/cases/${main.id}/decision`,
      'POST',
      { ...input, requestId: randomUUID() },
      owner,
    ),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  main = caseDetailSchema.parse(
    await responses.find((r) => r.status === 200)!.json(),
  );
  expect(main.status).toBe('decided');
  expect(main.aiDisposition).toBe('modified');
  expect(main.history.at(-1)?.action).toBe('decided');
  expect(main.history.at(-1)?.actorTwitchUserId).toBe(
    main.decidedByTwitchUserId,
  );
  const winner =
    main.decidedByTwitchUserId === moderator.twitch ? moderator : owner;
  const winnerInput =
    winner === moderator
      ? input
      : {
          ...input,
          requestId: (
            await pool.query(
              'SELECT decision_request_id FROM cases WHERE id=$1',
              [main.id],
            )
          ).rows[0].decision_request_id,
        };
  expect(
    (await request(`/cases/${main.id}/decision`, 'POST', winnerInput, winner))
      .status,
  ).toBe(200);
  expect(
    (
      await request(`/cases/${main.id}`, 'PATCH', {
        ...fields(),
        expectedVersion: main.version,
        status: 'reviewing',
      })
    ).status,
  ).toBe(409);
  expect((await upload(main)).status).toBe(409);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE channel_id=$1 AND action='case.viewed'",
        [channelId],
      )
    ).rows[0].n,
  ).toBeGreaterThan(0);
});
it('enforces the shared daily budget before any new model call', async () => {
  await pool.query(
    'INSERT INTO ai_daily_usage(channel_id,day,calls)VALUES($1,CURRENT_DATE,50)ON CONFLICT(channel_id,day)DO UPDATE SET calls=50',
    [channelId],
  );
  const before = calls;
  const result = await waitRun(await retrieve(), 'failed');
  expect(result.error).toBe('daily_limit');
  expect(calls).toBe(before);
});

async function desk(channel: string = channelId, user = owner, query = '') {
  const response = await request(
    `/moderation${query}`,
    'GET',
    undefined,
    user,
    channel,
  );
  expect(response.status).toBe(200);
  return moderationDeskSchema.parse(await response.json());
}
let repairId: string, repairCase: CaseDetail, completionEvidence: string;
let reviewId: string, otherDecision: CaseDetail;
it('keeps moderator workflows private and validates assignments, references and CSRF', async () => {
  for (const user of [team, outsider]) {
    expect((await request('/moderation', 'GET', undefined, user)).status).toBe(
      404,
    );
    expect(
      (await request('/handoffs', 'POST', { requestId: randomUUID() }, user))
        .status,
    ).toBe(404);
    expect((await request('/consistency/scan', 'POST', {}, user)).status).toBe(
      404,
    );
    expect(
      (
        await request(
          '/moderation/rule-changes',
          'POST',
          {
            requestId: randomUUID(),
            title: 'Spoilers',
            previousVersion: '1',
            version: '2',
            ruleText: 'Ask first.',
            changeSummary: 'Human-approved clarification.',
          },
          user,
        )
      ).status,
    ).toBe(404);
  }
  expect(
    (
      await request(
        '/handoffs',
        'POST',
        { requestId: randomUUID() },
        owner,
        channelId,
        false,
      )
    ).status,
  ).toBe(403);
  expect(
    (await request('/moderation', 'GET', undefined, moderator)).status,
  ).toBe(200);
  const choices = (await desk()).assignees.map((p) => p.id);
  expect(choices.sort()).toEqual([owner.id, moderator.id].sort());
  repairCase = await create('Follow through on an agreed resolution');
  const input = {
    requestId: randomUUID(),
    caseId: repairCase.id,
    title: 'Explain the rule',
    kind: 'repair',
    agreement: 'Moderator agreed to explain the rule before re-entry.',
    assigneeId: moderator.id,
    dueAt: null,
  };
  expect((await request('/repairs', 'POST', input)).status).toBe(409);
  repairCase = caseDetailSchema.parse(
    await (
      await request(`/cases/${repairCase.id}/evidence`, 'POST', {
        expectedVersion: repairCase.version,
        requestId: randomUUID(),
        label: 'Human agreement',
        excerpt: 'The moderator and viewer agreed on a reminder.',
        occurredAt: null,
      })
    ).json(),
  );
  completionEvidence = repairCase.evidence[0].id;
  repairCase = await decide(repairCase);
  for (const assigneeId of [team.id, outsider.id])
    expect(
      (
        await request('/repairs', 'POST', {
          ...input,
          requestId: randomUUID(),
          assigneeId,
        })
      ).status,
    ).toBe(404);
  const foreign = await decide(
    await create('Foreign private resolution', outsider, foreignChannel),
    outsider,
  );
  expect(
    (
      await request('/repairs', 'POST', {
        ...input,
        requestId: randomUUID(),
        caseId: foreign.id,
      })
    ).status,
  ).toBe(404);
  const first = await request('/repairs', 'POST', input, moderator);
  expect(first.status).toBe(200);
  repairId = repairActionSchema.parse(await first.json()).id;
  expect(
    repairActionSchema.parse(
      await (await request('/repairs', 'POST', input, moderator)).json(),
    ).id,
  ).toBe(repairId);
  expect(
    (
      await request(
        '/repairs',
        'POST',
        { ...input, title: 'Different agreement' },
        moderator,
      )
    ).status,
  ).toBe(409);
  expect((await request(`/moderation?caseId=${foreign.id}`)).status).toBe(404);
});
it('records concurrent action progress once and requires valid same-case completion proof', async () => {
  const input = {
    expectedVersion: 1,
    status: 'in_progress',
    assigneeId: owner.id,
    note: 'The owner will follow up after the stream.',
    evidenceId: null,
  };
  const responses = await Promise.all([
    request(`/repairs/${repairId}`, 'PATCH', input),
    request(`/repairs/${repairId}`, 'PATCH', input, moderator),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    (
      await request(`/repairs/${repairId}`, 'PATCH', {
        ...input,
        expectedVersion: 2,
        note: '',
      })
    ).status,
  ).toBe(400);
  const foreignProof = randomUUID();
  expect(
    (
      await request(`/repairs/${repairId}`, 'PATCH', {
        ...input,
        expectedVersion: 2,
        status: 'completed',
        evidenceId: foreignProof,
      })
    ).status,
  ).toBe(404);
  expect((await get(repairCase)).version).toBe(repairCase.version);
  const history = (await desk()).activity.filter(
    (a) => a.targetId === repairId,
  );
  expect(history).toHaveLength(2);
  expect(history[0].assigneeId).toBe(owner.id);
});
it('creates scoped, duplicate-safe consistency concerns only for identical documented rules with different outcomes', async () => {
  async function decision(
    title: string,
    outcome: string,
    version = 'consistent-1',
    channel = channelId,
    user = owner,
  ) {
    const created = await request(
      '/cases',
      'POST',
      {
        ...fields(title),
        ruleTitle: 'Synthetic consistency rule',
        ruleVersion: version,
        ruleText: 'One reminder before escalation.',
        requestId: randomUUID(),
      },
      user,
      channel,
    );
    const record = caseDetailSchema.parse(await created.json());
    const result = await request(
      `/cases/${record.id}/decision`,
      'POST',
      {
        expectedVersion: record.version,
        requestId: randomUUID(),
        outcome,
        rationale: 'A human reviewed severity, context and evidence.',
        followUp: '',
      },
      user,
      channel,
    );
    return caseDetailSchema.parse(await result.json());
  }
  otherDecision = await decision('Comparable case A', 'uphold');
  const comparable = await decision('Comparable case B', 'modify');
  const differentRule = await decision(
    'Different version is not an automatic match',
    'overturn',
    'consistent-2',
  );
  await decision(
    'Foreign comparison must never leak',
    'overturn',
    'consistent-1',
    foreignChannel,
    outsider,
  );
  expect((await request('/consistency/scan', 'POST', {})).status).toBe(200);
  const all = (await desk()).flags.filter(
    (f) =>
      [otherDecision.id, comparable.id].includes(f.caseId) &&
      [otherDecision.id, comparable.id].includes(f.comparedCaseId ?? ''),
  );
  expect(all).toHaveLength(1);
  reviewId = all[0].id;
  expect(all[0].origin).toBe('documented_outcome_comparison');
  expect(all[0].status).toBe('open');
  expect(all[0].concern).toContain('different outcomes can be justified');
  const before = (
    await pool.query('SELECT count(*)::int AS n FROM consistency_flags')
  ).rows[0].n;
  expect((await request('/consistency/scan', 'POST', {})).status).toBe(200);
  expect(
    (await pool.query('SELECT count(*)::int AS n FROM consistency_flags'))
      .rows[0].n,
  ).toBe(before);
  expect(
    (await desk()).flags.some(
      (f) =>
        f.caseId === differentRule.id || f.comparedCaseId === differentRule.id,
    ),
  ).toBe(false);
  const foreign = (
    await pool.query('SELECT id FROM cases WHERE channel_id=$1 LIMIT 1', [
      foreignChannel,
    ])
  ).rows[0].id;
  expect(
    (
      await request('/consistency', 'POST', {
        requestId: randomUUID(),
        caseId: otherDecision.id,
        comparedCaseId: foreign,
        concern: 'Check this comparison.',
      })
    ).status,
  ).toBe(404);
});
it('requires an explicit review rationale, retains annotations and never changes the source decision', async () => {
  const initial = await get(otherDecision);
  const note = {
    expectedVersion: 1,
    status: 'open',
    note: 'Need the warning context before judging the difference.',
    severityContext: 'Severity may differ.',
    evidenceContext: 'One case lacks surrounding chat.',
  };
  const first = await request(
    `/consistency/${reviewId}`,
    'PATCH',
    note,
    moderator,
  );
  expect(first.status).toBe(200);
  expect(consistencyFlagSchema.parse(await first.json()).status).toBe('open');
  expect(
    (await request(`/consistency/${reviewId}`, 'PATCH', note)).status,
  ).toBe(409);
  expect(
    (
      await request(`/consistency/${reviewId}`, 'PATCH', {
        ...note,
        expectedVersion: 2,
        status: 'dismissed',
        note: '',
      })
    ).status,
  ).toBe(400);
  const final = await request(`/consistency/${reviewId}`, 'PATCH', {
    ...note,
    expectedVersion: 2,
    status: 'dismissed',
    note: 'Different severity explains the outcome.',
  });
  expect(final.status).toBe(200);
  expect(
    (
      await request(`/consistency/${reviewId}`, 'PATCH', {
        ...note,
        expectedVersion: 3,
      })
    ).status,
  ).toBe(409);
  const saved = await get(otherDecision);
  expect([saved.outcome, saved.rationale, saved.version]).toEqual([
    initial.outcome,
    initial.rationale,
    initial.version,
  ]);
  const history = (await desk()).activity.filter(
    (a) => a.targetId === reviewId,
  );
  expect(
    history.some((a) => a.note?.includes('One case lacks surrounding chat.')),
  ).toBe(true);
  const input = {
    requestId: randomUUID(),
    caseId: repairCase.id,
    comparedCaseId: null,
    concern:
      'Check whether the follow-up rationale explains the re-entry condition.',
  };
  const flag = consistencyFlagSchema.parse(
    await (await request('/consistency', 'POST', input)).json(),
  );
  expect(
    consistencyFlagSchema.parse(
      await (await request('/consistency', 'POST', input)).json(),
    ).id,
  ).toBe(flag.id);
});
it('generates source-linked handoffs, records rule changes and carries unresolved responsibility into the next shift', async () => {
  const open = await create('Carry this unresolved case');
  const change = {
    requestId: randomUUID(),
    title: 'No spoilers',
    previousVersion: '2',
    version: '3',
    ruleText: 'Ask before sharing a location; give an explicit reminder.',
    changeSummary:
      'Clarify what counts as a spoiler after moderator discussion.',
  };
  const changed = await request(
    '/moderation/rule-changes',
    'POST',
    change,
    moderator,
  );
  expect(changed.status).toBe(200);
  const rule = ruleChangeSchema.parse(await changed.json());
  expect(
    ruleChangeSchema.parse(
      await (
        await request('/moderation/rule-changes', 'POST', change, moderator)
      ).json(),
    ).id,
  ).toBe(rule.id);
  expect(
    (
      await request('/moderation/rule-changes', 'POST', {
        ...change,
        version: '2',
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const requestId = randomUUID();
  const generated = await Promise.all([
    request('/handoffs', 'POST', { requestId }),
    request('/handoffs', 'POST', { requestId }),
  ]);
  const ids = await Promise.all(
    generated.map(async (r) => {
      expect(r.status).toBe(200);
      return z.object({ id: z.uuid() }).parse(await r.json()).id;
    }),
  );
  expect(ids[0]).toBe(ids[1]);
  let bundle = (await desk()).handoffs.find((h) => h.id === ids[0])!;
  expect(bundle.ruleChanges.some((r) => r.id === rule.id)).toBe(true);
  expect(bundle.recentDecisions.some((r) => r.id === repairCase.id)).toBe(true);
  expect(
    bundle.items.some((i) => i.sourceType === 'case' && i.sourceId === open.id),
  ).toBe(true);
  expect(
    bundle.items.some(
      (i) => i.sourceType === 'repair' && i.sourceId === repairId,
    ),
  ).toBe(true);
  expect(bundle.items.some((i) => i.sourceType === 'flag')).toBe(true);
  const task = bundle.items.find(
    (i) => i.sourceType === 'repair' && i.sourceId === repairId,
  )!;
  const taskInput = {
    expectedVersion: 1,
    status: 'acknowledged',
    assigneeId: moderator.id,
    note: 'Next moderator will explain the rule after the stream.',
  };
  expect(
    (
      await request(
        `/handoffs/${bundle.id}/items/${task.id}`,
        'PATCH',
        taskInput,
        moderator,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        `/handoffs/${bundle.id}/items/${task.id}`,
        'PATCH',
        taskInput,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await request(`/handoffs/${bundle.id}/items/${task.id}`, 'PATCH', {
        ...taskInput,
        expectedVersion: 2,
        status: 'pending',
      })
    ).status,
  ).toBe(409);
  expect(
    (await request('/handoffs', 'POST', { requestId: randomUUID() })).status,
  ).toBe(200);
  const next = (await desk()).handoffs[0];
  expect(next.id).not.toBe(bundle.id);
  expect(next.ruleChanges).toHaveLength(0);
  const carried = next.items.find(
    (i) => i.sourceType === 'repair' && i.sourceId === repairId,
  )!;
  expect([carried.status, carried.assigneeId, carried.note]).toEqual([
    'pending',
    moderator.id,
    taskInput.note,
  ]);
  expect(
    (
      await request(`/handoffs/${next.id}/items/${carried.id}`, 'PATCH', {
        ...taskInput,
        status: 'resolved',
        expectedVersion: 1,
      })
    ).status,
  ).toBe(200);
  expect((await desk()).repairs.find((r) => r.id === repairId)?.status).toBe(
    'in_progress',
  );
  expect((await get(open)).status).toBe('open');
  expect(
    (
      await request(`/repairs/${repairId}`, 'PATCH', {
        expectedVersion: 2,
        status: 'in_progress',
        assigneeId: owner.id,
        note: 'Owner takes responsibility after the shift.',
        evidenceId: null,
      })
    ).status,
  ).toBe(200);
  expect(
    (await request('/handoffs', 'POST', { requestId: randomUUID() })).status,
  ).toBe(200);
  const reassigned = (await desk()).handoffs[0];
  const reassignedTask = reassigned.items.find(
    (i) => i.sourceType === 'repair' && i.sourceId === repairId,
  )!;
  expect(reassignedTask.assigneeId).toBe(owner.id);
  expect(
    (
      await request(
        `/handoffs/${reassigned.id}/items/${reassignedTask.id}`,
        'PATCH',
        {
          expectedVersion: 1,
          status: 'pending',
          assigneeId: null,
          note: 'Leave this shift task unassigned for triage.',
        },
      )
    ).status,
  ).toBe(200);
  expect(
    (await request('/handoffs', 'POST', { requestId: randomUUID() })).status,
  ).toBe(200);
  expect(
    (await desk()).handoffs[0].items.find((i) => i.sourceId === repairId)
      ?.assigneeId,
  ).toBeNull();
  const completed = await request(
    `/repairs/${repairId}`,
    'PATCH',
    {
      expectedVersion: 3,
      status: 'completed',
      assigneeId: moderator.id,
      note: 'Explained the current spoiler rule and confirmed understanding.',
      evidenceId: completionEvidence,
    },
    moderator,
  );
  expect(completed.status).toBe(200);
  expect(repairActionSchema.parse(await completed.json()).evidenceId).toBe(
    completionEvidence,
  );
  expect(
    (
      await request(`/repairs/${repairId}`, 'PATCH', {
        expectedVersion: 4,
        status: 'pending',
        assigneeId: null,
        note: 'Reopen',
        evidenceId: null,
      })
    ).status,
  ).toBe(409);
  bundle = (await desk()).handoffs.find((h) => h.id === bundle.id)!;
  expect(bundle.items.some((i) => i.sourceId === repairId)).toBe(true);
  expect(
    (await request('/handoffs', 'POST', { requestId: randomUUID() })).status,
  ).toBe(200);
  expect(
    (await desk()).handoffs[0].items.some((i) => i.sourceId === repairId),
  ).toBe(false);
});
it('paginates channel-scoped reviews and history without accepting foreign cursors', async () => {
  // Creation is covered above; seed volume directly to test paging without 105 unrelated HTTP mutations.
  await pool.query(
    `INSERT INTO consistency_flags(channel_id,case_id,case_version,request_id,input_fingerprint,origin,concern)
    SELECT $1,$2,$3,gen_random_uuid(),'synthetic-pagination','human','Synthetic review '||i FROM generate_series(1,105) i`,
    [channelId, repairCase.id, repairCase.version],
  );
  await pool.query(
    `INSERT INTO moderation_activity(channel_id,case_id,target_type,target_id,action,actor_twitch_user_id,note)
    SELECT channel_id,case_id,'flag',id,'flag_created',$2,'Synthetic history fixture' FROM consistency_flags WHERE channel_id=$1 AND input_fingerprint='synthetic-pagination'`,
    [channelId, owner.twitch],
  );
  const first = await desk();
  expect(first.flags).toHaveLength(50);
  expect(first.nextCursors.flags).not.toBeNull();
  const next = await desk(
    channelId,
    owner,
    `?flagCursor=${first.nextCursors.flags}`,
  );
  expect(next.flags.length).toBeGreaterThan(0);
  expect(next.flags.some((f) => first.flags.some((p) => p.id === f.id))).toBe(
    false,
  );
  expect(first.nextCursors.activity).not.toBeNull();
  const olderHistory = await desk(
    channelId,
    owner,
    `?activityCursor=${first.nextCursors.activity}`,
  );
  expect(olderHistory.activity.length).toBeGreaterThan(0);
  expect(
    olderHistory.activity.some((a) =>
      first.activity.some((p) => p.id === a.id),
    ),
  ).toBe(false);
  expect(
    (await request('/handoffs', 'POST', { requestId: randomUUID() })).status,
  ).toBe(200);
  const bounded = (await desk()).handoffs[0];
  expect(bounded.truncated).toBe(true);
  expect(bounded.items.filter((i) => i.sourceType === 'flag')).toHaveLength(
    100,
  );
  const foreign = await request(
    '/consistency',
    'POST',
    {
      requestId: randomUUID(),
      caseId: (await create('Foreign concern', outsider, foreignChannel)).id,
      comparedCaseId: null,
      concern: 'Private foreign record.',
    },
    outsider,
    foreignChannel,
  );
  const foreignId = consistencyFlagSchema.parse(await foreign.json()).id;
  expect((await request(`/moderation?flagCursor=${foreignId}`)).status).toBe(
    404,
  );
  expect(
    (await request(`/moderation?activityCursor=${randomUUID()}`)).status,
  ).toBe(404);
});
it('rechecks current role and disconnected-channel state on workflow reads and writes', async () => {
  const latest = (await desk()).handoffs[0];
  const task = latest.items.find((i) => i.status === 'pending')!;
  expect(
    (
      await request(`/handoffs/${latest.id}/items/${task.id}`, 'PATCH', {
        expectedVersion: task.version,
        status: 'pending',
        assigneeId: moderator.id,
        note: 'Assigned before the role change.',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request('/members', 'POST', {
        twitchUserId: moderator.twitch,
        role: 'team',
      })
    ).status,
  ).toBe(200);
  expect(
    (await request('/moderation', 'GET', undefined, moderator)).status,
  ).toBe(404);
  expect(
    (
      await request(
        `/consistency/${reviewId}`,
        'PATCH',
        {
          expectedVersion: 3,
          status: 'open',
          note: 'Try after revocation',
          severityContext: '',
          evidenceContext: '',
        },
        moderator,
      )
    ).status,
  ).toBe(404);
  expect(
    (await request('/handoffs', 'POST', { requestId: randomUUID() }, moderator))
      .status,
  ).toBe(404);
  expect(
    (await request('/handoffs', 'POST', { requestId: randomUUID() })).status,
  ).toBe(200);
  expect(
    (await desk()).handoffs[0].items.some((i) => i.assigneeId === moderator.id),
  ).toBe(false);
  expect((await request('/disconnect', 'POST', {})).status).toBe(204);
  expect((await request('/moderation')).status).toBe(200);
  expect(
    (await request('/handoffs', 'POST', { requestId: randomUUID() })).status,
  ).toBe(409);
  expect((await request('/consistency/scan', 'POST', {})).status).toBe(409);
});
