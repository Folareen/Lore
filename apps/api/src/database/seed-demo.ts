import { demoSeed, demoDatasetSchema } from '@lore/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { demoDatasets } from './schema';
export async function seedDemo(db: NodePgDatabase) {
  // The anonymous demo never reads from or creates live identities/domain records.
  const payload = demoDatasetSchema.parse(demoSeed);
  await db
    .insert(demoDatasets)
    .values({ slug: 'lore-demo', payload })
    .onConflictDoUpdate({
      target: demoDatasets.slug,
      set: { payload, updatedAt: new Date() },
    });
}
