# Lore

**The stream ends. The lore doesn’t.**

Shared memory for Twitch communities: follow through on promises, preserve moderation context and help viewers feel at home.

Built with **OpenAI Codex** for the [Codex x TwitchCon Hackathon](https://twitchcon-codex.devpost.com/).

**Live demo:** [lore.afolarin.cv](https://lore.afolarin.cv)

**Demo video:** [Watch on YouTube](https://youtu.be/R3vjTGb_Po0)

**Codex session ID:** `01a17990-4ecf-7950-bda5-a7c6c1a0d130`

## Why Lore

A streamer promises something in chat. A moderator makes a difficult call. A new viewer asks why everyone keeps mentioning the garden. By the next stream, the context is scattered or gone.

Lore carries that context forward. Streamers get a next-stream brief, moderators get source-linked cases and handoffs, and viewers get a welcoming public community page. Private team work and approved public stories have separate access boundaries.

## What you can do

| For                 | What Lore provides                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streamers & teams   | Capture `!promise` from authorized Twitch chat or add a promise manually; track progress, review optional chat/microphone suggestions and prepare a next-stream brief.                |
| Moderators          | Review incidents and appeals against saved rules and evidence, compare earlier channel decisions, document human decisions and carry repair actions and handoffs into the next shift. |
| Viewers & newcomers | Discover communities sharing on Lore, catch up without an account, learn inside references and ask a source-linked community guide about published stories.                           |
| The live stream     | Share an approved recap with `!catchup` or a revocable OBS Browser Source. Attach a Twitch clip and screenshot to a reviewed public story.                                            |

### The Twitch connection

Lore uses Twitch OAuth and verified EventSub deliveries for live chat, message deletion, stream boundaries and optional moderation-event imports. Broadcasters and moderators can save explicit commitments with `!promise`; separately authorized chat replies share the latest approved `!catchup` copy. The OBS overlay displays only an approved public selection.

A Lore case decision does **not** ban, unban or change a timeout on Twitch. AI suggestions require human confirmation. The public Q&A guide can access approved public story text, never private cases or captured chat.

## A three-minute tour

Open **Demo guide** and choose a streamer, moderator or viewer path. No Twitch account or provider key is needed for the sample workspace.

1. **Remember a promise.** Simulate an authorized `!promise`, open the next-stream brief, then review a suggestion’s source before confirming it.
2. **Review a decision.** Inspect the spoiler appeal, compare the earlier rule version and save a human rationale. Explore the populated repair actions, consistency review and next-shift handoff.
3. **Welcome a viewer.** Publish the pond-naming draft, visit the community page, ask what the channel streams and follow the answer’s story link. Inspect the media attachment and approved overlay preview.

The demo uses synthetic, labeled records. Edits persist while navigating the demo, reset on refresh and never change a real channel. Chat, AI and OBS credentials are simulations. The optional sample clip uses real Twitch playback; demo screenshots stay in browser memory. The live integration flow requires the owner’s Twitch setup and feature permissions.

## Built with Codex

Codex helped turn the product brief into the monorepo, shared workflow contracts, NestJS API and Next.js interface. It was used to implement Twitch ingestion, review and publication boundaries, create synthetic demo fixtures, write integration/browser tests, and iterate on mobile layouts and bugs found during manual testing.

The repository’s [AGENTS.md](AGENTS.md), shared [code-quality rules](docs/code-quality.md), feature commits and pull requests record the development workflow. Product scope, design feedback, configuration and final review remained human-directed.

**Codex is the development tool; Gemini powers the optional in-app AI.** Running Lore does not require an OpenAI API key.

## Run locally

Requires Node 22, pnpm 10.32.1 and Docker Compose v2.

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

The synthetic demo works without Twitch, Gemini or R2 credentials and falls back to bundled fixtures if its backend snapshot is unavailable. See [setup and integrations](docs/setup.md) for ports, Twitch registration, capture/replies, Gemini, private R2 storage and OBS setup. Keep credentials server-side and out of Git.

## Architecture and verification

- **Frontend:** Next.js App Router, React, Tailwind CSS and shared accessible UI components.
- **Backend:** NestJS, Drizzle/PostgreSQL with pgvector, Redis and BullMQ.
- **Contracts:** shared Zod validation, role boundaries and explicit human-reviewed workflow transitions.
- **Integrations:** Twitch OAuth/EventSub/chat, Gemini generation/embeddings and Cloudflare R2.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Database-backed integration tests and production-browser journeys use isolated databases and mocked providers by default. The [testing instructions](docs/setup.md#retention-and-hardening-checks) include opt-in live-provider checks. Live R2 image publication and Twitch clip playback have also been exercised end to end; a browser test is not a claim of native OBS capture or every account’s Twitch permissions.

## Scope and documentation

This hackathon build is designed around connected channels already publishing on Lore. Discover does not search all of Twitch. Clips stay on Twitch and are added by URL; screenshots are uploaded manually. There is no automatic clip import, hosted video pipeline or autonomous moderation. Provider-backed features need configuration and remain subject to provider quotas and availability.

- **User guides:** the app’s Help & guides pages cover streamers, moderators and viewers.
- **Developer documentation:** [setup](docs/setup.md), [frontend](docs/frontend.md), [backend](docs/backend.md), [design system](docs/design-system.md) and [product specification](docs/product/LORE_Product_PRD_Technical_Spec_v1.1.md).
- **Submission reference:** the [official requirements](https://twitchcon-codex.devpost.com/#requirements) call for a runnable repository, a project description, the main Codex session ID and a public YouTube demo of at most three minutes showing the working Twitch integration and how Codex was used.
