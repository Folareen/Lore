import { config } from 'dotenv';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Queue } from 'bullmq';
import { queueNames, twitchModeratorScope } from '@lore/shared';
import { seedDemo } from '../src/database/seed-demo';
import { encryptTokens, hashToken } from '../src/auth/auth-crypto';
const root = resolve(__dirname, '../../..');
const liveMedia = process.env.LORE_LIVE_MEDIA_TEST === '1';
if (liveMedia) {
  config({ path: resolve(root, '.env'), quiet: true });
  for (const name of [
    'R2_ACCOUNT_ID',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ])
    if (!process.env[name]) throw new Error(`Live media test requires ${name}`);
}
const database = `lore_e2e_${randomBytes(8).toString('hex')}`;
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error(
    'TEST_DATABASE_URL is required; E2E creates an isolated database.',
  );
const admin = new Pool({ connectionString: testUrl });
const isolated = new URL(testUrl);
isolated.pathname = `/${database}`;
const pool = new Pool({ connectionString: isolated.toString() });
const redis = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
const key = Buffer.alloc(32, 7).toString('base64');
const webOrigin = 'http://127.0.0.1:4322';
const children: ChildProcess[] = [];
let stopping = false;
let stage = 'create database';
const twitchModerators = new Map<string, Set<string>>();
const imageObjects = new Map<string, Buffer>();
const mock = createServer(async (req, res) => {
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
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', image.length);
    return void res.end(image);
  }

  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url || '/', 'http://test.local');
  if (url.pathname === '/helix/moderation/moderators') {
    const broadcaster = url.searchParams.get('broadcaster_id') || '';
    if (req.headers.authorization !== `Bearer access-${broadcaster}`)
      return void res.writeHead(403).end('{}');
    const people = twitchModerators.get(broadcaster) ?? new Set<string>();
    twitchModerators.set(broadcaster, people);
    if (req.method === 'DELETE') {
      people.delete(url.searchParams.get('user_id')!);
      return void res.writeHead(204).end();
    }
    if (req.method === 'POST') {
      people.add(url.searchParams.get('user_id')!);
      return void res.writeHead(204).end();
    }
    return void res.end(
      JSON.stringify({
        data: url.searchParams
          .getAll('user_id')
          .filter((id) => people.has(id))
          .map((user_id) => ({ user_id })),
      }),
    );
  }
  if (req.url === '/oauth2/validate') {
    const id = req.headers.authorization?.replace('OAuth access-', '') ?? '';
    return void res.end(
      JSON.stringify({
        client_id: 'test-client',
        user_id: id,
        login: `user${id}`,
        scopes: [twitchModeratorScope],
        expires_in: 86400,
      }),
    );
  }
  if (req.url?.endsWith(':generateContent')) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const audio = body.contents[0].parts.some(
      (p: { inlineData?: unknown }) => p.inlineData,
    );
    let result;
    if (audio) {
      const sourceId = body.systemInstruction.parts[0].text.match(
        /Use only source ID (microphone:[^ ]+)/,
      )[1];
      result = {
        transcript: 'I will complete the browser garden tour.',
        suggestions: [
          {
            task_type: 'commitment',
            summary: 'Complete the browser garden tour.',
            source_record_ids: [sourceId],
            source_quote: 'I will complete the browser garden tour.',
            evidence_gaps: [],
            uncertainties: ['Verify transcription.'],
            suggested_next_step: 'Review with the streamer.',
            requires_human_approval: true,
          },
        ],
      };
    } else if (
      body.contents[0].parts[0].text.startsWith('<public_community_json>')
    ) {
      const data = JSON.parse(body.contents[0].parts[0].text.split('\n')[1]);
      const source = data.sources[0];
      result = data.question.includes('private')
        ? { answer: '', citations: [] }
        : {
            answer: source.body.slice(0, 200),
            citations: [{ id: source.id, quote: source.body.slice(0, 100) }],
          };
    } else {
      const sources = JSON.parse(body.contents[0].parts[0].text.split('\n')[1]);
      result = {
        title: 'Browser Gemini summary',
        body: 'The community garden is ready.',
        chatSummary: 'The garden is ready.',
        sourceIds: sources.map((s: { id: string }) => s.id),
      };
    }
    return void res.end(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify(result) }] },
          },
        ],
      }),
    );
  }
  res.writeHead(404).end('{}');
});
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse())
    if (child.exitCode === null && child.signalCode === null) {
      const ended = once(child, 'exit');
      child.kill('SIGTERM');
      await ended;
    }
  await new Promise<void>((r) => mock.close(() => r()));
  for (const name of Object.values(queueNames)) {
    const q = new Queue(name, {
      prefix: database,
      connection: {
        host: redis.hostname,
        port: Number(redis.port),
        ...(redis.password
          ? { password: decodeURIComponent(redis.password) }
          : {}),
      },
    });
    await q.obliterate({ force: true });
    await q.close();
  }
  if (liveMedia) {
    const storage = new S3Client({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: 'auto',
      forcePathStyle: true,
      maxAttempts: 3,
      requestHandler: {
        connectionTimeout: 10000,
        requestTimeout: 15000,
        throwOnRequestTimeout: true,
      },
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    try {
      const images = await pool.query<{ storage_key: string }>(
        'SELECT storage_key FROM publication_images WHERE storage_key IS NOT NULL',
      );
      for (const image of images.rows)
        await storage.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: image.storage_key,
          }),
        );
      console.log('Live media test uploads removed from R2.');
    } finally {
      storage.destroy();
    }
  }
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.end();
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void stop().then(
      () => process.exit(0),
      () => {
        console.error(
          `E2E cleanup failed; disposable database ${database} retained for retry. Credentials omitted.`,
        );
        process.exit(1);
      },
    );
  });
function start(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(cmd, args, { cwd: root, env, stdio: 'inherit' });
  children.push(child);
  child.on('exit', () => {
    if (!stopping) void stop().then(() => process.exit(1));
  });
}
async function main() {
  await admin.query(`CREATE DATABASE ${database}`);
  stage = 'migrations';
  for (const name of readdirSync(resolve(root, 'apps/api/drizzle'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await pool.query(
      readFileSync(resolve(root, 'apps/api/drizzle', name), 'utf8'),
    );
  stage = 'seed demo';
  await seedDemo(drizzle(pool));
  stage = 'seed authorization';
  for (const [n, twitch, token] of [
    [1, '100', 'a'],
    [2, '200', 'b'],
    [3, '300', 'c'],
    [4, '400', 'd'],
  ] as const) {
    const id = `00000000-0000-4000-8000-00000000910${n}`;
    await pool.query(
      'INSERT INTO users(id,twitch_user_id,login,display_name)VALUES($1,$2,$3,$3)',
      [id, twitch, `user${twitch}`],
    );
    await pool.query(
      "INSERT INTO oauth_connections(user_id,encrypted_tokens,scopes,expires_at,validated_at)VALUES($1,$2,$3,now()+interval '1 day',now())",
      [
        id,
        encryptTokens(
          JSON.stringify({
            access_token: `access-${twitch}`,
            refresh_token: 'synthetic',
          }),
          id,
          key,
        ),
        [twitchModeratorScope],
      ],
    );
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at)VALUES($1,$2,now()+interval '1 day')",
      [hashToken(token.repeat(64)), id],
    );
  }
  const channel = '00000000-0000-4000-8000-000000009200';
  await pool.query(
    "INSERT INTO channels(id,slug,twitch_channel_id,owner_user_id,display_name,origin,connected_at)VALUES($1,'browser-test','100','00000000-0000-4000-8000-000000009101','Browser test','live_twitch',now())",
    [channel],
  );
  // Synthetic directory communities use separate owners without sessions or private data.
  for (let index = 1; index <= 14; index++) {
    const slug = `discovery-fixture-${String(index).padStart(2, '0')}`;
    const twitch = String(950000 + index);
    const identity = await pool.query(
      'INSERT INTO users(twitch_user_id,login,display_name) VALUES($1,$2,$2) RETURNING id',
      [twitch, slug],
    );
    const result = await pool.query(
      "INSERT INTO channels(slug,display_name,origin,connected_at,owner_user_id,twitch_channel_id) VALUES($1,$2,'live_twitch',now(),$3,$4) RETURNING id",
      [
        slug,
        `Discovery fixture ${String(index).padStart(2, '0')}`,
        identity.rows[0].id,
        twitch,
      ],
    );
    await pool.query(
      "INSERT INTO public_entries(channel_id,request_id,input_fingerprint,kind,title,body,chat_summary,status,approved_by_twitch_user_id,published_at) VALUES($1,gen_random_uuid(),'directory-fixture','story','Meet the garden crew','A synthetic public introduction: viewers name the plants and build the garden together.','','published','100',now())",
      [result.rows[0].id],
    );
  }
  for (const [n, role] of [
    [2, 'moderator'],
    [3, 'team'],
  ] as const)
    await pool.query(
      "INSERT INTO memberships(channel_id,user_id,role,granted_by)VALUES($1,$2,$3,'00000000-0000-4000-8000-000000009101')",
      [channel, `00000000-0000-4000-8000-00000000910${n}`, role],
    );
  mock.listen(0, '127.0.0.1');
  await once(mock, 'listening');
  const address = mock.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing mock port');
  start(process.execPath, ['apps/api/dist/main.js'], {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: isolated.toString(),
    REDIS_URL: redis.toString(),
    QUEUE_PREFIX: database,
    API_PORT: '4321',
    APP_ORIGIN: webOrigin,
    TWITCH_CLIENT_ID: 'test-client',
    TWITCH_CLIENT_SECRET: 'synthetic',
    AUTH_ENCRYPTION_KEY: key,
    TWITCH_TEST_BASE_URL: `http://127.0.0.1:${address.port}`,
    TWITCH_EVENTSUB_SECRET: '',
    TWITCH_EVENTSUB_CALLBACK_URL: '',
    GEMINI_API_KEY: 'synthetic',
    GEMINI_MODEL: 'test-model',
    AI_TEST_BASE_URL: `http://127.0.0.1:${address.port}`,
    R2_ACCOUNT_ID: liveMedia ? process.env.R2_ACCOUNT_ID : 'a'.repeat(32),
    R2_BUCKET: liveMedia ? process.env.R2_BUCKET : 'test-bucket',
    R2_ACCESS_KEY_ID: liveMedia ? process.env.R2_ACCESS_KEY_ID : 'mock-key',
    R2_SECRET_ACCESS_KEY: liveMedia
      ? process.env.R2_SECRET_ACCESS_KEY
      : 'mock-secret',
    R2_TEST_ENDPOINT: liveMedia
      ? undefined
      : `http://127.0.0.1:${address.port}`,
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4321/api/health')).ok) break;
    } catch {
      /* Startup only. */
    }
    if (i === 99) throw new Error('E2E API did not become ready');
    await new Promise((r) => setTimeout(r, 100));
  }
  start(
    process.execPath,
    [
      'apps/web/node_modules/next/dist/bin/next',
      'start',
      'apps/web',
      '--hostname',
      '127.0.0.1',
      '--port',
      '4322',
    ],
    {
      ...process.env,
      NODE_ENV: 'production',
      LORE_E2E_BUILD: '1',
      APP_ORIGIN: webOrigin,
      API_INTERNAL_URL: 'http://127.0.0.1:4321',
    },
  );
}
void main().catch(async (error: unknown) => {
  console.error(
    `E2E stage: ${stage}; code: ${error instanceof Error && 'code' in error ? String(error.code) : 'unknown'}`,
  );
  console.error('Isolated E2E stack failed; content and credentials omitted.');
  await stop();
  process.exitCode = 1;
});
