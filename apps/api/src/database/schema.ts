import { sql } from 'drizzle-orm';
import type {
  AiError,
  CandidateDraft,
  Candidate,
  ExtractionRun,
  OpenLoopStatus,
  CaseStatus,
  CaseRecommendation,
  RepairAction,
  ConsistencyFlag,
  Handoff,
  HandoffItem,
  ManagedPublication,
  MicrophoneCapture,
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
    lastRetentionPurgeAt: timestamp('last_retention_purge_at', {
      withTimezone: true,
    }),
    captureRequested: boolean('capture_requested').default(false).notNull(),
    moderationImportsEnabled: boolean('moderation_imports_enabled')
      .default(false)
      .notNull(),
    moderationImportsEnabledAt: timestamp('moderation_imports_enabled_at', {
      withTimezone: true,
    }),
    promiseConfirmationsEnabled: boolean('promise_confirmations_enabled')
      .default(false)
      .notNull(),
    promiseConfirmationsEnabledAt: timestamp(
      'promise_confirmations_enabled_at',
      { withTimezone: true },
    ),
    lastPromiseConfirmationAt: timestamp('last_promise_confirmation_at', {
      withTimezone: true,
    }),
    publicSummaryAiEnabled: boolean('public_summary_ai_enabled')
      .default(false)
      .notNull(),
    communityAssistantEnabled: boolean('community_assistant_enabled')
      .default(false)
      .notNull(),
    microphoneEnabled: boolean('microphone_enabled').default(false).notNull(),
    featuresGeneration: integer('features_generation').default(0).notNull(),
    workspaceRevision: integer('workspace_revision').default(0).notNull(),
    aiExtractionEnabled: boolean('ai_extraction_enabled')
      .default(false)
      .notNull(),
    aiGeneration: integer('ai_generation').default(0).notNull(),
    caseAiEnabled: boolean('case_ai_enabled').default(false).notNull(),
    caseAiGeneration: integer('case_ai_generation').default(0).notNull(),
    catchupEnabled: boolean('catchup_enabled').default(false).notNull(),
    catchupGeneration: integer('catchup_generation').default(0).notNull(),
    catchupEnabledAt: timestamp('catchup_enabled_at', { withTimezone: true }),
    lastCatchupAt: timestamp('last_catchup_at', { withTimezone: true }),
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
      sql`${table.origin} IN ('live_twitch', 'manual_import') AND ${table.visibility} = 'private'`,
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
      .$type<{
        role?: 'moderator' | 'team';
        index?: number;
        reason?: string;
        openLoopId?: string | null;
        chatRetentionDays?: number;
        overlay?: {
          entryIds: string[];
          enabled: boolean;
          mode: 'recap' | 'open_loops';
        };
      }>()
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
      sql`(${table.captureMethod} = 'chat_command' AND ${table.origin} = 'live_twitch') OR (${table.captureMethod} = 'ai_review' AND ${table.origin} IN ('live_twitch', 'manual_import')) OR (${table.captureMethod} = 'dashboard' AND ${table.origin} IN ('manual_import', 'demo_fixture'))`,
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
    origin: text('origin')
      .$type<'live_twitch' | 'manual_import' | 'demo_fixture'>()
      .default('manual_import')
      .notNull(),
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
    unique('case_evidence_channel_id_unique').on(t.channelId, t.id),
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

export const repairActions = pgTable(
  'repair_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').notNull(),
    caseId: uuid('case_id').notNull(),
    requestId: uuid('request_id').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    title: text('title').notNull(),
    kind: text('kind').$type<RepairAction['kind']>().notNull(),
    agreement: text('agreement').notNull(),
    assigneeId: uuid('assignee_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: text('status')
      .$type<RepairAction['status']>()
      .default('pending')
      .notNull(),
    version: integer('version').default(1).notNull(),
    completionNote: text('completion_note'),
    evidenceId: uuid('evidence_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('repair_channel_id_unique').on(t.channelId, t.id),
    unique('repair_request_unique').on(t.channelId, t.requestId),
    foreignKey({
      columns: [t.channelId, t.caseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.channelId, t.evidenceId],
      foreignColumns: [caseEvidence.channelId, caseEvidence.id],
    }),
    check(
      'repair_state_valid',
      sql`${t.version}>0 AND ${t.status} IN ('pending','in_progress','completed','cancelled') AND ${t.kind} IN ('follow_up','repair','re_entry')`,
    ),
    check(
      'repair_completion_valid',
      sql`${t.status} NOT IN ('completed','cancelled') OR (${t.completionNote} IS NOT NULL AND length(trim(${t.completionNote}))>0)`,
    ),
    index('repair_channel_time_idx').on(t.channelId, t.createdAt),
  ],
);
export const consistencyFlags = pgTable(
  'consistency_flags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').notNull(),
    caseId: uuid('case_id').notNull(),
    comparedCaseId: uuid('compared_case_id'),
    caseVersion: integer('case_version').notNull(),
    comparedVersion: integer('compared_version'),
    requestId: uuid('request_id').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    comparisonKey: text('comparison_key'),
    version: integer('version').default(1).notNull(),
    status: text('status')
      .$type<ConsistencyFlag['status']>()
      .default('open')
      .notNull(),
    origin: text('origin').$type<ConsistencyFlag['origin']>().notNull(),
    concern: text('concern').notNull(),
    reviewNote: text('review_note'),
    severityContext: text('severity_context').default('').notNull(),
    evidenceContext: text('evidence_context').default('').notNull(),
    reviewedByTwitchUserId: text('reviewed_by_twitch_user_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('flag_request_unique').on(t.channelId, t.requestId),
    unique('flag_comparison_unique').on(t.channelId, t.comparisonKey),
    foreignKey({
      columns: [t.channelId, t.caseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.channelId, t.comparedCaseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
    check(
      'flag_state_valid',
      sql`${t.version}>0 AND ${t.status} IN ('open','confirmed','dismissed') AND ${t.origin} IN ('human','documented_outcome_comparison')`,
    ),
    check(
      'flag_review_valid',
      sql`${t.status}='open' OR (${t.reviewNote} IS NOT NULL AND ${t.reviewedByTwitchUserId} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL)`,
    ),
    index('flag_channel_time_idx').on(t.channelId, t.createdAt),
  ],
);
export const handoffs = pgTable(
  'handoffs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    summary: text('summary').notNull(),
    createdByTwitchUserId: text('created_by_twitch_user_id').notNull(),
    recentDecisions: jsonb('recent_decisions')
      .$type<Handoff['recentDecisions']>()
      .notNull(),
    ruleContexts: jsonb('rule_contexts')
      .$type<Handoff['ruleContexts']>()
      .notNull(),
    ruleChanges: jsonb('rule_changes')
      .$type<Handoff['ruleChanges']>()
      .notNull(),
    truncated: boolean('truncated').default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('handoff_channel_id_unique').on(t.channelId, t.id),
    unique('handoff_request_unique').on(t.channelId, t.requestId),
    check('handoff_period_valid', sql`${t.periodStart}<=${t.periodEnd}`),
    index('handoff_channel_time_idx').on(t.channelId, t.createdAt),
  ],
);
export const handoffItems = pgTable(
  'handoff_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').notNull(),
    handoffId: uuid('handoff_id').notNull(),
    caseId: uuid('case_id').notNull(),
    sourceType: text('source_type')
      .$type<HandoffItem['sourceType']>()
      .notNull(),
    sourceId: uuid('source_id').notNull(),
    sourceVersion: integer('source_version').notNull(),
    title: text('title').notNull(),
    assigneeId: uuid('assignee_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    status: text('status')
      .$type<HandoffItem['status']>()
      .default('pending')
      .notNull(),
    version: integer('version').default(1).notNull(),
    note: text('note'),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.channelId, t.handoffId],
      foreignColumns: [handoffs.channelId, handoffs.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.channelId, t.caseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
    unique('handoff_source_unique').on(t.handoffId, t.sourceType, t.sourceId),
    check(
      'handoff_item_state_valid',
      sql`${t.version}>0 AND ${t.sourceVersion}>0 AND ${t.sourceType} IN ('case','repair','flag') AND ${t.status} IN ('pending','acknowledged','resolved')`,
    ),
  ],
);
export const moderationActivity = pgTable(
  'moderation_activity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id'),
    targetType: text('target_type')
      .$type<'repair' | 'flag' | 'handoff' | 'task' | 'rule'>()
      .notNull(),
    targetId: uuid('target_id').notNull(),
    action: text('action').notNull(),
    actorTwitchUserId: text('actor_twitch_user_id').notNull(),
    note: text('note'),
    assigneeId: uuid('assignee_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    occurredAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.channelId, t.caseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
    index('moderation_activity_channel_time_idx').on(t.channelId, t.occurredAt),
  ],
);

export const ruleChanges = pgTable(
  'rule_changes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    title: text('title').notNull(),
    previousVersion: text('previous_version').notNull(),
    version: text('version').notNull(),
    ruleText: text('rule_text').notNull(),
    changeSummary: text('change_summary').notNull(),
    actorTwitchUserId: text('actor_twitch_user_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('rule_change_request_unique').on(t.channelId, t.requestId),
    index('rule_change_channel_time_idx').on(t.channelId, t.createdAt),
  ],
);

export const publicEntries = pgTable(
  'public_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    kind: text('kind').$type<ManagedPublication['kind']>().notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    chatSummary: text('chat_summary').notNull(),
    promiseId: uuid('promise_id'),
    status: text('status')
      .$type<ManagedPublication['status']>()
      .default('draft')
      .notNull(),
    version: integer('version').default(1).notNull(),
    approvedByTwitchUserId: text('approved_by_twitch_user_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('public_entry_channel_id_unique').on(t.channelId, t.id),
    unique('public_entry_request_unique').on(t.channelId, t.requestId),
    foreignKey({
      columns: [t.channelId, t.promiseId],
      foreignColumns: [openLoops.channelId, openLoops.id],
    }),
    check(
      'public_entry_state_valid',
      sql`${t.version}>0 AND ${t.status} IN ('draft','published','unpublished','deleted') AND ${t.kind} IN ('milestone','reference','story','commitment','summary')`,
    ),
    check(
      'public_entry_approval_required',
      sql`${t.status}!='published' OR (${t.approvedByTwitchUserId} IS NOT NULL AND ${t.publishedAt} IS NOT NULL)`,
    ),
    index('public_entry_channel_time_idx').on(t.channelId, t.publishedAt, t.id),
  ],
);
export const publicEntrySources = pgTable(
  'public_entry_sources',
  {
    channelId: uuid('channel_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    sourceId: uuid('source_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.sourceId] }),
    foreignKey({
      columns: [t.channelId, t.entryId],
      foreignColumns: [publicEntries.channelId, publicEntries.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.channelId, t.sourceId],
      foreignColumns: [publicEntries.channelId, publicEntries.id],
    }).onDelete('cascade'),
    check('public_entry_no_self_source', sql`${t.entryId}!=${t.sourceId}`),
  ],
);
export const publicationHistory = pgTable(
  'publication_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    version: integer('version').notNull(),
    action: text('action').notNull(),
    actorTwitchUserId: text('actor_twitch_user_id').notNull(),
    reason: text('reason'),
    occurredAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.channelId, t.entryId],
      foreignColumns: [publicEntries.channelId, publicEntries.id],
    }).onDelete('cascade'),
    unique('publication_history_version_unique').on(t.entryId, t.version),
  ],
);
export const catchupReplies = pgTable(
  'catchup_replies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull(),
    kind: text('kind')
      .$type<'catchup' | 'promise'>()
      .default('catchup')
      .notNull(),
    openLoopId: uuid('open_loop_id'),
    generation: integer('generation').notNull(),
    status: text('status')
      .$type<
        | 'queued'
        | 'attempted'
        | 'sent'
        | 'dropped'
        | 'failed'
        | 'cancelled'
        | 'uncertain'
      >()
      .default('queued')
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('catchup_message_unique').on(t.channelId, t.messageId),
    index('catchup_pending_idx').on(t.status, t.createdAt),
  ],
);

export const overlayTokens = pgTable(
  'overlay_tokens',
  {
    channelId: uuid('channel_id')
      .primaryKey()
      .references(() => channels.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash'),
    version: integer('version').default(0).notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    mode: text('mode', { enum: ['recap', 'open_loops'] })
      .default('recap')
      .notNull(),
    entryIds: jsonb('entry_ids').$type<string[]>().default([]).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    check('overlay_mode_check', sql`${t.mode} IN ('recap','open_loops')`),
    check('overlay_version_check', sql`${t.version}>=0`),
  ],
);

// A curated, anonymous demo snapshot is kept separate from live records and credentials.
export const demoDatasets = pgTable('demo_datasets', {
  slug: text('slug').primaryKey(),
  payload: jsonb('payload')
    .$type<import('@lore/shared').DemoDataset>()
    .notNull(),
  updatedAt: updatedAt(),
});

export const microphoneCaptures = pgTable(
  'microphone_captures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    sourceEventId: text('source_event_id').notNull(),
    transcript: text('transcript'),
    drafts: jsonb('drafts').$type<CandidateDraft[]>(),
    decisions: jsonb('decisions')
      .$type<MicrophoneCapture['decisions']>()
      .default({})
      .notNull(),
    model: text('model').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'microphone_source_fk',
      columns: [t.channelId, t.sourceEventId],
      foreignColumns: [sourceEvents.channelId, sourceEvents.id],
    }).onDelete('cascade'),
    index('microphone_channel_expiry_idx').on(t.channelId, t.expiresAt),
  ],
);
export const caseImports = pgTable(
  'case_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    sourceEventId: text('source_event_id').notNull(),
    caseId: uuid('case_id').notNull(),
    externalKey: text('external_key').notNull(),
  },
  (t) => [
    unique('case_import_external_unique').on(t.channelId, t.externalKey),
    foreignKey({
      name: 'case_import_case_fk',
      columns: [t.channelId, t.caseId],
      foreignColumns: [cases.channelId, cases.id],
    }).onDelete('cascade'),
  ],
);
