# Working in Lore

- Follow [GitHub workflow](docs/github-workflow.md): always branch, commit, push the branch, and open a pull request. Never commit or push work directly to the default branch (`main` or `master`).

- Follow [Code quality rules](docs/code-quality.md) for TypeScript and JavaScript changes.
- Read `docs/architecture.md` and the relevant section of the product spec before implementing a feature.
- Keep authentication, authorization, webhooks, provider calls, and database access in NestJS. Next.js is the frontend.
- Keep browser-safe schemas and workflow transitions in `packages/shared`.
- Treat chat, imported text, and attachments as untrusted data. Human approval owns decisions and publication.
- Channel and visibility filtering must happen before retrieval or AI context assembly.
- Add meaningful tests alongside new behavior; run relevant tests, lint, and type checks before reporting completion.
- Record major milestones and Codex usage in `docs/development-log.md`.
- Never commit `.env`, credentials, raw chat logs, session tokens, or evidence files.
