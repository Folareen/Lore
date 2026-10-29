import { sql } from 'drizzle-orm';
import type {
  AiError,
  CandidateDraft,
  Candidate,
  ExtractionRun,
  OpenLoopStatus,
  CaseStatus,
  CaseRecommendation,
} from '@lore/shared';
import {
  check,
  boolean,
  date,
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
  vector,
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
    captureRequested: boolean('capture_requested').default(false).notNull(),
    aiExtractionEnabled: boolean('ai_extraction_enabled')
      .default(false)
      .notNull(),
    aiGeneration: integer('ai_generation').default(0).notNull(),
    caseAiEnabled: boolean('case_ai_enabled').default(false).notNull(),
    caseAiGeneration: integer('case_ai_generation').default(0).notNull(),
    captureStartedAt: timestamp('capture_started_at', { withTimezone: true }),
    captureError: text('capture_error', {
      enum: ['authorization_required', 'provider_unavailable'],
    }),
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
    expectedUserId: uuid('expected_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('oauth_states_expiry_idx').on(table.expiresAt)],
);

export const twitchSubscriptions = pgTable(
  'twitch_subscriptions',
  {
    id: text('id').primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: text('status').notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [index('twitch_subscriptions_channel_idx').on(table.channelId)],
);

export const sourceEvents = pgTable(
  'source_events',
  {
    id: text('id').primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').notNull(),
    type: text('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: createdAt(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    origin: text('origin').default('live_twitch').notNull(),
    visibility: text('visibility').default('private').notNull(),
  },
  (table) => [
    index('source_events_pending_idx').on(
      table.processedAt,
      table.failedAt,
      table.receivedAt,
    ),
    index('source_events_channel_time_idx').on(
      table.channelId,
      table.occurredAt,
    ),
    index('source_events_tombstone_idx')
      .on(table.channelId, table.type, table.occurredAt)
      .where(
        sql`${table.type} IN ('channel.chat.message_delete', 'channel.chat.clear', 'channel.chat.clear_user_messages')`,
      ),
    index('source_events_expiry_idx').on(table.expiresAt),
    unique('source_events_channel_id_unique').on(table.channelId, table.id),
    check(
      'source_events_origin_private',
      sql`${table.origin} = 'live_twitch' AND ${table.visibility} = 'private'`,
    ),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull(),
    sourceEventId: text('source_event_id').notNull(),
    chatterId: text('chatter_id').notNull(),
    text: text('text').notNull(),
    badges: jsonb('badges')
      .$type<{ set_id: string; id: string; info: string }[]>()
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.messageId] }),
    index('chat_messages_expiry_idx').on(table.expiresAt),
    foreignKey({
      name: 'chat_messages_channel_source_fk',
      columns: [table.channelId, table.sourceEventId],
      foreignColumns: [sourceEvents.channelId, sourceEvents.id],
    }).onDelete('cascade'),
  ],
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

export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    // Durable reference deliberately survives receipt deletion; availability is checked with a channel-scoped join.
    sourceEventId: text('source_event_id'),
    excerpt: text('excerpt').notNull(),
    origin: text('origin', {
      enum: ['live_twitch', 'manual_import', 'demo_fixture'],
    }).notNull(),
    visibility: text('visibility').default('team').notNull(),
    retentionState: text('retention_state').default('confirmed').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique('evidence_channel_id_unique').on(table.channelId, table.id),
    check(
      'evidence_team_confirmed',
      sql`${table.visibility} IN ('team', 'private_moderation') AND ${table.retentionState} = 'confirmed'`,
    ),
  ],
);

export const openLoops = pgTable(
  'open_loops',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    wording: text('wording').notNull(),
    ownerLabel: text('owner_label'),
    dueContext: text('due_context'),
    status: text('status')
      .$type<OpenLoopStatus>()
      .default('confirmed')
      .notNull(),
    version: integer('version').default(1).notNull(),
    origin: text('origin', {
      enum: ['live_twitch', 'manual_import', 'demo_fixture'],
    }).notNull(),
    captureMethod: text('capture_method', {
      enum: ['dashboard', 'chat_command', 'ai_review'],
    }).notNull(),
    captureKey: text('capture_key').notNull(),
    evidenceId: uuid('evidence_id').notNull(),
    lastReason: text('last_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('open_loops_channel_id_unique').on(table.channelId, table.id),
    unique('open_loops_capture_unique').on(
      table.channelId,
      table.captureMethod,
      table.captureKey,
    ),
    index('open_loops_channel_status_idx').on(table.channelId, table.status),
    index('open_loops_channel_time_idx').on(
      table.channelId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'open_loops_channel_evidence_fk',
      columns: [table.channelId, table.evidenceId],
      foreignColumns: [evidence.channelId, evidence.id],
    }),
    check(
      'open_loops_status_valid',
      sql`${table.status} IN ('candidate', 'confirmed', 'in_progress', 'fulfilled', 'postponed', 'cancelled')`,
    ),
    check(
      'open_loops_terminal_reason',
      sql`${table.status} NOT IN ('fulfilled', 'cancelled') OR length(trim(${table.lastReason})) > 0 AND ${table.lastReason} IS NOT NULL`,
    ),
    check('open_loops_version_positive', sql`${table.version} > 0`),
    check(
      'open_loops_capture_origin',
      sql`(${table.captureMethod} IN ('chat_command', 'ai_review') AND ${table.origin} = 'live_twitch') OR (${table.captureMethod} = 'dashboard' AND ${table.origin} IN ('manual_import', 'demo_fixture'))`,
    ),
  ],
);

export const openLoopHistory = pgTable(
  'open_loop_history',
  {
    channelId: uuid('channel_id').notNull(),
    openLoopId: uuid('open_loop_id').notNull(),
    version: integer('version').notNull(),
    fromStatus: text('from_status').$type<OpenLoopStatus>(),
    toStatus: text('to_status').$type<OpenLoopStatus>().notNull(),
    actorTwitchUserId: text('actor_twitch_user_id').notNull(),
    reason: text('reason'),
    occurredAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.openLoopId, table.version] }),
    foreignKey({
      name: 'open_loop_history_channel_loop_fk',
      columns: [table.channelId, table.openLoopId],
      foreignColumns: [openLoops.channelId, openLoops.id],
    }).onDelete('cascade'),
  ],
);

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    generation: integer('generation').notNull(),
    revision: integer('revision').default(0).notNull(),
    status: text('status')
      .$type<ExtractionRun['status']>()
      .default('queued')
      .notNull(),
    attempts: integer('attempts').default(0).notNull(),
    error: text('error').$type<AiError>(),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('ai_runs_channel_id_unique').on(table.channelId, table.id),
    index('ai_runs_pending_idx').on(table.status, table.updatedAt),
    index('ai_runs_channel_time_idx').on(table.channelId, table.createdAt),
  ],
);

export const aiRunSources = pgTable(
  'ai_run_sources',
  {
    channelId: uuid('channel_id').notNull(),
    runId: uuid('run_id').notNull(),
    sourceEventId: text('source_event_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.sourceEventId] }),
    foreignKey({
      name: 'ai_run_sources_run_fk',
      columns: [table.channelId, table.runId],
      foreignColumns: [aiRuns.channelId, aiRuns.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ai_run_sources_event_fk',
      columns: [table.channelId, table.sourceEventId],
      foreignColumns: [sourceEvents.channelId, sourceEvents.id],
    }).onDelete('cascade'),
  ],
);

export const aiDailyUsage = pgTable(
  'ai_daily_usage',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    calls: integer('calls').default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.day] }),
    check('ai_daily_usage_positive', sql`${table.calls} >= 0`),
  ],
);

export const aiCandidates = pgTable(
  'ai_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').notNull(),
    runId: uuid('run_id').notNull(),
    sourceEventId: text('source_event_id').notNull(),
    kind: text('kind').$type<CandidateDraft['task_type']>().notNull(),
    draft: jsonb('draft').$type<CandidateDraft>(),
    status: text('status')
      .$type<Candidate['status']>()
      .default('pending')
      .notNull(),
    version: integer('version').default(1).notNull(),
    model: text('model').notNull(),
    reviewRequestId: uuid('review_request_id'),
    reviewedByTwitchUserId: text('reviewed_by_twitch_user_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewReason: text('review_reason'),
    confirmedOpenLoopId: uuid('confirmed_open_loop_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('ai_candidates_source_kind_unique').on(
      table.channelId,
      table.sourceEventId,
      table.kind,
    ),
    index('ai_candidates_channel_status_idx').on(
      table.channelId,
      table.status,
      table.id,
    ),
    foreignKey({
      name: 'ai_candidates_run_fk',
      columns: [table.channelId, table.runId],
      foreignColumns: [aiRuns.channelId, aiRuns.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ai_candidates_source_fk',
      columns: [table.channelId, table.sourceEventId],
      foreignColumns: [sourceEvents.channelId, sourceEvents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ai_candidates_loop_fk',
      columns: [table.channelId, table.confirmedOpenLoopId],
      foreignColumns: [openLoops.channelId, openLoops.id],
    }),
    check(
      'ai_candidates_state_valid',
      sql`${table.status} IN ('pending', 'confirmed', 'dismissed', 'expired') AND ${table.version} > 0`,
    ),
    check(
      'ai_candidates_confirmation',
      sql`(${table.status} = 'confirmed') = (${table.confirmedOpenLoopId} IS NOT NULL)`,
    ),
  ],
);

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdByTwitchUserId: text('created_by_twitch_user_id').notNull(),
    title: text('title').notNull(),
    subjectReference: text('subject_reference').notNull(),
    incident: text('incident').notNull(),
    appeal: text('appeal').notNull(),
    incidentAt: timestamp('incident_at', { withTimezone: true }),
    ruleTitle: text('rule_title').notNull(),
    ruleVersion: text('rule_version').notNull(),
    ruleText: text('rule_text').notNull(),
    status: text('status').$type<CaseStatus>().default('open').notNull(),
    version: integer('version').default(1).notNull(),
    origin: text('origin').default('manual_import').notNull(),
    outcome: text('outcome').$type<
      'uphold' | 'overturn' | 'modify' | 'no_action'
    >(),
    rationale: text('rationale'),
    followUp: text('follow_up'),
    aiRunId: uuid('ai_run_id'),
    aiDisposition: text('ai_disposition').$type<
      'accepted' | 'modified' | 'rejected'
    >(),
    decisionRequestId: uuid('decision_request_id'),
    decidedByTwitchUserId: text('decided_by_twitch_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    embedding: vector('embedding', { dimensions: 768 }),
    embeddingVersion: integer('embedding_version'),
    embeddingModel: text('embedding_model'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('cases_channel_id_unique').on(t.channelId, t.id),
    unique('cases_request_unique').on(t.channelId, t.requestId),
    index('cases_channel_time_idx').on(t.channelId, t.createdAt, t.id),
    check(
      'cases_state_valid',
      sql`${t.status} IN ('open','reviewing','decided') AND ${t.version} > 0`,
    ),
    check(
      'cases_decision_valid',
      sql`(${t.status}='decided') = (${t.outcome} IS NOT NULL AND ${t.rationale} IS NOT NULL AND ${t.decidedByTwitchUserId} IS NOT NULL AND ${t.decidedAt} IS NOT NULL)`,
    ),
    check(
      'cases_origin_valid',
      sql`${t.origin} IN ('manual_import','live_twitch','demo_fixture')`,
    ),
  ],
);
export const caseEvidence = pgTable(
  'case_evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').notNull(),
    caseId: uuid('case_id').notNull(),
    evidenceId: uuid('evidence_id').notNull(),
    requestId: uuid('request_id').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    label: text('label').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    storageKey: text('storage_key'),
    fileName: text('file_name'),
    contentType: text('content_type'),
    byteLength: integer('byte_length'),
    checksum: text('checksum'),
    fileState: text('file_state').$type<'pending' | 'ready' | 'removed'>(),
    uploadExpiresAt: timestamp('upload_expires_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('case_evidence_request_unique').on(t.channelId, t.requestId),
    foreignKey({
      name: 'case_evidence_case_fk',
      columns: [t.channelId, t.caseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'case_evidence_proof_fk',
      columns: [t.channelId, t.evidenceId],
      foreignColumns: [evidence.channelId, evidence.id],
    }).onDelete('cascade'),
    index('case_evidence_cleanup_idx').on(t.fileState, t.uploadExpiresAt),
  ],
);
export const caseHistory = pgTable(
  'case_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').notNull(),
    caseId: uuid('case_id').notNull(),
    version: integer('version').notNull(),
    action: text('action')
      .$type<
        | 'created'
        | 'updated'
        | 'evidence_added'
        | 'evidence_removed'
        | 'decided'
      >()
      .notNull(),
    actorTwitchUserId: text('actor_twitch_user_id').notNull(),
    reason: text('reason'),
    occurredAt: createdAt(),
  },
  (t) => [
    unique('case_history_version_unique').on(t.caseId, t.version),
    foreignKey({
      name: 'case_history_case_fk',
      columns: [t.channelId, t.caseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
  ],
);
export const caseAiRuns = pgTable(
  'case_ai_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').notNull(),
    caseId: uuid('case_id').notNull(),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    caseVersion: integer('case_version').notNull(),
    generation: integer('generation').notNull(),
    kind: text('kind').$type<'index' | 'retrieve'>().notNull(),
    revision: integer('revision').default(0).notNull(),
    status: text('status')
      .$type<ExtractionRun['status']>()
      .default('queued')
      .notNull(),
    attempts: integer('attempts').default(0).notNull(),
    error: text('error').$type<AiError>(),
    matches: jsonb('matches')
      .$type<{ caseId: string; version: number; similarity: number }[]>()
      .default([])
      .notNull(),
    recommendation: jsonb('recommendation').$type<CaseRecommendation>(),
    indexedCount: integer('indexed_count').default(0).notNull(),
    eligibleCount: integer('eligible_count').default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'case_ai_run_case_fk',
      columns: [t.channelId, t.caseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
    index('case_ai_run_pending_idx').on(t.status, t.createdAt),
    index('case_ai_run_case_idx').on(t.channelId, t.caseId, t.createdAt),
  ],
);
