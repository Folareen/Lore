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

Local Docker runs PostgreSQL and Redis only. EventSub capture, AI workflows, domain tables, and production deployment are separate feature work. Login, channel, settings, team, and account screens now accompany these endpoints. Future features follow the end-to-end rule in the design system.
