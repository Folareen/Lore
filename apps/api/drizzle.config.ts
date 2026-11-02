import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
config({ path: '../../.env', quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required; copy .env.example to .env');
export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  },
});
