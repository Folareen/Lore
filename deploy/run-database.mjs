// Load credentials without shell evaluation or placing URLs in process arguments.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const require = createRequire(import.meta.url);
const release = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
if (!['migrate', 'seed'].includes(action)) {
  console.error('Expected migrate or seed.');
  process.exit(1);
}
const { parse } = require(resolve(release, 'api/node_modules/dotenv'));
const env = {
  ...process.env,
  ...parse(readFileSync(resolve(release, '.env.production'))),
};
env.DATABASE_URL = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
const result = spawnSync(process.execPath, [`dist/database/${action}.js`], {
  cwd: resolve(release, 'api'),
  env,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
