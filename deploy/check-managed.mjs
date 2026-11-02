import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const require = createRequire(import.meta.url);
const release = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { parse } = require(resolve(release, 'api/node_modules/dotenv'));
const { Pool } = require(resolve(release, 'api/node_modules/pg'));
const Redis = require(resolve(release, 'api/node_modules/ioredis'));
const env = parse(readFileSync(resolve(release, '.env.production')));
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 15000,
  query_timeout: 15000,
});
const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 10000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
pool.on('error', () => {});
redis.on('error', () => {});
try {
  await pool.query('select 1');
  console.log('Managed PostgreSQL connection passed.');
  await redis.connect();
  if ((await redis.ping()) !== 'PONG') throw new Error('Redis ping failed');
  const memory = await redis.info('memory');
  if (!/^maxmemory_policy:noeviction\r?$/m.test(memory)) {
    throw new Error('Redis requires noeviction');
  }
  console.log('Managed Redis connection and noeviction policy passed.');
} catch {
  console.error(
    'Managed-service check failed. Verify connectivity, credentials, and Redis noeviction policy.',
  );
  process.exitCode = 1;
} finally {
  redis.disconnect();
  await pool.end();
}
