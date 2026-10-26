import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { channels } from './schema';
config({ path: '../../.env', quiet: true });
async function seed() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await drizzle(pool)
      .insert(channels)
      .values({
        slug: 'lore-demo',
        displayName: 'Lore Demo',
        origin: 'demo_fixture',
      })
      .onConflictDoNothing({ target: channels.slug });
    console.log('Seeded Lore Demo channel (Demo fixture).');
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
