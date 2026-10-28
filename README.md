# Lore

Every stream has a story. Lore remembers it.

A submission for the **Codex x TwitchCon Hackathon**.

pnpm monorepo for the Lore Twitch community memory product. Includes Twitch sign-in, channel settings, team management, opt-in EventSub ingestion, promise capture, and a next-stream brief with a light/dark frontend. AI extraction, moderator workflows and public community memory follow in later features.

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

Open the landing page at http://localhost:3000. Explore the labeled workspace fixtures at http://localhost:3000/preview without a Twitch account. Real authenticated pages live under `/app`; sign-in is at `/login`. The API is at http://127.0.0.1:4000/api/health and is also available through http://localhost:3000/api/health. API health checks PostgreSQL and Redis and returns HTTP 503 if either is unavailable.

Try promise capture without credentials at `/preview?view=streamer`, then open **Next-stream brief**. Demo changes stay in the browser and reset on refresh. Authenticated equivalents are `/app/streamer` and `/app/brief`; the overview also has quick capture. Save an explicit commitment, move it through its allowed statuses, and include a reason when fulfilling or cancelling it. The brief lists saved active promises and links to their sources; it does not call an AI provider. Twitch commands appear after refreshing the promises list once ingestion has processed them. If Twitch registration is blocked by 2FA, this preview and the mocked integration tests remain usable.

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

Migrations enable pgvector and create auth, management, EventSub subscription, private source-event, and captured-chat tables. Other domain tables and vector dimensions follow their features.

## Configuration

The root [`.env.example`](.env.example) lists local settings. Copy it to `.env`; keep real credentials out of Git. The applications, migration tools, and Compose read this root file. Restart the applications after changing it. Provider and OAuth secrets belong only in the API; never expose them through `NEXT_PUBLIC_` variables.

For Twitch login, register `http://localhost:3000/api/auth/twitch/callback` and configure the three auth values in `.env` using `.env.example` as the reference. Generate the encryption key with `openssl rand -base64 32`. See [backend conventions](docs/backend.md#auth-and-management-api) for endpoints and session/role behavior. Without credentials, local health checks work and login returns 503.

Integration tests use mocked Twitch responses and real PostgreSQL/Redis. Set `TEST_DATABASE_URL` explicitly to a local test-capable connection (for example, the URL in `.env.example`). Its user needs `CREATEDB`; each run creates and drops a uniquely named database. CI runs these tests too.

### Twitch app and live capture

1. Enable two-factor authentication on your Twitch account, then [register an application](https://dev.twitch.tv/console/apps/create). Use the **Confidential** client type for this server-backed app. Register the exact redirect `${APP_ORIGIN}/api/auth/twitch/callback` (for default local setup: `http://localhost:3000/api/auth/twitch/callback`). Copy the client ID and generate a client secret in **Manage**. Put them in `.env` as `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.
2. Generate `AUTH_ENCRYPTION_KEY` with `openssl rand -base64 32` if it is not already set. Keep it stable; changing it makes existing stored tokens unreadable. Generate a **separate** `TWITCH_EVENTSUB_SECRET` with `openssl rand -hex 32`. Paste command outputs into `.env`, never chat or Git.
3. Expose your local frontend through a trusted HTTPS tunnel, or use your deployed HTTPS origin. Twitch requires a publicly reachable callback on port 443. Set `TWITCH_EVENTSUB_CALLBACK_URL=https://YOUR_PUBLIC_HOST/api/webhooks/twitch`. For live browser sign-in through that same host, set `APP_ORIGIN=https://YOUR_PUBLIC_HOST` and register its exact OAuth callback in Twitch too. Keep `API_INTERNAL_URL` pointed at the local API. If ports 3000/4000 are occupied, use matching frontend/API ports and settings; the public callback still uses HTTPS port 443. The tunnel must preserve request bodies and allow unauthenticated POSTs to the webhook route.
4. Run `pnpm db:migrate`, restart the applications, sign in **as the channel broadcaster**, and connect your own channel. In **Channel settings → Live capture → Manage live capture**, choose **Authorize chat capture on Twitch**. Lore requests `user:read:chat`, `user:bot`, and `channel:bot` for this account. The broadcaster is also the subscription's reading identity; no separate bot account or pasted access token is needed. Ordinary sign-in still requests no chat scopes. After OAuth returns, open settings again and choose **Start capture**.
5. Wait for all six event connections to become ready, then send a test chat message on that channel. The panel shows the last delivery and pending/failed counts without exposing chat. Test a message deletion and stop capture when finished. There is no historical chat import or AI/promise extraction in this milestone. Live OAuth, actual account permissions and delivery through your tunnel must be checked with your registered app; automated tests use a mocked Twitch provider.

Do not change the webhook secret while subscriptions using it are active: stop capture, allow reconciliation to remove the subscriptions, change the secret, restart, then start capture again. When a tunnel hostname changes, update both callback settings and Twitch's OAuth redirect. Twitch app tokens are obtained and renewed by the backend; you do not need to generate them yourself.

References: [app registration](https://dev.twitch.tv/docs/authentication/register-app/), [chat authorization](https://dev.twitch.tv/docs/chat/authenticating/), [webhook verification](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/), [subscription management](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/). Behavior and operational details live in [backend conventions](docs/backend.md#twitch-eventsub-ingestion).

If services fail, start Docker Desktop and check `pnpm db:logs`. Changing PostgreSQL initialization credentials does not change an existing database volume. `pnpm db:down` preserves data; adding `--volumes` to Compose shutdown deletes it.

See the [documentation index](docs/README.md) for coding conventions and the product specification.

## Contributing

Follow the [GitHub workflow](docs/github-workflow.md): create a branch, commit, push that branch, and open a pull request against the default branch.
