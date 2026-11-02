import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { resolve } from 'node:path';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
