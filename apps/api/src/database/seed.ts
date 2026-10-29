import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { seedDemo } from './seed-demo';
config({ path: '../../.env', quiet: true });
async function seed() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await seedDemo(drizzle(pool));
    console.log('Seeded Lore demo workspace (Demo fixture). Open /demo.');
  } finally {
    await pool.end();
  }
}
void seed().catch(() => {
  console.error(
    'Demo seed failed. Check database connectivity and migrations.',
  );
  process.exitCode = 1;
});
