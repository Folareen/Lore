# Lore

Every stream has a story. Lore remembers it.

A submission for the **Codex x TwitchCon Hackathon**.

pnpm monorepo for the Lore Twitch community memory product. Includes backend Twitch authentication, channel settings, and team management. Live event capture, AI workflows, and the three product surfaces remain to be implemented.

## Local setup

Requires Node 22 (see `.nvmrc`), pnpm 10.32.1, and Docker with Compose v2.

```sh
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open the frontend at http://localhost:3000. The API is at http://127.0.0.1:4000/api/health and is also available through http://localhost:3000/api/health. API health checks PostgreSQL and Redis and returns HTTP 503 if either is unavailable.

PostgreSQL uses port **55432** and Redis uses **56379** to reduce conflicts with other local projects. Both bind to localhost. Set ports and matching connection URLs in `.env` together if you change them. Docker starts only the database and Redis; the applications run on your host with hot reload.

## Workspace

| Path              | Purpose                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `apps/api`        | NestJS: server logic, Drizzle, health checks, BullMQ queue registrations |
| `apps/web`        | Next.js App Router, React, Tailwind CSS; frontend only                   |
| `packages/shared` | Zod schemas, workflow transitions, shared types and queue names          |
| `docs`            | Product spec and frontend, backend, code quality, and GitHub conventions |

## Commands

```sh
pnpm dev                 # Build shared contracts, then watch all workspaces
pnpm build               # Build shared, API, and web in order
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration    # Requires TEST_DATABASE_URL and local PostgreSQL/Redis
pnpm format:check
pnpm db:logs
pnpm db:down              # Stops services; named data volumes remain
pnpm db:generate          # Generate a migration after editing the Drizzle schema
pnpm db:migrate           # Apply checked-in migrations
pnpm db:seed              # Idempotent demo channel seed
```

Run `pnpm --filter @lore/api start` and `pnpm --filter @lore/web start` after building to run without watchers. `pnpm db:seed` creates only a channel labeled **Demo fixture**; it is not yet the complete hosted demo dataset.

Migrations enable pgvector and create users, channels, memberships, OAuth connections, OAuth state, sessions, and audit records. Domain tables and vector dimensions follow their features.

## Configuration

The root [`.env.example`](.env.example) lists local settings. Copy it to `.env`; keep real credentials out of Git. The applications, migration tools, and Compose read this root file. Restart the applications after changing it. Provider and OAuth secrets belong only in the API; never expose them through `NEXT_PUBLIC_` variables.

For Twitch login, register `http://localhost:3000/api/auth/twitch/callback` and configure the three auth values in `.env` using `.env.example` as the reference. Generate the encryption key with `openssl rand -base64 32`. See [backend conventions](docs/backend.md#auth-and-management-api) for endpoints and session/role behavior. Without credentials, local health checks work and login returns 503.

Integration tests use mocked Twitch responses and real PostgreSQL/Redis. Set `TEST_DATABASE_URL` explicitly to a local test-capable connection (for example, the URL in `.env.example`). Its user needs `CREATEDB`; each run creates and drops a uniquely named database. CI runs these tests too.

If services fail, start Docker Desktop and check `pnpm db:logs`. Changing PostgreSQL initialization credentials does not change an existing database volume. `pnpm db:down` preserves data; adding `--volumes` to Compose shutdown deletes it.

See the [documentation index](docs/README.md) for coding conventions and the product specification.

## Contributing

Follow the [GitHub workflow](docs/github-workflow.md): create a branch, commit, push that branch, and open a pull request against the default branch.
