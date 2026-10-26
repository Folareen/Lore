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

The initial scaffold has a health endpoint, queue registrations, and a bootstrap channel table. The rules above guide feature implementation; they do not imply those features already exist. Local Docker runs only PostgreSQL and Redis; VPS application containers, Caddy, and production hardening remain deployment work.
