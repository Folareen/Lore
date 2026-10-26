import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Only the bootstrap channel table is modeled here. Feature migrations add the remaining domain.
export const channels = pgTable(
  'channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    twitchChannelId: text('twitch_channel_id').unique(),
    displayName: text('display_name').notNull(),
    origin: text('origin', {
      enum: ['live_twitch', 'manual_import', 'demo_fixture'],
    }).notNull(),
    chatRetentionDays: integer('chat_retention_days').default(7).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'channels_retention_bootstrap_limit',
      sql`${table.chatRetentionDays} BETWEEN 1 AND 7`,
    ),
    check(
      'channels_origin_valid',
      sql`${table.origin} IN ('live_twitch', 'manual_import', 'demo_fixture')`,
    ),
  ],
);
