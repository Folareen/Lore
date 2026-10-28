# Backend conventions

Applies to `apps/api`: NestJS, Drizzle/PostgreSQL, Redis, and BullMQ. Follow the shared [code quality rules](code-quality.md).

- Organize code by feature. Use NestJS modules and constructor injection; controllers handle HTTP concerns and delegate business behavior to services. Add repositories where they enforce channel-scoped data access. Avoid extra forwarding layers. See [NestJS controllers](https://docs.nestjs.com/controllers).
- Use kebab-case filenames with NestJS suffixes such as `.controller.ts`, `.service.ts`, and `.module.ts`. Use PascalCase for classes and camelCase for functions and variables.
- Validate configuration at startup and external payloads at entry points with Zod. Infer shared request, response, and job types from `packages/shared`; keep API-only schemas local. A queue consumer validates its persisted payload even when its producer already validated input.
- Authenticate protected requests and enforce channel membership, role, and visibility in NestJS. Scope database queries before retrieval, vector ranking, exports, or AI calls. Recheck authorization on every protected operation.
- Keep database access in the API. Use Drizzle-inferred types, parameterized queries, constraints, and transactions for related writes. Return explicit response projections; public responses must not contain private case fields or credentials.
- Change schema through reviewed migrations: edit `src/database/schema.ts`, run `pnpm db:generate`, commit SQL and metadata, then run `pnpm db:migrate`. Keep seeds repeatable and demo records labeled. Choose the embedding model before defining vector dimensions.
- Enforce shared status transitions and human approval in server mutations. Record decisions and publication actions in the audit trail. Schema validation alone does not establish permission or approval.
- Preserve raw EventSub bytes for signature verification. Reject stale or invalid deliveries, deduplicate events, and persist acceptance before acknowledging. Queue recovery must handle temporary Redis failures.
- Keep ingestion and AI queues separate. Make processors idempotent, use bounded retries with backoff, and report exhausted failures. Redis uses `noeviction`; retained evidence must survive raw-chat purges.
- Keep provider calls behind the OpenAI/Gemini interface. Validate model output, require available source references, and keep untrusted content separate from instructions. AI drafts require human confirmation.
- Use meaningful HTTP status codes and NestJS exceptions without exposing internal errors. Log failures at one responsible boundary with safe identifiers; redact tokens, credentials, evidence, and raw chat.
- Test authorization, channel isolation, validation failures, transitions, webhook verification, and job retries alongside their implementations. Include integration tests when behavior depends on PostgreSQL or Redis.

## Auth and management API

Twitch-only sign-in creates or updates a Lore user. Register `${APP_ORIGIN}/api/auth/twitch/callback` as the exact OAuth redirect URI. Configure `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and a stable base64-encoded 32-byte `AUTH_ENCRYPTION_KEY` together. Blank credentials disable login locally; production requires all credentials and an HTTPS origin. Keys stay outside Git.

| Method | Route under `/api`              | Access / behavior                                                |
| ------ | ------------------------------- | ---------------------------------------------------------------- |
| GET    | `/auth/twitch`                  | Start browser-bound, ten-minute OAuth flow                       |
| GET    | `/auth/twitch/callback`         | Consume state once, set session cookie, redirect to `/app`       |
| GET    | `/auth/status`                  | Public login availability; exposes no credentials                |
| GET    | `/auth/session`                 | Current user and CSRF token                                      |
| POST   | `/auth/logout`                  | Revoke current session and clear cookie                          |
| GET    | `/channels`                     | Owned channels and active team grants                            |
| POST   | `/channels/connect`             | Connect the signed-in user’s own Twitch channel; empty JSON body |
| GET    | `/channels/:id`                 | Owner or current member of a connected channel                   |
| PATCH  | `/channels/:id/settings`        | Owner; `{ "chatRetentionDays": 1 }` (1–7)                        |
| POST   | `/channels/:id/disconnect`      | Owner; disconnect and remove all team grants                     |
| GET    | `/channels/:id/members`         | Owner; list granted team roles                                   |
| POST   | `/channels/:id/members`         | Owner; upsert `{ "twitchUserId": "123", "role": "moderator" }`   |
| DELETE | `/channels/:id/members/:userId` | Owner; remove a Lore user’s membership immediately               |

Mutations require the session cookie, `Origin: APP_ORIGIN`, and `X-CSRF-Token` from the session response. Sessions expire after seven days and cookies are HttpOnly, SameSite=Lax, and Secure in production. Session cookies cover `/` so Next.js can authenticate server-rendered workspace pages. API responses are not cached. Auth start is limited to 20 requests/minute; the general limit is 120/minute per direct peer IP in the single-process deployment. Clients through the local Next.js proxy share its limit; trusted forwarding and distributed limiting belong to deployment work.

Ownership is derived from Twitch identity and cannot be transferred through settings. Non-owner roles are `moderator` and `team`; the target must have signed in to Lore first. Grants are labeled `owner_approved`, not Twitch-verified. Only owners manage settings and grants; disconnected channels remain visible to their owner. Reconnection preserves channel records but requires new team grants. Management changes are audited transactionally.

Login requests no chat or moderation scopes. Stored access/refresh tokens are encrypted; session and OAuth-state tokens are hashed. Twitch credentials are validated at startup and at least hourly while running; refreshes are serialized per account. Revocation ends all related sessions, disconnects owned channels, and removes their grants. Provider outages fail stale authorization checks without deleting valid sessions. References: [OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/).

Local Docker runs PostgreSQL and Redis only. Login, channel, settings, team, and account screens accompany these endpoints. Future features follow the end-to-end rule in the design system.

## Twitch EventSub ingestion

Setup stays in the [root README](../README.md#twitch-app-and-live-capture). Live capture is owner-only and opt-in after connecting a channel; ordinary sign-in never requests capture scopes. `GET /api/auth/twitch/capture` starts browser-bound OAuth for the signed-in account with `user:read:chat user:bot channel:bot`. The callback rejects a different Twitch identity. The broadcaster acts as the reading user, so a separate bot credential is unnecessary. Chat sending and moderation permissions are not requested.

| Method | Route under `/api`              | Behavior                                                                         |
| ------ | ------------------------------- | -------------------------------------------------------------------------------- |
| POST   | `/webhooks/twitch`              | Public signed EventSub callback; no session or CSRF requirement                  |
| GET    | `/channels/:id/ingestion`       | Owner-only configuration, scope, subscription and processing status              |
| POST   | `/channels/:id/ingestion/start` | Owner + CSRF; validate Twitch authorization and opt into capture                 |
| POST   | `/channels/:id/ingestion/stop`  | Owner + CSRF; stop accepting/processing immediately and reconcile remote removal |

Supported version-1 subscriptions: `channel.chat.message`, `channel.chat.message_delete`, `channel.chat.clear`, `channel.chat.clear_user_messages`, `stream.online`, and `stream.offline`. Moderation and appeal events await their features and scopes. Shared-chat messages originating from another broadcaster are ignored. Stream lifecycle events are stored as validated sources for later briefing work, without generating briefs or AI records now.

The webhook verifies HMAC-SHA256 over message ID + original timestamp + exact raw bytes, compares signatures in constant time, and rejects deliveries older than ten minutes or over one minute into the future. It validates envelope/header agreement, supported version, transport, callback, broadcaster and reading identity. Challenges return plain text only for connected channels with requested capture. Notifications require a known enabled subscription; unknown or stopped subscriptions are acknowledged without storing content. Signed revocations stop capture, surface an authorization or connection error and require an owner restart. The route bypasses browser rate limiting to support chat volume; deploy an upstream body/connection limit without modifying signed bodies.

PostgreSQL accepts each delivery ID once before HTTP 204. Redis is never awaited on that response path. Recovery runs on acceptance, startup and every 15 seconds, scanning pending durable events and recreating missing jobs. Jobs contain only the delivery ID; their deterministic ID is `delivery-` plus its base64url encoding because Twitch IDs are opaque and BullMQ reserves colons. `QUEUE_PREFIX` isolates queues by deployment/database. Workers validate persisted payloads, serialize each channel's writes and use the channel/message unique key for idempotence. AI stays on its separate queue. Three attempts use exponential backoff; exhausted work sets `failed_at`, emits a safe log and appears in owner status. Retained failed jobs contain no chat. An operator can retry a retained failed BullMQ job after repairing the cause; success clears the database failure marker. Do not automatically loop exhausted work indefinitely.

Subscriptions reconcile at startup, owner start/stop and every 30 seconds with a database advisory lock across instances. Reconciliation paginates the app's subscriptions, adopts matching callback/channel subscriptions after a restart, and removes this installation's obsolete subscriptions on stop/disconnect. It never manages another callback's unknown subscriptions. Permission failures and provider outages appear in owner status. A stopped or disconnected channel rejects ingestion immediately even while remote cleanup retries. Reconnection does not opt capture back in. Keep the signing secret stable; see the README for rotation.

Normalized chat lives in private `source_events` payloads and `chat_messages`; there is no public/raw-chat read endpoint. Deletion and clear receipts immediately scrub matching ordinary payloads and rows. Eight-day deletion tombstones prevent late workers or out-of-order deliveries from restoring removed chat. Channel locks serialize acceptance, deletes, workers and disconnect. A repeatable BullMQ retention job runs every minute; it applies current channel retention (including reductions) and removes ordinary chat and expired source payloads. Payload-free receipts last 30 days for deduplication. Future confirmed evidence must be copied into a separate retention policy/table before ordinary sources expire; this feature creates no evidence records. Production retention and sharing policy validation remains a deployment prerequisite from the product spec.

Integration tests use isolated PostgreSQL databases/queue prefixes and a mocked Twitch server. They exercise signed challenges, scope/owner/CSRF checks, duplicates, Redis outage/recovery through a test TCP proxy, deletion ordering, lifecycle events, retention, retries, revocation and disconnect. Actual Twitch account permissions and tunnel delivery remain a live setup check.
