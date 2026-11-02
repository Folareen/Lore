# Lore

Every stream has a story. Lore remembers it.

A submission for the **Codex x TwitchCon Hackathon**.

pnpm monorepo for the Lore Twitch community memory product. Includes Twitch sign-in, channel/team management, EventSub ingestion, promises and briefs, Gemini candidate review, private moderation cases with R2 evidence and precedent retrieval, consistency reviews, handoffs, public community memory, !catchup replies and a revocable OBS overlay. A light/dark demo is available without Twitch login.

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

Open the landing page at http://localhost:3000. Open the seeded demo at http://localhost:3000/demo without a Twitch account. The demo automatically uses bundled sample data if the API or database seed is unavailable; old `/preview` links redirect to `/demo`. Real authenticated pages live under `/app`; sign-in is at `/login`. The API is at http://127.0.0.1:4000/api/health and is also available through http://localhost:3000/api/health. API health checks PostgreSQL and Redis and returns HTTP 503 if either is unavailable.

Try **Promises → New promise** without credentials at `/demo?view=streamer`, then open **Next-stream brief**. Demo changes stay in the browser and reset on refresh. Authenticated equivalents are `/app/streamer` and `/app/brief`; the overview also has quick capture. Save an explicit commitment, move it through its allowed statuses, and include a reason when fulfilling or cancelling it. The brief lists saved active promises and links to their sources; it does not call an AI provider. Twitch commands appear after refreshing the promises list once ingestion has processed them. If Twitch registration is blocked by 2FA, this preview and the mocked integration tests remain usable.

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
pnpm db:seed              # Idempotent seeded demo snapshot
```

Run `pnpm --filter @lore/api start` and `pnpm --filter @lore/web start` after building to run without watchers. `pnpm db:seed` validates and upserts the complete **Demo fixture** snapshot in its dedicated table. It does not create OAuth identities, sessions or live domain records.

Migrations enable pgvector and create auth, management, EventSub subscription, private source-event, and captured-chat tables. Other domain tables and vector dimensions follow their features.

## Configuration

The root [`.env.example`](.env.example) lists local settings. Copy it to `.env`; keep real credentials out of Git. The applications, migration tools, and Compose read this root file. Restart the applications after changing it. Provider and OAuth secrets belong only in the API; never expose them through `NEXT_PUBLIC_` variables.

For Twitch login, register `http://localhost:3000/api/auth/twitch/callback` and configure the three auth values in `.env` using `.env.example` as the reference. Generate the encryption key with `openssl rand -base64 32`. See [backend conventions](docs/backend.md#auth-and-management-api) for endpoints and session/role behavior. Without credentials, local health checks work and login returns 503.

Integration tests use mocked Twitch responses and real PostgreSQL/Redis. Set `TEST_DATABASE_URL` explicitly to a local test-capable connection (for example, the URL in `.env.example`). Its user needs `CREATEDB`; each run creates and drops a uniquely named database. CI runs these tests too.

### Twitch app and live capture

1. Enable two-factor authentication on your Twitch account, then [register an application](https://dev.twitch.tv/console/apps/create). Use the **Confidential** client type for this server-backed app. Register the exact redirect `${APP_ORIGIN}/api/auth/twitch/callback` (for default local setup: `http://localhost:3000/api/auth/twitch/callback`). Copy the client ID and generate a client secret in **Manage**. Put them in `.env` as `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.
2. Generate `AUTH_ENCRYPTION_KEY` with `openssl rand -base64 32` if it is not already set. Keep it stable; changing it makes existing stored tokens unreadable. Generate a **separate** `TWITCH_EVENTSUB_SECRET` with `openssl rand -hex 32`. Paste command outputs into `.env`, never chat or Git.
3. Expose your local frontend through a trusted HTTPS tunnel, or use your deployed HTTPS origin. Twitch requires a publicly reachable callback on port 443. Set `TWITCH_EVENTSUB_CALLBACK_URL=https://YOUR_PUBLIC_HOST/api/webhooks/twitch`. For live browser sign-in through that same host, set `APP_ORIGIN=https://YOUR_PUBLIC_HOST` and register its exact OAuth callback in Twitch too. Keep `API_INTERNAL_URL` pointed at the local API. If ports 3000/4000 are occupied, use matching frontend/API ports and settings; the public callback still uses HTTPS port 443. The tunnel must preserve request bodies and allow unauthenticated POSTs to the webhook route. For webhook-only tunneling, keep `APP_ORIGIN` and the registered OAuth redirect on localhost, and continue using that local browser address. With [OutRay](https://github.com/outray-tunnel/outray#quick-start), authenticate with `outray login` and expose your web port with `outray http 3100` (substitute `3000` for the repository default); append `/api/webhooks/twitch` to its generated HTTPS URL. Do not enable tunnel password protection on the webhook route.
4. Run `pnpm db:migrate`, restart the applications, sign in **as the channel broadcaster**, and connect your own channel. In **Channel settings → Twitch & capture → Live capture → Manage live capture**, choose **Authorize chat capture on Twitch**. Lore requests `user:read:chat`, `user:bot`, and `channel:bot` for this account. The broadcaster is also the subscription's reading identity; no separate bot account or pasted access token is needed. Ordinary sign-in still requests no chat scopes. After OAuth returns, open settings again and choose **Start capture**.
5. Wait for all six event connections to become ready, then send a test chat message on that channel. The panel shows the last delivery and pending/failed counts without exposing chat. Test a message deletion and stop capture when finished. There is no historical chat import. Explicit `!promise` commands capture promises; optional Gemini extraction creates unconfirmed candidates. Live OAuth, actual account permissions and delivery through your tunnel must be checked with your registered app; automated tests use a mocked Twitch provider.

Do not change the webhook secret while subscriptions using it are active: stop capture, allow reconciliation to remove the subscriptions, change the secret, restart, then start capture again. When a tunnel hostname changes, update both callback settings and Twitch's OAuth redirect. Twitch app tokens are obtained and renewed by the backend; you do not need to generate them yourself.

Choosing **Moderator** in Teams grants the role in Lore and Twitch. If the owner has not yet granted `channel:manage:moderators`, saving the role opens Twitch’s consent screen and resumes that exact change on return; no separate authorization setup is needed. Promotion must succeed on Twitch before Lore saves the role. Existing Lore moderators can use **Enable on Twitch** to sync. Team member grants Lore access only. Demoting a Lore Moderator to Team member removes their Twitch moderator role; removing a Moderator revokes both Twitch moderation and Lore access. Twitch must accept the change before Lore saves it. No additional environment variables are needed.

References: [app registration](https://dev.twitch.tv/docs/authentication/register-app/), [chat authorization](https://dev.twitch.tv/docs/chat/authenticating/), [webhook verification](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/), [subscription management](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/). Behavior and operational details live in [backend conventions](docs/backend.md#twitch-eventsub-ingestion).

If services fail, start Docker Desktop and check `pnpm db:logs`. Changing PostgreSQL initialization credentials does not change an existing database volume. `pnpm db:down` preserves data; adding `--volumes` to Compose shutdown deletes it.

See the [documentation index](docs/README.md) for coding conventions and the product specification.

## Gemini candidate review

1. Create a key in [Google AI Studio](https://aistudio.google.com/api-keys) using a project on the **Free tier**; leave billing disabled to stay on that tier. Set `GEMINI_API_KEY` in the root `.env`, then restart the API. Keep it server-only and outside Git. `GEMINI_MODEL` defaults to `gemini-3.8-flash`; choose a structured-output model available to your project. The same key powers extraction, precedent embeddings and reviewable case recommendations; no OpenAI key is needed. Google currently lists free-tier access for `gemini-3.8-flash` and `gemini-embedding-2`, subject to project-specific quotas. Check your project’s tier and limits in AI Studio; `.env` cannot enforce free billing. See [Gemini key setup](https://ai.google.dev/gemini-api/docs/api-key), [pricing](https://ai.google.dev/gemini-api/docs/pricing) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
   Run `pnpm ai:check` for one small synthetic provider request with evidence validation; it needs no Twitch account and prints no key or chat. This uses your Gemini quota.
2. Open **Needs review** (`/app/candidates`). The channel owner explicitly enables sending that channel’s retained captured chat to Gemini. This includes existing retained chat. Capture itself still needs Twitch setup above; no Twitch credentials are needed for the fixture preview.
3. Enabled extraction checks for new chat every 15 seconds, batches up to 20 messages, and creates at most one automatic run per minute per channel. **Analyze new chat** queues an immediate run. Background extraction allows up to two minutes per provider attempt; the review screen stays usable while it processes. The per-channel `AI_DAILY_CALL_LIMIT` defaults to 50 provider attempts per UTC day, including retries.
4. Read the source, evidence gaps and uncertainties. **Review as promise** lets a team member edit wording before explicitly confirming; **Dismiss suggestion** requires a reason. Only confirmed promises enter the next-stream brief. Pending drafts expire with raw chat; confirmation separately keeps the original message as team-only evidence.

Try the credential-free flow at `/demo?view=candidates`, confirm a sample suggestion, then open the brief. Fixtures never call Gemini. Missing keys, invalid output, exhausted retries and daily limits appear in the real review screen. Live extraction requires your locally configured key and provider quota; automated tests use a mock provider. Disabling extraction prevents further queued calls and discards in-flight results; an already-sent request cannot be recalled. Disconnecting a channel also turns extraction off.

## Contributing

Follow the [GitHub workflow](docs/github-workflow.md): create a branch, commit, push that branch, and open a pull request against the default branch.

## Private cases, evidence and precedents

Owners and approved moderators use **Moderation cases** (`/app/moderation`) to record incidents, appeals, the rule/version in effect, evidence and a final human decision. General team grants cannot read these private records. Try the fixture flow at `/demo?view=moderation`; fixtures never use provider keys or upload real files.

For Cloudflare R2, create a **private bucket** (leave public access off). In **R2 → Manage R2 API Tokens**, create an **Object Read & Write** token limited to that bucket. Put its generated access key ID and secret access key, your account ID and bucket name in the root `.env` as `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` and `R2_BUCKET`. Use the S3 credentials, not the Cloudflare dashboard API-token value. Restart the API. Lore derives the standard account R2 S3 endpoint and region `auto`; uploads pass through the API, so browser upload CORS is unnecessary. Downloads use authorized 60-second, attachment-only signed links. PNG, JPEG, PDF and UTF-8 text files up to 5 MB are supported; file contents are not analyzed by AI. See [R2 credentials](https://developers.cloudflare.com/r2/api/tokens/) and [the S3 SDK setup](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

Configure `GEMINI_API_KEY` for both precedent retrieval and reviewable case recommendations; `GEMINI_MODEL` selects the generation model used for extraction and recommendations. The owner separately enables **private case AI** in a case file; chat-extraction consent does not enable it. This sends case text and retained text excerpts to Google Gemini, not uploaded file contents. On Google’s free tier, inputs and outputs may be used to improve its products; use synthetic or non-sensitive data for free-tier testing. Gemini Embedding 2 uses a fixed 768-dimensional database vector; changing that embedding model requires a migration/reindex. Requests share the channel’s daily AI call cap with chat extraction. Missing keys leave manual cases, evidence and human decisions usable.

**Find potential precedents** indexes up to 20 prior decisions per explicit request and ranks eligible same-channel cases before Gemini generates a recommendation. The UI reports partial indexing and failures; run retrieval again to process another batch or retry. Similarity is a retrieval signal, not a consistency verdict. Review sources, rule versions, gaps and uncertainties, then accept, modify or reject the suggestion and explicitly save your own decision. No Twitch moderation action is performed. Final decisions are read-only; create a new case for a later review.

Run `pnpm cases:check` to check configured providers without Twitch login: one synthetic Gemini embedding, one synthetic Gemini recommendation, and one tiny R2 object that is deleted afterward. Missing credentials are reported as skipped. Model checks use provider quota outside channel counters; no real case/chat data or credentials are printed.

The **Shift desk** inside Moderation covers moderator handoffs, consistency reviews, agreed repair/re-entry actions and documented rule changes. Open `/demo?view=workflows` for the fixture-only flow, or open a case to raise a concern or agree an action after its human decision. These workflows need no additional credentials or AI consent. Handoffs are source-linked snapshots; consistency comparisons identify different documented outcomes for human review. All records remain private to owners and approved moderators.

Public stories lives at `/app/publications` (fixture workflow: `/demo?view=publications`; visitor preview: `/demo?view=community`). Team members prepare drafts; owners/moderators explicitly review the exact wording before publication. Public pages are `/c/[channel-slug]`, `/c/[channel-slug]/catch-up` and individual entry links. The channel slug appears in your **Open public page** link. Published summaries can cite other published entries. Editing or withdrawing a source withdraws dependent summaries for fresh review; deleting an entry clears its text. A channel must be connected and have published entries to expose a public page. Disconnecting hides the pages; reconnecting restores still-published entries. Withdraw or delete entries to revoke their publication. No new model or storage keys are needed.

For live `!catchup`, use the same registered Twitch application and OAuth redirect as sign-in. In **Public stories → Twitch replies → !catchup in Twitch chat**, choose **Authorize chat replies with Twitch** (`/api/auth/twitch/chat`). This separately requests `user:write:chat` alongside `user:read:chat user:bot channel:bot`; ordinary sign-in stays scope-free. Start live capture in Channel settings, then explicitly enable replies as the owner. Lore sends as the connected broadcaster with an app access token and `for_source_only:true`, so Shared Chat does not cross-post. Set `APP_ORIGIN` to your externally reachable site origin for usable public links (HTTPS in production). No separate bot credential is required for this broadcaster-as-sender setup. References: [Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message), [chat authorization](https://dev.twitch.tv/docs/chat/authenticating/).

The command uses the latest published summary’s reviewed short wording; without one, it returns a neutral message. It has a 60-second channel cooldown and a 90-second command lifetime. Stop capture, disable replies or disconnect to stop queued work. Delivery status appears in the publishing screen. Ambiguous sends are not automatically retried, since Twitch provides no send idempotency key; a crash can lose a reply, and an already sent message cannot be withdrawn by unpublishing. Development checks use mocked Twitch delivery; a live permission/tunnel check remains necessary when your Twitch app is ready.

OBS setup lives at `/app/overlay` (credential-free fixture: `/demo?view=overlay`). Owners/moderators select one published recap or up to three published commitment titles and approve the on-screen preview. Recaps use the reviewed short chat wording. Private promises/cases are never sent to OBS; publish an appropriate public commitment first. The selection is manual, so withdraw completed commitments in Public stories when they should leave the overlay. Approval checks the publication versions shown in the preview. Editing, withdrawing or deleting a selected story (or its recap sources) removes it from the overlay selection; republishing does not add it back. Reload, select it and approve again to restore it.

As the owner, create a browser-source link and copy it immediately; Lore cannot show it again. In OBS, add **Browser Source**, paste the entire URL including `#token=…`, use **720 × 720** as a starting viewport, and enable **Refresh browser source when scene becomes active**. The page background is transparent; resize/place the source in your scene. [OBS browser-source properties](https://obsproject.com/kb/browser-source) explain viewport and refresh options. The existing `!catchup` authorization/settings remain in Public stories; the overlay needs no new provider credentials or Twitch scopes.

Overlay links grant access only to selected, currently published display text. Tokens are stored only as hashes and travel in an authorization header; the URL fragment stays out of server requests. Treat the full URL as a credential, keep it out of screenshots/logs, and use HTTPS outside localhost. Regeneration/revocation rejects the old token immediately at the API; update the URL in OBS after regeneration. Disconnect and Twitch authorization revocation also revoke the link. The browser checks every five seconds, clears on failure and expires received text after 6.5 seconds without a successful refresh. Already captured footage cannot be recalled. Reconnecting requires a new link and fresh overlay approval.

## Seeded demo mode

Open `/demo` to try Lore. Run `pnpm db:migrate && pnpm db:seed` to load its snapshot from the backend; without it, the same demo uses bundled sample data. Landing and login pages link to it. No Twitch account, Gemini key or R2 bucket is needed. The same route works on a hosted app with either the backend seed or bundled sample data. `/api/demo` serves only the curated `lore-demo` snapshot, with no sign-in or cookie creation.

The guide links Streamer Home, Moderator Desk and Community Lore for an approximately three-minute walkthrough. Start with the island-tour promise or the labeled `!promise`/`!catchup` chat simulator; review a candidate and see confirmed work in the brief. Compare the spoiler appeal with an earlier decision, inspect the seeded consistency concern, repair action and handoff, then open the approved public recap and OBS selection. Public visitor views exclude the synthetic private moderation fields. AI recommendations, chat and overlay credentials are labeled simulations; demo mutations never call Twitch, AI providers or R2. The media examples include a bundled illustration and a clearly labeled external Twitch sample, loaded only when a visitor chooses to watch.

All interactions stay in memory for the current tab while navigating `/demo`. **Reset demo** restores every feature from that tab’s initial seed snapshot; refresh fetches the current server seed, falling back to bundled sample data if needed. Other visitors and the stored seed are unaffected. Rerun `pnpm db:seed` after changing the curated fixtures. Missing/invalid seed data, API failures and timeouts automatically use the bundled synthetic snapshot in `/demo`. The anonymous snapshot intentionally contains synthetic moderator examples; never replace it with production exports or real chat/evidence.

## Retention and hardening checks

Channel owners can inspect **Channel settings → Ordinary chat cleanup**, refresh its status or purge expired chat immediately. Shortening retention applies in the same transaction and permanently caps existing deadlines; later increases apply to new chat and cannot restore expired data. Automatic cleanup runs every minute, serializes with channel ingestion/review, scrubs expired AI wording, and preserves confirmed promise/case evidence. Delivery receipts last 30 days; expired OAuth state/session hashes are removed even without another login. A status older than two minutes is flagged in settings. Demo mode simulates this surface without storing live chat.

Pages use a fresh script nonce, a Content Security Policy, uncached rendering, frame restrictions and a no-referrer policy. Inline styles remain allowed for theme/avatars; production script evaluation does not. Keep HTTPS termination in front of the application; HSTS is sent for a configured HTTPS origin. Keep PostgreSQL/Redis private and monitor the existing `/api/health` dependency check externally. Docker already restarts those local services; application deployment, reverse-proxy configuration, process restart/uptime monitoring and backup/restore verification remain deployment work. Retained evidence has a separate lifecycle; an ordinary chat purge does not erase human-approved proof. Validate live retention/public-sharing and data-request handling against the [Twitch Developer Services Agreement](https://legal.twitch.com/en/legal/developer-agreement/) before a production launch.

Real-browser tests run against an isolated API/database/queue namespace and a production frontend build on ports **4321/4322**. Twitch authorization uses a loopback mock; AI/R2 use local mocks by default. No test session or authentication bypass is installed in application code. Install the browser once and run:

```sh
pnpm exec playwright install chromium
TEST_DATABASE_URL=postgresql://lore:lore_local@127.0.0.1:55432/lore pnpm test:e2e
```

On Linux CI, use `pnpm exec playwright install --with-deps chromium`. If the bundled browser does not support your OS, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chrome executable. The suite builds into ignored `.next-e2e`, keeps the existing development server separate, and cleans its temporary database/queues on shutdown. Traces/screenshots contain synthetic test data and stay in ignored `test-results`; CI retains failed-run artifacts for three days. CI runs format, lint, production dependency audit, types, unit/UI tests, API integration tests, build and browser journeys. Live Twitch permissions/EventSub delivery, real R2 access and live OBS capture still require their configured accounts.

## Additional channel capabilities

In **Channel settings → Features → Optional features**, each owner-controlled opt-in starts off. Microphone and recap permissions can also be enabled beside those tools in Suggestions and Public stories:

- **Moderation event imports:** start live capture, then authorize `channel:moderate` and `moderator:read:unban_requests` using the separate Twitch link. Enable imports; subscription reconciliation runs within 30 seconds. Future bans/timeouts and unban requests create private cases. Review the event evidence and supply a rule snapshot before deciding. Recording a case decision does not execute bans/timeouts or resolve appeals on Twitch. See [Twitch subscriptions](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelunban_requestresolve).
- **Promise confirmations:** authorize chat replies in Public stories and start capture before enabling. Accepted authorized `!promise` commands receive fixed wording, with a 15-second channel cooldown and 90-second expiry.
- **Public summary AI:** use the existing `GEMINI_API_KEY`; choose published sources in **Public stories → Create a recap**, generate, edit and save a draft, then explicitly approve publication. Private cases and raw chat are never inputs to this public workflow.
- **Microphone suggestions:** use the same Gemini key. Open Suggestions → Microphone follow-ups on HTTPS or localhost, explicitly record up to 30 seconds, preview locally and submit. Lore stores transcripts, not audio. Verify transcription before confirming a suggestion. Unconfirmed transcripts follow current chat retention; opt-out scrubs them. Confirmed promises retain separate source evidence. Google may use free-tier inputs/outputs to improve products; choose appropriate content.

Extraction, microphone and recap calls share `AI_DAILY_CALL_LIMIT`; this does not override Google's free-tier quotas. Live workspace SSE uses the existing session and streams only invalidations; reverse proxies must preserve streaming and avoid buffering `/api/channels/:id/stream`.

### Story clips and screenshots

Each public story can include one manually pasted Twitch clip link and one uploaded screenshot. Add the clip while writing the draft; save the draft, open it and use **Attach a screenshot** to upload a PNG, JPEG or WebP (up to 5 MB and 16 megapixels) with a short description. Screenshot changes return the story to draft; publication review includes the image and clip link. Existing R2 configuration is reused with a separate `community-images/` prefix. Apply migration 0014 before starting the updated API.

Screenshots are decoded, resized to at most 2400 × 2400 and converted to WebP without metadata. Private R2 objects are served through uncached Lore endpoints that check current publication/access before and after storage reads. Replaced/deleted/abandoned uploads are cleaned up automatically. Keep the R2 bucket private; no public bucket URL or signed image URL is returned. The chatbot, recap generator, chat replies and OBS continue to use approved text only.

Clip video remains on Twitch. Full stories load the Twitch player only after a viewer chooses **Load Twitch clip**, with autoplay disabled and the current hostname supplied as Twitch’s `parent` parameter. Narrow screens use **Open on Twitch** to respect the player’s minimum size. If playback or an image fails, the written story remains usable. Demo screenshot uploads stay in browser memory and never call R2. No Twitch clip import/browsing, video hosting or automatic screenshot capture is included. [Twitch clip embed requirements](https://dev.twitch.tv/docs/embed/video-and-clips/).

### Public community Q&A

**Community Q&A assistant** is enabled by default; owners can turn it off in Channel settings → Features. It uses only published stories from that channel; publishing a viewer-safe introduction and inside references helps it answer newcomers. Visitors need no login. AI answers link to public sources and are not approved announcements. Questions go to Google Gemini; do not enter personal information. Conversations stay in page memory and clear on navigation; questions are not stored by Lore.

`GEMINI_COMMUNITY_MODEL` defaults to `gemini-3.5-flash-lite`, separately from the generation model used for team workflows. Each request sends up to six 1,600-character public excerpts and two preceding questions, with a 700-token output cap and minimal thinking. Duplicate questions reuse a 15-minute cache bound to the current source snapshot. Public Q&A has separate Redis budgets: 12 new calls/minute/channel, `COMMUNITY_AI_DAILY_LIMIT` (default 100)/UTC day/channel and `COMMUNITY_AI_GLOBAL_DAILY_LIMIT` (default 500)/UTC day/instance. Failures consume reservations. Redis outages fail closed. These application limits do not change Google billing or quota. Model availability and pricing: [Google’s Flash-Lite documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).

The community assistant default migration enables existing channels without a recorded owner choice; explicit owner opt-outs remain disabled. Gemini configuration is still required.

### Discover communities

`/discover` is a public directory of connected channels with published Lore stories. Search by channel name or slug (an optional leading `@` is accepted), browse pages of communities, then open a channel’s stories or catch-up. Cards show a preview of the latest approved public story and a published-story count. Draft-only, disconnected and demo fixture channels are excluded. This searches communities already sharing on Lore; it does not search all Twitch channels or make Twitch/Gemini calls. No extra configuration or migration is required.

To opt into real R2 and Twitch playback validation, configure the existing R2 variables in the root `.env`, build the E2E app with `pnpm test:e2e` once, then run `LORE_LIVE_MEDIA_TEST=1 TEST_DATABASE_URL=postgresql://lore:lore_local@127.0.0.1:55432/lore REDIS_URL=redis://127.0.0.1:56379 pnpm exec playwright test -g "story clips and screenshots"`. The journey uses an isolated database, uploads the original demo illustration to the configured private bucket, reviews/publishes it, verifies live Twitch video frames, checks mobile links and withdrawal, and deletes its test objects on shutdown. No real channel is modified. This opt-in check requires internet access and Twitch playback availability.
