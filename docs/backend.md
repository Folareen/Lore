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

Normalized chat lives in private `source_events` payloads and `chat_messages`; there is no public/raw-chat read endpoint. Deletion and clear receipts immediately scrub matching ordinary payloads and rows. Eight-day deletion tombstones prevent late workers or out-of-order deliveries from restoring removed chat. Channel locks serialize acceptance, deletes, workers and disconnect. A repeatable BullMQ retention job runs every minute; it applies current channel retention (including reductions) and removes ordinary chat and expired source payloads. Payload-free receipts last 30 days for deduplication. Confirmed promises copy their relevant excerpt into separate team-only evidence before ordinary chat expires; see below. Production retention and sharing policy validation remains a deployment prerequisite from the product spec.

Integration tests use isolated PostgreSQL databases/queue prefixes and a mocked Twitch server. They exercise signed challenges, scope/owner/CSRF checks, duplicates, Redis outage/recovery through a test TCP proxy, deletion ordering, lifecycle events, retention, retries, revocation and disconnect. Actual Twitch account permissions and tunnel delivery remain a live setup check.

## Promises and next-stream brief

Owners and active approved moderators/team members can read and capture promises. Dashboard captures and verified broadcaster/moderator `!promise <wording>` chat commands create **confirmed** open loops as explicit human actions. A broadcaster badge must match the broadcaster's user ID; ordinary chat, viewer/VIP/subscriber badges, malformed commands and foreign shared-chat sources never confirm promises. A Twitch command does not grant its sender access to Lore. Ordinary-chat AI candidates require separate owner consent and human review below. Chat sending is not enabled.

| Method     | Route under `/api/channels/:id` | Behavior                                                   |
| ---------- | ------------------------------- | ---------------------------------------------------------- |
| GET, POST  | `/open-loops`                   | Scoped list (50 per page) or confirmed dashboard capture   |
| GET, PATCH | `/open-loops/:loopId`           | Read a promise or perform an allowed status transition     |
| GET        | `/open-loops/:loopId/history`   | Ordered human capture/status audit trail                   |
| GET        | `/brief`                        | Current saved active promises, ordered for the next stream |

POST accepts `{ wording, requestId, ownerLabel?, dueContext? }`; `requestId` is a UUID reused only for retries of that capture. Duplicate dashboard requests and duplicate Twitch chat message IDs cannot create extra promises or evidence, including after restarts. Owner and due context are optional descriptive labels; they do not grant access or imply parsed deadlines. PATCH accepts `{ status, expectedVersion, reason? }`; fulfillment and cancellation require a reason. Transactions enforce shared status transitions, version conflicts, current channel access and the history entry together. Disconnected owners retain read access; mutations require reconnection. Lists support validated `status` and channel-scoped UUID `cursor` query parameters, ordered by creation time and ID.

The brief includes up to 20 confirmed, in-progress and postponed records, the full active count, source excerpts and promise IDs. In-progress comes first, then confirmed, then postponed; a due label takes priority within each group, followed by oldest creation time. It is a reproducible rundown of saved records, without AI generation, scheduling or inferred stream context. Fulfilled/cancelled records and unconfirmed candidates are excluded. The frontend links to individual promises even outside the first list page.

Capture copies the exact relevant wording into `evidence` with team visibility and confirmed retention. Retained excerpts live with the confirmed record, separately from ordinary chat; neither raw retention purges nor message deletions silently erase that human-kept proof. The durable source delivery reference intentionally survives receipt deletion, and availability uses a channel-scoped join. API responses mark a removed/expired original as unavailable; dashboard sources use `null` availability. `open_loop_history` records the Twitch actor, version, statuses, time and reason without copying raw chat into general logs. No promise or excerpt is public without a separate publication feature. Further evidence deletion and production retention policy belong to the corresponding privacy/deployment work.

## AI candidates

`AiProvider` isolates application extraction from Gemini transport. Structured output passes the shared Zod contract and exact source-ID/quote checks; unknown citations, duplicate source/kind pairs, false human-approval flags, extra authority fields, blocked/truncated output and malformed JSON fail closed. Delimited chat is untrusted data beneath separate system instructions. No tools or automatic moderation actions are exposed to the model. OpenAI case reasoning and Gemini embeddings are implemented for private moderation cases below.

| Method | Route under `/api/channels/:id`    | Behavior                                                              |
| ------ | ---------------------------------- | --------------------------------------------------------------------- |
| GET    | `/ai`                              | Scoped configuration availability, UTC usage and ten recent runs      |
| POST   | `/ai/settings`                     | Owner consent `{ enabled }`; changes audited                          |
| POST   | `/ai/extractions`                  | Active team member requests retained new chat analysis; `{}`          |
| POST   | `/ai/extractions/:runId/retry`     | Explicit retry of a failed run; `{}`                                  |
| GET    | `/candidates`                      | 50 per page, `status` (default pending), channel-scoped UUID `cursor` |
| POST   | `/candidates/:candidateId/confirm` | `{ wording, expectedVersion, requestId, ownerLabel?, dueContext? }`   |
| POST   | `/candidates/:candidateId/dismiss` | `{ expectedVersion, reason }`                                         |

All mutations use the usual session, Origin and CSRF checks. Channel locks serialize consent, membership, disconnect and review. Runs claim source messages once; AI queue jobs contain only run ID and retry revision. Durable recovery runs every 15 seconds, with three exponential-backoff attempts and explicit retries after exhaustion. Provider calls run outside database locks, recheck consent/generation and available channel-scoped sources before and after the call, and reserve the daily attempt budget atomically before sending. Changing consent discards old-generation work, and disconnect/account authorization revocation disables extraction. Requests are bounded to 20 messages of at most 2,000 characters, 45 seconds and 128 KB of response. No raw chat, key or provider response is persisted in queue errors/logs.

Drafts are separate from `open_loops` and evidence, private to active channel members, and scrubbed with source deletion/expiry or shorter current retention. Read and confirm paths independently check source availability. Confirmation transactionally creates `ai_review` evidence, a confirmed promise, its human history entry and the candidate decision. Same-actor/request/wording retries return the saved promise; stale or conflicting reviews return 409. Dismissal records actor, time and required reason. Drafts and source receipts expire; confirmed evidence remains under the confirmed-record lifecycle described above. The brief remains a deterministic list of human-confirmed records.

## Private moderation cases

Case access is narrower than team memory: only the owner and current approved **moderators** can read, retrieve, download or mutate cases. Team grants and outsiders are denied. Owners retain read-only access after disconnect. Every user query scopes the channel first; sensitive lists, case/precedent reads and file downloads record identifier-only audit entries. Manual cases snapshot the incident, appeal, incident time and rule text/version. Shared transitions are `open → reviewing/decided`, `reviewing → decided`; final decisions are immutable. Later reviews use new cases. Creation, evidence capture and decisions support request IDs; edits/reviews use optimistic versions and transactional actor/time history.

| Method       | Route under `/api/channels/:id/cases` | Behavior                                                                                             |
| ------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET, POST    | `/`                                   | Scoped 50-item list (`status`, UUID cursor), or manual case creation                                 |
| GET, PATCH   | `/:caseId`                            | Full private case or versioned editable case update                                                  |
| POST         | `/:caseId/decision`                   | Human outcome/rationale/follow-up; optional current AI run and accepted/modified/rejected assessment |
| POST, DELETE | `/:caseId/evidence[/:evidenceId]`     | Retain text/chat proof or remove evidence with a reason                                              |
| POST         | `/:caseId/files`                      | Bounded multipart upload (`file`, `label`, `expectedVersion`, `requestId`)                           |
| GET          | `/:caseId/files/:fileId/download`     | Authorize, verify file, recheck access, redirect to a 60-second signed attachment URL                |
| GET, POST    | `/ai/settings`                        | Configuration/usage or owner-only private-case AI consent                                            |
| GET, POST    | `/:caseId/precedents`                 | Latest scoped result or explicit durable retrieval request                                           |

Private evidence reuses `evidence` with `private_moderation` visibility and a same-channel `case_evidence` association; team promise reads still require team visibility. Cited live-chat excerpts must match currently available same-channel chat; capture keeps the full message independently of raw retention/deletion. R2 files use random, server-owned keys; no key is accepted from a client. Uploads are restricted to 5 MB PNG/JPEG/PDF/UTF-8 text, with size/signature checks and sanitized attachment names. They are never rendered inline or sent to models. Durable pending upload references expire after 15 minutes; a minute-based cleanup retries abandoned/removed objects without exposing them. Access/version is rechecked after the network upload. Explicit removal clears the retained text, denies downloads immediately and leaves an auditable removal reason. Issued download links remain bearer capabilities until their short expiry. R2 must remain private; hosted credentials/setup stay in the README.

`AiProvider` now routes extraction/embeddings to Gemini and case reasoning to OpenAI. Private case AI has separate default-off consent/generation from chat extraction. Gemini Embedding 2 is fixed at 768 normalized finite dimensions. Explicit retrieval schedules up to 20 unindexed prior decisions, then a query; its separate `lore-case-ai` queue uses identifier-only jobs, durable recovery and three bounded attempts. Requests share the existing UTC provider-attempt budget. A materialized same-channel, decided, current-model/version scope is formed **before** pgvector cosine ranking (top five, minimum similarity 0.35). Scores are retrieval signals. Partial indexing is disclosed; explicit retrieval retries cover later batches or failed indexing. Embedding summaries are bounded to 6,000 characters and do not include subject identity fields.

Case consent, requesting moderator role and case version are checked before each provider call and before saving results. Withdrawal clears vectors/drafts; stale contexts never become current recommendations. OpenAI receives only the current scoped case, up to eight retained excerpts (1,000 characters each, truncation disclosed), file metadata marked unread, and retrieved prior case context. Responses use strict structured output, `store:false`, no tools, bounded transport, shared Zod validation and available same-channel case citations. Invalid vectors, refusals, truncated output and fabricated citations fail closed. Recommendations never change a case; an explicit human decision records outcome, rationale, actor, time and any chosen AI assessment. Consistency flags, handoffs, assigned repair actions and automated Twitch moderation are separate features.
