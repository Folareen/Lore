// Refuse to overwrite live target data; expose credentials only through a private file.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const require = createRequire(import.meta.url);
const release = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { parse } = require(resolve(release, 'api/node_modules/dotenv'));
const { Client } = require(resolve(release, 'api/node_modules/pg'));
const env = parse(readFileSync(resolve(release, '.env.production')));
const client = new Client({
  connectionString: env.DIRECT_DATABASE_URL,
  connectionTimeoutMillis: 15000,
  query_timeout: 15000,
});
try {
  if (!process.argv[2] || !env.DIRECT_DATABASE_URL)
    throw new Error('Missing transfer settings');
  if (!process.argv[3]) throw new Error('Previous configuration is required');
  const previous = parse(readFileSync(process.argv[3]));
  for (const key of [
    'AUTH_ENCRYPTION_KEY',
    'TWITCH_CLIENT_ID',
    'TWITCH_EVENTSUB_SECRET',
    'R2_ACCOUNT_ID',
    'R2_BUCKET',
  ]) {
    if (previous[key] !== env[key])
      throw new Error('Existing integration settings must be preserved');
  }
  await client.connect();
  const tables = await client.query(
    "select tablename from pg_tables where schemaname='public'",
  );
  for (const { tablename } of tables.rows) {
    if (tablename === 'demo_datasets') continue;
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const result = await client.query(
      `select exists(select 1 from ${quoted}) as populated`,
    );
    if (result.rows[0].populated)
      throw new Error('Target contains application data');
  }
  const url = new URL(env.DIRECT_DATABASE_URL);
  const values = {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: '/tmp/lore-transfer-ca.crt',
    PGCONNECT_TIMEOUT: '15',
    PGCHANNELBINDING: url.searchParams.get('channel_binding') || 'prefer',
    ...(url.searchParams.has('options')
      ? { PGOPTIONS: url.searchParams.get('options') }
      : {}),
  };
  if (Object.values(values).some((value) => /[\r\n]/.test(value)))
    throw new Error('Invalid connection settings');
  writeFileSync(
    process.argv[2],
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Target contains no live application data; protected transfer settings prepared.',
  );
} catch {
  console.error(
    'Transfer preparation failed: verify direct database access, unchanged integration keys, and an empty target (synthetic demo seed only).',
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
