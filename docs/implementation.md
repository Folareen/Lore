# Implementation backlog

The setup includes workspaces, shared open-loop schemas, a NestJS dependency health endpoint, frontend placeholder, queue registration, Drizzle migration and seed, and local infrastructure.

Next work follows the product specification:

1. Twitch OAuth, encrypted refresh tokens, sessions, channel memberships, guards, and channel-scoped repositories. Add authorization and isolation tests with those features.
2. Verify EventSub signatures, timestamps, challenges, deduplication, durable ingestion and queue recovery. Add webhook tests alongside implementation.
3. Authorized `!promise`, dashboard capture, candidate review, evidence excerpts and streamer briefs.
4. Cases, rule versions, evidence storage, pgvector retrieval and human decisions.
5. Consistency review, handoffs, repair actions and approved public content.
6. Revocable overlay tokens, approved `!catchup`, hosted demo fixtures and live integration tests.
7. Retention jobs, VPS/Caddy deployment, backups, observability and end-to-end security validation.

The initial transition tests cover only shared open-loop policy. Webhook, authorization, and case transition tests must accompany their implementations. Select the Gemini embedding model before adding vector columns. Verify Twitch permissions and platform policies before enabling live capture or publication.
