# Local development

Follow the root README for the first run. Run all `pnpm` commands there unless explicitly filtering a workspace.

## Environment

The root `.env` is ignored by Git. Copy `.env.example` before starting. NestJS, Drizzle tools, the seed script, Next.js configuration, and Docker Compose read the root file. Shell environment variables take precedence. Restart development processes after changing it.

| Variable            | Used by               | Default                                             |
| ------------------- | --------------------- | --------------------------------------------------- |
| `POSTGRES_USER`     | Docker PostgreSQL     | `lore`                                              |
| `POSTGRES_PASSWORD` | Docker PostgreSQL     | `lore_local` (local use only)                       |
| `POSTGRES_DB`       | Docker PostgreSQL     | `lore`                                              |
| `POSTGRES_PORT`     | Docker host binding   | `55432`                                             |
| `REDIS_PORT`        | Docker host binding   | `56379`                                             |
| `DATABASE_URL`      | NestJS, Drizzle, seed | `postgresql://lore:lore_local@127.0.0.1:55432/lore` |
| `REDIS_URL`         | NestJS, BullMQ        | `redis://127.0.0.1:56379`                           |
| `API_PORT`          | NestJS                | `4000`                                              |
| `API_INTERNAL_URL`  | Next.js API proxy     | `http://127.0.0.1:4000`                             |

Next.js forwards `/api/*` to NestJS so the browser uses one origin. It does not connect to PostgreSQL or Redis. Future Twitch, AI, session encryption, and S3 credentials belong only in the API environment. Do not prefix secrets with `NEXT_PUBLIC_`.

## Database changes

1. Edit `apps/api/src/database/schema.ts`.
2. Run `pnpm db:generate` and review the generated SQL.
3. Commit the SQL and Drizzle metadata together.
4. Run `pnpm db:migrate`.

The checked-in initial migration enables `vector`. On an existing database, the migration user needs permission to create the extension. The local Docker image includes pgvector.

Run `pnpm db:seed` to insert the demo channel safely multiple times. This does not provision accounts or bypass authentication.

## Troubleshooting

- Docker unavailable: start Docker Desktop, then rerun `pnpm db:up`.
- Port in use: update the published port and its URL in `.env`, then recreate the services and restart the apps.
- Database authentication fails after changing credentials: PostgreSQL's initialization variables only apply to an empty volume. Existing databases retain their previous credentials.
- Health returns 503: inspect `pnpm db:logs` and verify connection URLs. Normal status is `{"status":"ok","dependencies":{"postgres":"up","redis":"up"}}`.
- Shared imports fail when starting an individual app: run `pnpm --filter @lore/shared build` first. Root `pnpm dev` does this automatically.

`pnpm db:down` preserves data. Avoid `docker compose down --volumes` unless you intend to delete all local database and queue data.
