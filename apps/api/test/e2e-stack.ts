import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Queue } from 'bullmq';
import { queueNames } from '@lore/shared';
import { seedDemo } from '../src/database/seed-demo';
import { encryptTokens, hashToken } from '../src/auth/auth-crypto';
const root = resolve(__dirname, '../../..');
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
const mock = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/oauth2/validate') {
    const id = req.headers.authorization?.replace('OAuth access-', '') ?? '';
    return void res.end(
      JSON.stringify({
        client_id: 'test-client',
        user_id: id,
        login: `user${id}`,
        scopes: [],
        expires_in: 86400,
      }),
    );
  }
  res.writeHead(404).end('{}');
});
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse())
    if (child.exitCode === null) {
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
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.end();
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void stop().then(() => process.exit(0));
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
      "INSERT INTO oauth_connections(user_id,encrypted_tokens,scopes,expires_at,validated_at)VALUES($1,$2,'{}'::text[],now()+interval '1 day',now())",
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
    GEMINI_API_KEY: '',
    R2_ACCOUNT_ID: '',
    R2_BUCKET: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
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
