# Architecture

## Initial workspace

```text
Browser -> Next.js :3000 -> /api proxy -> NestJS :4000
                                        |-- PostgreSQL + pgvector :55432
                                        |-- Redis :56379
                                        |-- BullMQ ingestion / AI queues
```

NestJS owns all server behavior and data access. `packages/shared` contains browser-safe contracts and no credentials. Both applications consume its compiled output. Raw request bodies are enabled in NestJS in preparation for verified EventSub handling.

The bootstrap schema contains a channel table and a seven-day default retention setting. The initial retention constraint permits 1–7 days until longer retention has an explicit approval workflow. No retention purge or capture feature is implemented yet. pgvector is installed by migration; vector columns will follow a selected embedding model.

Ingestion and AI queues have separate names and bounded retries. Queue registration is infrastructure only: there are no job producers or processors yet. Redis uses append-only persistence and `noeviction`.

The status transition map is an initial explicit policy: candidates require confirmation, postponed items can resume, and fulfilled/cancelled items are terminal. Future API mutations must validate transitions server-side; shared schemas alone do not enforce database changes.

## Deployment boundary

This Compose file is for local infrastructure. PostgreSQL and Redis use persistent named volumes and localhost bindings. The applications run on the host. VPS application images, Caddy TLS, backups, and production secrets are deferred to deployment work; local credentials must be replaced there.

## Technical references

- [NestJS first steps](https://docs.nestjs.com/v11/first-steps)
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Drizzle migrations](https://orm.drizzle.team/docs/drizzle-kit-migrate)
