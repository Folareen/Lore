import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { resolve } from 'node:path';

async function main() {
  const connectionString =
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 15000 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
    console.log('Lore database migrations complete.');
  } finally {
    await pool.end();
  }
}
void main().catch(() => {
  console.error('Migration failed. Check database access and migration files.');
  process.exitCode = 1;
});
