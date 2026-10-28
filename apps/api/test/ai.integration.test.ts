import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  queueNames,
  aiStatusSchema,
  candidatePageSchema,
  streamBriefSchema,
  type Candidate,
} from '@lore/shared';
import { csrfToken, encryptTokens, hashToken } from '../src/auth/auth-crypto';
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error('Set TEST_DATABASE_URL to run isolated integration tests');
const database = `lore_ai_test_${randomBytes(8).toString('hex')}`;
const admin = new Pool({ connectionString: testUrl });
const isolated = new URL(testUrl);
isolated.pathname = `/${database}`;
const pool = new Pool({ connectionString: isolated.toString() });
const encryptionKey = randomBytes(32).toString('base64');
const owner = {
  id: randomUUID(),
  twitch: '100',
  token: randomBytes(32).toString('hex'),
};
const member = {
  id: randomUUID(),
  twitch: '200',
  token: randomBytes(32).toString('hex'),
};
const outsider = {
  id: randomUUID(),
  twitch: '300',
  token: randomBytes(32).toString('hex'),
};
const channelId = randomUUID();
const foreignId = randomUUID();
let api: ChildProcess;
let mock: Server;
let queue: Queue;
let origin: string;
let output = '';
let calls = 0;
let sentSources: { id: string; text: string }[] = [];
let mode: 'valid' | 'invalid' | 'unavailable' | 'paused' = 'valid';
let release: (() => void) | undefined;
async function port(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Port missing');
  return address.port;
}
async function eventually(check: () => Promise<boolean>, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Timed out; API: ${output.slice(-1800)}`);
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  actor = owner,
  csrf = true,
) {
  return fetch(`${origin}/api/channels/${channelId}${path}`, {
    method,
    headers: {
      Cookie: `lore_session=${actor.token}`,
      Origin: origin,
      ...(csrf ? { 'X-CSRF-Token': csrfToken(actor.token) } : {}),
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function seed(text: string, channel = channelId) {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO source_events (id, channel_id, subscription_id, type, occurred_at, payload, expires_at, processed_at) VALUES ($1,$2,'mock','channel.chat.message',now(),$3,now()+interval '7 days',now())",
    [id, channel, { message_id: id, message: { text } }],
  );
  await pool.query(
    "INSERT INTO chat_messages (channel_id,message_id,source_event_id,chatter_id,text,badges,occurred_at,expires_at) VALUES ($1,$2,$2,'100',$3,'[]',now(),now()+interval '7 days')",
    [channel, id, text],
  );
  return id;
}
async function toggle(enabled: boolean) {
  const response = await request('/ai/settings', 'POST', { enabled });
  expect(response.status).toBe(200);
}
async function extract() {
  const response = await request('/ai/extractions', 'POST', {});
  expect(response.status).toBe(200);
  return z.object({ runId: z.uuid() }).parse(await response.json()).runId;
}
async function waitRun(id: string, status = 'completed') {
  await eventually(
    async () =>
      (await pool.query('SELECT status FROM ai_runs WHERE id=$1', [id])).rows[0]
        ?.status === status,
  );
}
async function candidates(status = 'pending') {
  const response = await request(`/candidates?status=${status}`);
  expect(response.status).toBe(200);
  return candidatePageSchema.parse(await response.json());
}
async function candidateFor(sourceId: string): Promise<Candidate> {
  const page = await candidates();
  const candidate = page.items.find((item) => item.source.id === sourceId);
  expect(candidate).toBeDefined();
  return candidate!;
}
beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${database}`);
  for (const file of readdirSync(resolve('apps/api/drizzle'))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    await pool.query(readFileSync(resolve('apps/api/drizzle', file), 'utf8'));
  for (const actor of [owner, member, outsider]) {
    await pool.query(
      'INSERT INTO users (id,twitch_user_id,login,display_name) VALUES ($1,$2,$3,$3)',
      [actor.id, actor.twitch, `user${actor.twitch}`],
    );
    const tokens = encryptTokens(
      JSON.stringify({
        access_token: `access-${actor.twitch}`,
        refresh_token: 'refresh',
      }),
      actor.id,
      encryptionKey,
    );
    await pool.query(
      "INSERT INTO oauth_connections (user_id,encrypted_tokens,scopes,expires_at,validated_at) VALUES ($1,$2,'{}',now()+interval '1 day',now())",
      [actor.id, tokens],
    );
    await pool.query(
      "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day')",
      [hashToken(actor.token), actor.id],
    );
  }
  for (const [id, actor] of [
    [channelId, owner],
    [foreignId, outsider],
  ] as const)
    await pool.query(
      "INSERT INTO channels (id,slug,twitch_channel_id,owner_user_id,display_name,origin,connected_at) VALUES ($1,$2,$3,$4,$2,'live_twitch',now())",
      [id, `channel-${actor.twitch}`, actor.twitch, actor.id],
    );
  await pool.query(
    "INSERT INTO memberships (channel_id,user_id,role,granted_by) VALUES ($1,$2,'moderator',$3)",
    [channelId, member.id, owner.id],
  );
  mock = createServer(async (req, res) => {
    if (req.url === '/oauth2/validate') {
      const twitch =
        req.headers.authorization?.replace('OAuth access-', '') || '';
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
    if (req.url?.includes(':generateContent')) {
      calls++;
      expect(req.headers['x-goog-api-key']).toBe('mock-gemini-key');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      expect(body.systemInstruction.parts[0].text).toContain(
        'UNTRUSTED CHAT DATA',
      );
      const data = body.contents[0].parts[0].text
        .replace('<untrusted_chat_json>\n', '')
        .replace('\n</untrusted_chat_json>', '');
      const sources = JSON.parse(data).sources as {
        id: string;
        text: string;
      }[];
      sentSources = sources;
      if (mode === 'paused')
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (mode === 'unavailable') {
        res.writeHead(503).end('private provider error');
        return;
      }
      const suggestions = sources.map((source) => ({
        task_type: 'commitment',
        summary: 'Share the playlist.',
        source_record_ids: [mode === 'invalid' ? 'foreign-source' : source.id],
        source_quote: source.text,
        evidence_gaps: ['Destination unknown'],
        uncertainties: ['Context needs review'],
        requires_human_approval: true,
        suggested_next_step: 'Ask the broadcaster.',
      }));
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify({ suggestions }) }] },
            },
          ],
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  const mockPort = await port(mock);
  const temporary = createServer();
  const apiPort = await port(temporary);
  await new Promise<void>((resolve) => temporary.close(() => resolve()));
  origin = `http://127.0.0.1:${apiPort}`;
  const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
  queue = new Queue(queueNames.ai, {
    prefix: database,
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port),
      db: Number(redisUrl.pathname.slice(1) || 0),
    },
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
      TWITCH_TEST_BASE_URL: `http://127.0.0.1:${mockPort}`,
      TWITCH_EVENTSUB_SECRET: '',
      TWITCH_EVENTSUB_CALLBACK_URL: '',
      GEMINI_API_KEY: 'mock-gemini-key',
      GEMINI_MODEL: 'test-model',
      AI_TEST_BASE_URL: `http://127.0.0.1:${mockPort}`,
      AI_DAILY_CALL_LIMIT: '50',
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
    try {
      return (await request('/ai')).ok;
    } catch {
      return false;
    }
  });
}, 60000);
afterAll(async () => {
  release?.();
  if (api && api.exitCode === null) {
    const exited = once(api, 'exit');
    api.kill('SIGTERM');
    await exited;
  }
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
  // Ingestion's retention scheduler uses the same isolated prefix.
  const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
  const ingestion = new Queue(queueNames.ingestion, {
    prefix: database,
    connection: { host: redisUrl.hostname, port: Number(redisUrl.port) },
  });
  await ingestion.obliterate({ force: true });
  await ingestion.close();
  if (mock) await new Promise<void>((resolve) => mock.close(() => resolve()));
  await pool.end();
  // Pool shutdown can resolve before PostgreSQL observes the final socket close.
  // Wait for that close rather than terminating an ending client with DROP ... FORCE.
  await eventually(async () => {
    const { rows } = await admin.query(
      'SELECT count(*)::int AS connections FROM pg_stat_activity WHERE datname=$1',
      [database],
    );
    return rows[0].connections === 0;
  });
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.end();
});
describe('AI extraction and human candidate review', () => {
  it('defaults off and enforces owner consent, membership and CSRF', async () => {
    const status = aiStatusSchema.parse(await (await request('/ai')).json());
    expect(status.enabled).toBe(false);
    expect(status.configured).toBe(true);
    expect(
      (await request('/ai/settings', 'POST', { enabled: true }, member)).status,
    ).toBe(403);
    expect(
      (await request('/ai/settings', 'POST', { enabled: true }, owner, false))
        .status,
    ).toBe(403);
    expect((await request('/ai', 'GET', undefined, outsider)).status).toBe(404);
    expect((await request('/ai/extractions', 'POST', {})).status).toBe(409);
    expect(calls).toBe(0);
  });
  it('extracts only channel-scoped retained ordinary chat and keeps candidates out of the brief', async () => {
    const id = await seed('I will share the playlist after the stream.');
    await seed('Do not send this private foreign channel message.', foreignId);
    await seed('!promise Already explicit human capture');
    await toggle(true);
    const runId = await extract();
    await waitRun(runId);
    expect(sentSources.map((source) => source.id)).toContain(id);
    expect(sentSources).toHaveLength(1);
    const candidate = await candidateFor(id);
    expect(candidate.draft?.requires_human_approval).toBe(true);
    expect(candidate.source.text).toBe(
      'I will share the playlist after the stream.',
    );
    expect(
      streamBriefSchema.parse(await (await request('/brief')).json())
        .activeCount,
    ).toBe(0);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM evidence')).rows[0].n,
    ).toBe(0);
    const jobs = await queue.getJobs(['completed', 'active', 'waiting']);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs)
      expect(Object.keys(job.data).sort()).toEqual(['revision', 'runId']);
    await toggle(false);
  });
  it('confirms edited wording atomically, audits the reviewer, and retries without duplicate evidence', async () => {
    const candidate = (await candidates()).items[0];
    const input = {
      wording: 'Share our playlist in Discord.',
      expectedVersion: candidate.version,
      requestId: randomUUID(),
      ownerLabel: 'The crew',
      dueContext: 'Next stream',
    };
    expect(
      (
        await request(
          `/candidates/${candidate.id}/confirm`,
          'POST',
          input,
          outsider,
        )
      ).status,
    ).toBe(404);
    const response = await request(
      `/candidates/${candidate.id}/confirm`,
      'POST',
      input,
      member,
    );
    expect(response.status).toBe(200);
    const saved = z
      .object({ openLoopId: z.uuid() })
      .parse(await response.json());
    expect(
      await (
        await request(
          `/candidates/${candidate.id}/confirm`,
          'POST',
          input,
          member,
        )
      ).json(),
    ).toEqual(saved);
    expect(
      (
        await request(
          `/candidates/${candidate.id}/confirm`,
          'POST',
          { ...input, wording: 'Different' },
          member,
        )
      ).status,
    ).toBe(409);
    const brief = streamBriefSchema.parse(
      await (await request('/brief')).json(),
    );
    expect(brief.items[0].wording).toBe(input.wording);
    expect(brief.items[0].captureMethod).toBe('ai_review');
    expect(
      (
        await pool.query(
          'SELECT actor_twitch_user_id FROM open_loop_history WHERE open_loop_id=$1',
          [saved.openLoopId],
        )
      ).rows[0].actor_twitch_user_id,
    ).toBe(member.twitch);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM evidence')).rows[0].n,
    ).toBe(1);
    await pool.query('UPDATE source_events SET payload=NULL WHERE id=$1', [
      candidate.source.id,
    ]);
    await pool.query('DELETE FROM chat_messages WHERE source_event_id=$1', [
      candidate.source.id,
    ]);
    const reviewed = (await candidates('confirmed')).items[0];
    expect(reviewed.draft).toBeNull();
    expect(reviewed.source.available).toBe(false);
    expect(
      streamBriefSchema.parse(await (await request('/brief')).json()).items[0]
        .source.excerpt,
    ).toBe(candidate.source.text);
  });
  it('records dismissal and rejects stale competing approvals', async () => {
    const id = await seed('I will post the schedule tomorrow.');
    await toggle(true);
    await waitRun(await extract());
    await toggle(false);
    const candidate = await candidateFor(id);
    expect(
      (
        await request(`/candidates/${candidate.id}/dismiss`, 'POST', {
          expectedVersion: candidate.version,
          reason: '',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/candidates/${candidate.id}/dismiss`,
          'POST',
          { expectedVersion: candidate.version, reason: 'Only a passing idea' },
          member,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await request(`/candidates/${candidate.id}/confirm`, 'POST', {
          wording: 'Schedule',
          expectedVersion: candidate.version,
          requestId: randomUUID(),
        })
      ).status,
    ).toBe(409);
    const dismissed = (await candidates('dismissed')).items[0];
    expect(dismissed.reviewReason).toBe('Only a passing idea');
    expect(dismissed.reviewedByTwitchUserId).toBe(member.twitch);
  });
  it('expires derived drafts under current retention and refuses confirmation after source removal', async () => {
    const id = await seed('I will share the guide.');
    await toggle(true);
    await waitRun(await extract());
    await toggle(false);
    const candidate = await candidateFor(id);
    await pool.query(
      "UPDATE chat_messages SET occurred_at=now()-interval '2 days' WHERE source_event_id=$1",
      [id],
    );
    await pool.query('UPDATE channels SET chat_retention_days=1 WHERE id=$1', [
      channelId,
    ]);
    expect(
      (
        await request(`/candidates/${candidate.id}/confirm`, 'POST', {
          wording: 'Guide',
          expectedVersion: candidate.version,
          requestId: randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (await candidates('expired')).items.find(
        (item) => item.id === candidate.id,
      )?.draft,
    ).toBeNull();
    expect(
      (
        await pool.query('SELECT draft FROM ai_candidates WHERE id=$1', [
          candidate.id,
        ])
      ).rows[0].draft,
    ).toBeNull();
  });
  it('discards an in-flight result when owner consent changes', async () => {
    const id = await seed('I will post the art.');
    mode = 'paused';
    release = undefined;
    await toggle(true);
    const runId = await extract();
    await eventually(async () => Boolean(release));
    await toggle(false);
    release!();
    mode = 'valid';
    await waitRun(runId, 'cancelled');
    await eventually(
      async () => (await queue.getJobs(['active'])).length === 0,
    );
    expect(
      (await candidates()).items.some((item) => item.source.id === id),
    ).toBe(false);
  });
  it('bounds invalid-output retries and permits an explicit retry after repair', async () => {
    const id = await seed('I will post the recipes.');
    mode = 'invalid';
    const before = calls;
    await toggle(true);
    const runId = await extract();
    await waitRun(runId, 'failed');
    expect(calls - before).toBe(3);
    expect(
      (await candidates()).items.some((item) => item.source.id === id),
    ).toBe(false);
    expect(
      (await pool.query('SELECT error FROM ai_runs WHERE id=$1', [runId]))
        .rows[0].error,
    ).toBe('invalid_output');
    mode = 'valid';
    expect(
      (await request(`/ai/extractions/${runId}/retry`, 'POST', {})).status,
    ).toBe(200);
    await waitRun(runId);
    expect((await candidateFor(id)).draft?.summary).toBe('Share the playlist.');
    await toggle(false);
  });
  it('rechecks source availability after the provider returns', async () => {
    const id = await seed('I will publish the map.');
    mode = 'paused';
    release = undefined;
    await toggle(true);
    const runId = await extract();
    await eventually(async () => Boolean(release));
    await pool.query('UPDATE source_events SET payload=NULL WHERE id=$1', [id]);
    await pool.query('DELETE FROM chat_messages WHERE source_event_id=$1', [
      id,
    ]);
    release!();
    mode = 'valid';
    await waitRun(runId, 'cancelled');
    expect(
      (await pool.query('SELECT error FROM ai_runs WHERE id=$1', [runId]))
        .rows[0].error,
    ).toBe('source_unavailable');
    expect(
      (await candidates()).items.some((item) => item.source.id === id),
    ).toBe(false);
    await toggle(false);
  });
  it('rechecks the requesting member after an in-flight membership removal', async () => {
    await toggle(true);
    const id = await seed('I will publish the credits.');
    mode = 'paused';
    release = undefined;
    const response = await request('/ai/extractions', 'POST', {}, member);
    expect(response.status).toBe(200);
    const { runId } = z
      .object({ runId: z.uuid() })
      .parse(await response.json());
    expect(
      (
        await pool.query(
          'SELECT requested_by_user_id FROM ai_runs WHERE id=$1',
          [runId],
        )
      ).rows[0].requested_by_user_id,
    ).toBe(member.id);
    await eventually(async () => Boolean(release));
    expect((await request(`/members/${member.id}`, 'DELETE')).status).toBe(204);
    release!();
    mode = 'valid';
    await waitRun(runId, 'cancelled');
    expect(
      (await candidates()).items.some((item) => item.source.id === id),
    ).toBe(false);
    await toggle(false);
    await pool.query(
      "INSERT INTO memberships (channel_id,user_id,role,granted_by) VALUES ($1,$2,'moderator',$3)",
      [channelId, member.id, owner.id],
    );
  });
  it('recovers a missing queue job from the durable run without creating duplicates', async () => {
    await queue.pause();
    await seed('I will share the checklist.');
    await toggle(true);
    const runId = await extract();
    await eventually(async () => Boolean(await queue.getJob(`ai-${runId}-0`)));
    const job = await queue.getJob(`ai-${runId}-0`);
    await job!.remove();
    expect(await queue.getJob(`ai-${runId}-0`)).toBeUndefined();
    await toggle(true);
    await eventually(async () => Boolean(await queue.getJob(`ai-${runId}-0`)));
    await queue.resume();
    await waitRun(runId);
    await toggle(false);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM ai_candidates WHERE run_id=$1',
          [runId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('reserves the daily cost cap before making a provider call', async () => {
    await seed('I will post another guide.');
    await pool.query(
      'INSERT INTO ai_daily_usage (channel_id,day,calls) VALUES ($1,CURRENT_DATE,50) ON CONFLICT (channel_id,day) DO UPDATE SET calls=50',
      [channelId],
    );
    const before = calls;
    await toggle(true);
    const runId = await extract();
    await waitRun(runId, 'failed');
    expect(calls).toBe(before);
    expect(
      (await pool.query('SELECT error FROM ai_runs WHERE id=$1', [runId]))
        .rows[0].error,
    ).toBe('daily_limit');
    await toggle(false);
  });
});
