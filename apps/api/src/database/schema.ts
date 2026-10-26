import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const membershipRole = pgEnum('membership_role', ['moderator', 'team']);
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    twitchUserId: text('twitch_user_id').notNull().unique(),
    login: text('login').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('users_identity_unique').on(table.id, table.twitchUserId)],
);

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    twitchChannelId: text('twitch_channel_id').unique(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    displayName: text('display_name').notNull(),
    origin: text('origin', {
      enum: ['live_twitch', 'manual_import', 'demo_fixture'],
    }).notNull(),
    chatRetentionDays: integer('chat_retention_days').default(7).notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
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
    check(
      'channels_live_owner_required',
      sql`${table.origin} != 'live_twitch' OR (${table.ownerUserId} IS NOT NULL AND ${table.twitchChannelId} IS NOT NULL)`,
    ),
    check(
      'channels_connection_owner_required',
      sql`${table.connectedAt} IS NULL OR (${table.ownerUserId} IS NOT NULL AND ${table.twitchChannelId} IS NOT NULL)`,
    ),
    index('channels_owner_idx').on(table.ownerUserId),
    unique('channels_owner_unique').on(table.id, table.ownerUserId),
    foreignKey({
      name: 'channels_twitch_owner_fk',
      columns: [table.ownerUserId, table.twitchChannelId],
      foreignColumns: [users.id, users.twitchUserId],
    }),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    verificationState: text('verification_state')
      .default('owner_approved')
      .notNull(),
    grantedBy: uuid('granted_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.userId] }),
    index('memberships_user_idx').on(table.userId),
    check(
      'memberships_owner_approved',
      sql`${table.verificationState} = 'owner_approved'`,
    ),
    check(
      'memberships_owner_separate',
      sql`${table.userId} != ${table.grantedBy}`,
    ),
    foreignKey({
      name: 'memberships_granting_owner_fk',
      columns: [table.channelId, table.grantedBy],
      foreignColumns: [channels.id, channels.ownerUserId],
    }),
  ],
);

export const oauthConnections = pgTable(
  'oauth_connections',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    encryptedTokens: text('encrypted_tokens'),
    scopes: text('scopes').array().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    validatedAt: timestamp('validated_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'oauth_tokens_active_only',
      sql`(${table.revokedAt} IS NULL) = (${table.encryptedTokens} IS NOT NULL)`,
    ),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_expiry_idx').on(table.expiresAt),
  ],
);

export const oauthStates = pgTable(
  'oauth_states',
  {
    stateHash: text('state_hash').primaryKey(),
    browserHash: text('browser_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('oauth_states_expiry_idx').on(table.expiresAt)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    targetId: uuid('target_id').notNull(),
    details: jsonb('details')
      .$type<{ role?: 'moderator' | 'team'; chatRetentionDays?: number }>()
      .notNull()
      .default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_channel_time_idx').on(table.channelId, table.occurredAt),
  ],
);
