# Development record

## 2026-10-26 — Initial setup

User milestone request: “Let's setup this project; lets use monorepo; we also need docs folder; we also need docker for db and redis locally.”

Reference: supplied Lore product PRD and technical specification v1.1.

Codex created the pnpm workspace, NestJS and Next.js foundations, shared schemas and transition tests, local pgvector/Redis Compose services, Drizzle tooling, documentation, and CI checks. Work used one coding thread; no parallel agents were used. External integrations and deployment remain future milestones.

Validation completed: production build, formatting check, ESLint, workspace type checks, and four shared workflow tests passed. Local HTTP requests verified the frontend, direct API health, and the frontend API proxy. Docker reports both services healthy; SQL verified pgvector installation and the labeled demo seed, and Redis reported `noeviction`. Development servers and local infrastructure were left running.

## 2026-10-26 — Code quality guidance

User requested relevant clean-code rules from pipethedev’s TypeScript Anti-Slop gist. Added an attributed, condensed adaptation in `docs/code-quality.md`, with Lore-specific guidance for Zod, BullMQ boundaries, Drizzle types, NestJS, and access control. Linked it from the documentation index and root `AGENTS.md`. This milestone changes documentation only.

## 2026-10-26 — GitHub submission setup

Added Codex x TwitchCon Hackathon submission wording to the README and documented the branch, commit, push, and pull request workflow in `docs/github-workflow.md` and `AGENTS.md`. Prepared the initial project branch from the existing remote `master` history, retaining its MIT license.

## 2026-10-26 — Conventional naming

Standardized branch names as `<type>/<description>` and commit/PR titles using Conventional Commit prefixes. Renamed the setup branch to `chore/setup-lore-monorepo`; its original setup commit already uses `chore:`.
