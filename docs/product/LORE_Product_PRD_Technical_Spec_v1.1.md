## Change log from 1.0

- Replaced the application stack with a pnpm monorepo, NestJS API, Next.js frontend, PostgreSQL with pgvector, Redis with BullMQ, and Docker Compose on a VPS.
- Added an AI provider interface, worker queues, verified webhook handling, live updates, S3 evidence storage, and Twitch OAuth sessions.
- Made authorized !promise commands and dashboard capture the primary confirmed promise paths. Kept ordinary chat AI detection as candidate only.
- Added !catchup, a revocable OBS overlay, per channel chat retention, and evidence preservation.
- Added hosted demo mode, submission and availability requirements, Codex usage records, and early automated testing.
- Updated routes, data model, security, delivery order, and locked decisions.

# LORE
## Product Overview, PRD and Technical Specification

Version: 1.1
Date: October 26, 2026
Status: Product scope and technical choices confirmed
Project: TwitchCon × OpenAI Codex Hackathon 2026

## 1. Product overview

**Tagline:** Every stream has a story. Lore remembers it.

**One-liner:** Lore is shared memory for Twitch communities. It tracks promises, preserves moderation decisions, and catches viewers up so important context never disappears between streams.

**What it solves:** Twitch communities build history in fast-moving chat, but that history is scattered or forgotten when a stream ends, a moderator changes shifts, or a new viewer arrives.

**What it does:** Lore captures permitted live activity and human-approved information, preserves the evidence and decisions that matter, and turns them into useful context for streamers, moderators and viewers.

**Product promise:** Know what happened, what was decided, what was promised, and what still needs attention.

**Audience:** Twitch streamers, authorized moderators and community viewers.

**Positioning:** A community continuity product, not a generic AI moderation bot, note-taking app or chat archive.

**Naming note:** Lore is the working product name. Brand and trademark clearance is still required.

## 2. Goals and boundaries

### Goals

- Carry important context across streams and moderator shifts.
- Help streamers follow through on confirmed commitments.
- Help moderators review cases with rules, evidence and relevant precedent.
- Give viewers an accessible explanation of approved community history.
- Make AI suggestions reviewable and evidence-linked.
- Use one underlying memory system for all three audiences.

### Product rules

- Humans make final moderation decisions.
- AI suggestions are not facts until verified.
- Private moderation information is never automatically published.
- Important conclusions reference available evidence and disclose gaps.
- Each Twitch community owns and controls its records.
- No permanent character scores, public offender labels or automatic intent judgments.
- Missing Twitch data must never be fabricated.

### Explicit exclusions

Raid Relay, Community Questline, generic toxicity detection, autonomous banning or unbanning, cross-channel reputation tracking and public moderator grading are not part of Lore.

Channel owners explicitly manage their team. Assigning Moderator grants that role in Lore and Twitch after the owner authorizes Twitch moderator management; a failed Twitch promotion must not save a new Lore moderator grant. Existing Lore moderators can be synced explicitly. Team-member access remains Lore-only, and demotion/removal inside Lore does not revoke Twitch roles. This owner-directed role management does not perform case decisions or autonomous moderation.

## 3. Users and product surfaces

| Surface | Primary user | Core question |
| --- | --- | --- |
| Streamer Home | Channel owner and approved team | What do I need to remember or follow up on? |
| Moderator Desk | Authorized channel moderators | What needs review, a decision or a handoff? |
| Community Lore | Viewers and newcomers | What did I miss, and why does it matter? |

The three surfaces share approved underlying records, not unrestricted access to the same database views.

## 4. Functional requirements

### A. Appeals and precedent

**Problem:** Appeals lose context, making consistent, explainable decisions difficult.

- A1. Create a case from an authorized Twitch event, permitted API record or manual entry.
- A2. Attach appeal text, incident details, channel rule, available evidence and relevant timestamps.
- A3. Retrieve potentially comparable past decisions from the same channel.
- A4. Show similarities, differences, missing evidence and a draft recommendation.
- A5. Require an authorized human to approve, change or reject the recommendation.
- A6. Save the final decision, rationale, actor, time and any required follow-up.
- A7. Label manual imports and demo fixtures accurately.

**Result:** A traceable case file and human-owned decision.

### B. Moderation consistency review

**Problem:** Similar incidents may receive different treatment without an easy way to understand why.

- B1. Compare documented cases against the relevant rule version and prior decisions.
- B2. Flag potential inconsistency or missing rationale for review.
- B3. Explain differences in severity, context and evidence.
- B4. Let a moderator confirm, dismiss or annotate a flag.
- B5. Record the review outcome without automatically changing a case decision.

**Result:** An evidence-based review queue, not automated accusations.

### C. Open Loops and promise tracking

**Problem:** Streamer promises, viewer questions and unfinished discussions vanish into chat.

- C1. Primary capture: a !promise command typed in Twitch chat. Accept it only when the chat event badge data identifies the sender as the broadcaster or a moderator. Validate the event and channel before accepting the command. Save an accepted command as a confirmed open loop immediately because it is an explicit human action.
- C2. Backup capture: a quick entry field in Streamer Home creates a confirmed open loop for an authorized streamer or team member.
- C3. AI extraction from ordinary captured chat may identify candidate commitments, unanswered questions and pending announcements. These remain candidates until a human confirms them.
- C4. Display the source wording and store the source reference, owner and due context when known.
- C5. Track statuses: candidate, confirmed, in progress, fulfilled, postponed and cancelled. Enforce allowed transitions through shared schemas and server logic.
- C6. Surface relevant items in live and prestream views.
- C7. Save completion or cancellation with a reason or evidence.
- C8. Allow approved outcomes to appear in Community Lore.
- C9. Optional setting, disabled by default: send a short confirmation message to Twitch chat. Enable only after verifying the required send chat permission and account authorization.
- C10. Optional stretch feature: dashboard listen mode using microphone transcription. Transcribed speech creates candidates only and never confirms a promise automatically. Listen mode is not required for the core demo.

**Result:** A reliable follow-through record rather than a list of AI guesses.

### D. Shift handoffs and live context

**Problem:** Each stream or moderator shift starts with missing context.

- D1. Generate moderator handoffs with unresolved cases, recent decisions, rule changes and pending actions.
- D2. Generate streamer briefs with promises, open questions and community developments.
- D3. Highlight changes since the previous shift or stream.
- D4. Link material statements to source records.
- D5. Allow acknowledgment, assignment and resolution of handoff tasks.

**Result:** A concise brief that tells each person what to do next.

### E. Community repair and re-entry

**Problem:** A resolved conflict can still leave commitments unfulfilled and expectations unclear.

- E1. Record human-agreed resolutions and re-entry conditions where applicable.
- E2. Assign follow-up actions to authorized team members.
- E3. Track progress, completion and outstanding obligations.
- E4. Connect the action history to the relevant case.
- E5. Keep sensitive information private unless explicitly approved for publication.

**Result:** Resolutions are followed through, not simply marked closed.

### F. Newcomer Compass and public community memory

**Problem:** New viewers do not know the history, references or ongoing stories behind a stream.

- F1. Offer a mobile-friendly "What did I miss?" feed.
- F2. Explain approved community milestones, recurring references and ongoing stories in plain language.
- F3. Include approved commitment updates and outcomes.
- F4. Require human approval before a record becomes public.
- F5. Allow editing, unpublishing and deleting public entries.
- F6. Never expose private cases, appeals, internal notes or repair plans through public search or AI answers.

**Result:** New viewers can join the story without accessing private team information.

### G. Twitch native surfaces

- G1. Support a !catchup chat command that returns the latest approved public community summary. If there is no approved summary, return a short, neutral response.
- G2. Sending a !catchup reply requires the appropriate Twitch chat sending permission. Verify the exact scope and account requirements before enabling the command.
- G3. Provide an OBS browser source overlay with a transparent background. At stream start, it can show open loops or a short "previously on" recap.
- G4. Protect the overlay with a cryptographically unguessable token. Store only a hash of the token, allow the channel to revoke and regenerate it, and reject old tokens immediately.
- G5. Show only channel-approved overlay content. Do not expose private moderation evidence or full case records through the overlay.

## 5. Core workflows

### Streamer workflow

1. Sign in with Twitch and connect an authorized channel.
2. Lore receives permitted live events through the verified webhook.
3. The broadcaster or a moderator types !promise followed by a commitment. Lore checks the chat event badge data and saves an authorized command as confirmed.
4. The streamer can also create a confirmed commitment using the dashboard quick capture field.
5. AI suggestions from ordinary chat remain candidates until a human confirms them.
6. Lore creates the next-stream brief with confirmed commitments and unresolved questions.
7. The streamer fulfills, postpones or cancels each item.
8. Selected updates are reviewed and published for viewers.
9. Optional chat confirmations and microphone listen mode remain disabled unless separately enabled and authorized.

### Moderator workflow

1. Open a case or an unresolved handoff item.
2. Review available incident evidence, rules and related cases.
3. Examine the AI suggestion and any consistency flag.
4. Make and record the human decision.
5. Create a repair or follow-up action where appropriate.
6. Carry unresolved work into the next moderator handoff.

### Viewer workflow

1. Open the public Lore page for a channel.
2. Read the short catch-up feed.
3. Explore approved stories, context and commitment updates.
4. See only material explicitly approved for public access.
5. Use !catchup in chat to receive the latest approved public summary when chat sending is enabled.

## 6. Confirmed technology

| Layer | Decision |
| --- | --- |
| Repository | pnpm monorepo |
| API application | apps/api with NestJS and TypeScript |
| Web application | apps/web with Next.js App Router, React, TypeScript and Tailwind CSS |
| Shared package | packages/shared with Zod schemas, enums and allowed status transitions |
| Database | PostgreSQL with pgvector |
| Database access | Drizzle ORM |
| Queue | Redis with BullMQ; Redis configured with noeviction |
| AI | Gemini through one AiProvider interface |
| AI responsibilities | Gemini for embeddings, bulk candidate extraction and schema-constrained case recommendations |
| AI validation | All provider responses validated server side with shared Zod schemas |
| Hosting | Single VPS running Docker Compose |
| Containers | PostgreSQL, Redis, NestJS API, Next.js web and Caddy |
| Reverse proxy | Caddy provides HTTPS and routes /api to NestJS and all other paths to Next.js on one domain |
| Evidence storage | S3 with short lived signed URLs |
| Authentication | Twitch OAuth in NestJS, httpOnly session cookie and encrypted stored refresh token |
| Background work | BullMQ workers, with separate ingestion and AI queues |
| Live updates | Server Sent Events from NestJS, fed by Redis pub/sub after worker completion; Socket.IO is an alternative |
| Viewer experience | Responsive web application |

**Ownership rule:** NestJS owns authentication, authorization, webhooks, AI calls and all database access. Next.js is the frontend only.

**Hosting decision:** Use one VPS with Docker Compose and Caddy. PostgreSQL and Redis must not have publicly accessible ports. If host ports are published for maintenance, bind them only to 127.0.0.1. Internal container traffic stays on a private Docker network.

## 7. System architecture

1. A user connects a Twitch account through OAuth handled by NestJS. NestJS creates an httpOnly session cookie, stores the refresh token encrypted, and refreshes expiring access tokens when needed.
2. NestJS creates supported EventSub subscriptions for the authorized channel after validating the required permissions.
3. Twitch sends EventSub requests to the NestJS webhook controller. Enable rawBody handling in NestJS and preserve the exact raw request bytes.
4. The controller verifies the Twitch signature using the message ID, message timestamp and raw body. It rejects invalid signatures and stale deliveries.
5. For EventSub subscription verification, the controller returns the supplied challenge as plain text after validating the request.
6. For event notifications, the controller saves the event once using the Twitch message ID as a unique delivery identifier. It enqueues a BullMQ ingestion job using that same message ID as the job ID, then returns a 2xx response promptly.
7. If enqueueing fails after the database write, a recovery process finds saved events without a queued or completed job and retries enqueueing. Duplicate delivery must not create duplicate memory records.
8. Ingestion workers process events. Any extraction or model call runs through a separate AI queue so slow model requests cannot block event ingestion.
9. Gemini extracts bulk candidates, generates embeddings and handles case reasoning with schema-constrained responses. Every response passes shared Zod validation before storage.
10. Authorized humans confirm commitments, decide cases and approve public entries.
11. When a worker finishes, it publishes a channel-scoped update through Redis pub/sub. NestJS delivers it to authorized clients through Server Sent Events. A Socket.IO gateway may replace this transport if needed.
12. A repeatable retention job purges expired ordinary chat records. Confirmed evidence excerpts are retained according to their own approved retention policy.
13. Caddy terminates HTTPS and routes /api to NestJS and all other requests to Next.js.

**Data flow:** Twitch and approved imports → NestJS verified webhook → PostgreSQL event record → BullMQ ingestion queue → AI queue when needed → validated memory records → human review → role-specific views.

**Access rule:** NestJS guards enforce role permissions. A channel-scoped repository layer applies the channel filter to every data query, including retrieval for AI and vector similarity search. Application code must not bypass this repository layer.

Never call Gemini directly from the browser with secret keys. Never expose database credentials, Redis credentials, OAuth tokens or signing secrets to the client.

## 8. Data model

All channel-owned records include an ID, channel ID, creation time, update time, source type and access classification.

| Table | Important fields |
| --- | --- |
| channels | id, twitch_channel_id, owner_user_id, settings, chat_retention_days |
| users | id, twitch_user_id, display_name |
| memberships | channel_id, user_id, role, verification_state |
| oauth_connections | user_id, encrypted_token_reference, encrypted_refresh_token, scopes, expiry |
| source_events | channel_id, provider_event_id, type, occurred_at, payload_reference, origin |
| evidence | channel_id, source_event_id, excerpt, storage_reference, visibility, retention_state |
| channel_rules | channel_id, rule_text, version, effective_at |
| cases | channel_id, subject_reference, incident, appeal, rule_version, status, decision, rationale, embedding |
| case_evidence | case_id, evidence_id |
| review_flags | channel_id, case_id, comparison_case_id, reason, reviewer_outcome |
| open_loops | channel_id, source_event_id, exact_wording, owner_id, due_context, status |
| handoffs | channel_id, audience, period_start, period_end, summary, status |
| handoff_items | handoff_id, linked_record_type, linked_record_id, assignee_id, status |
| resolution_actions | case_id, description, assignee_id, status, completed_at |
| public_entries | channel_id, title, body, approved_by, published_at, publication_status |
| public_entry_sources | public_entry_id, approved_source_reference |
| audit_events | channel_id, actor_id, action, target_type, target_id, occurred_at |
| processing_jobs | channel_id, job_type, source_id, status, attempts |
| overlay_tokens | channel_id, token_hash, created_at, revoked_at, regenerated_at |

The cases.embedding column uses pgvector. Its dimension must match the selected Gemini embedding model and be fixed by a database migration.

Store channel retention settings in channels. The overlay token record must support immediate revocation and regeneration. Never store the original overlay token in plaintext.

Use database constraints for unique Twitch event IDs, valid status transitions and channel ownership. Allowed status transitions are defined in packages/shared and enforced by NestJS.

## 9. Access and privacy model

### Access levels

- **Private moderation:** Authorized channel owner and approved moderators only.
- **Team:** Channel owner and explicitly authorized team members.
- **Draft public:** Content being prepared for publication; not viewer accessible.
- **Published public:** Reviewed, approved community content.

### Required enforcement

- Authenticate protected requests in NestJS.
- Use NestJS guards and a channel-scoped repository layer for every read, search, export and mutation.
- Filter retrieval by channel and visibility before sending context to Gemini.
- Create public entries as separate reviewed records, never as direct database views of private cases.
- Restrict S3 evidence files with short lived signed URLs issued after authorization checks.
- Log sensitive reads, decisions and publication actions without logging tokens or raw chat bodies.
- Revoke access when a user loses authorization.
- Support channel disconnect, record deletion and data export.
- Keep ordinary captured chat for seven days by default. This is a per channel setting. A channel can shorten retention without extra approval.
- Longer ordinary chat retention requires explicit opt in, any necessary additional approval, and verification against current Twitch terms.
- When a promise, case or evidence item is confirmed, copy the relevant source excerpt into its evidence record at that moment so the proof survives the raw chat purge.
- Run the retention purge through a repeatable BullMQ job and verify that it does not delete retained evidence excerpts.
- Verify current Twitch terms before enabling production retention or public sharing.

**Retention principle:** Lore remembers what the community chooses to keep, not everything typed.

A viewer must not be able to retrieve a private case by URL manipulation, search, an AI prompt or a guessed record ID.

## 10. Twitch API reality

### Supported integration candidates

- Twitch OAuth and account identification.
- EventSub channel.chat.message for permitted live chat capture.
- EventSub channel.chat.message_delete for permitted message deletion notifications.
- EventSub channel.moderate for moderation events when its required permissions are granted.
- EventSub channel.unban_request.create and channel.unban_request.resolve for supported appeal lifecycle events.
- Relevant stream lifecycle events for briefing and session boundaries.
- Chat message badge metadata for checking whether a !promise sender is a broadcaster or moderator, subject to verification with the actual subscription payload.
- Twitch chat sending for optional !promise confirmations and !catchup replies, subject to verifying the required permissions and account setup.

### Important limitations

- A new connection does not grant access to historical chat from before installation.
- An event notification is not necessarily a complete historical case file.
- Deleted messages cannot be reconstructed if their content was never lawfully captured.
- Full appeal context and past moderation evidence must not be assumed available.
- Some EventSub subscriptions require moderator authorization and multiple scopes.
- Access to a particular endpoint or event must be tested against the actual account and app permissions.
- Verify the exact chat badge fields, command delivery behavior, send chat permissions and moderator requirements before treating those integrations as production ready.

### Fallback behavior

- Allow authorized manual entry of past rules, decisions, appeals and community stories.
- Use clearly labeled demo fixtures for unavailable historical data.
- Display origin labels: Live Twitch, Manual import or Demo fixture.
- Never claim simulated history came from Twitch.
- If a subscription cannot be authorized, disable that live capture path and explain the missing permission.

**Primary technical references:**
Twitch EventSub: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
Twitch API reference: https://dev.twitch.tv/docs/api/reference
Twitch authentication: https://dev.twitch.tv/docs/authentication/

## 11. AI specification

### Tasks

- Extract candidate commitments and unresolved questions.
- Summarize sessions and create role-specific briefs.
- Retrieve relevant case precedents and explain similarities and differences.
- Suggest case resolutions with explicit uncertainty.
- Flag potentially inconsistent decisions for review.
- Draft public community summaries using approved sources only.

### Provider responsibilities

- Expose one AiProvider interface in NestJS so application workflows do not depend on provider-specific response formats.
- Use Gemini for embeddings and bulk candidate extraction.
- Use Gemini for case reasoning with JSON-schema-constrained output and explicit human approval.
- Validate every model response on the server using Zod schemas from packages/shared.
- Keep provider credentials and calls inside NestJS workers or services.

### Output contract

Every material AI suggestion returns:

- task_type
- summary or proposed_action
- source_record_ids
- evidence_gaps
- uncertainties
- requires_human_approval
- suggested_next_step

Validate structured responses server side. Store AI drafts separately from human-confirmed records.

### Retrieval and prompt safety

- Wrap chat text, imports and attachments in clear delimiters in every prompt. Treat all such material as untrusted data, never as instructions.
- Filter records by channel and visibility before sending any retrieval context to Gemini.
- For precedent retrieval, apply the channel filter first, rank eligible records by pgvector similarity second, and ask the model to explain the comparison third.
- Require model explanations to cite source record IDs. Do not accept a case recommendation that cites unavailable records.
- Exclude private moderation data from public summary retrieval even when the public request mentions a private case or guesses its ID.

### AI restrictions

- Do not fabricate evidence or missing events.
- Do not infer guilt, character or intent.
- Do not convert casual jokes into confirmed promises.
- Do not publish private material.
- Do not automatically ban, unban, close appeals or punish moderators.
- Treat Twitch chat, imports and attachments as untrusted input.
- Do not expose sensitive information through retrieval or model responses.

## 12. Application routes and interfaces

### Main pages

- /app: channel overview and attention queue
- /app/streamer: Open Loops, live context and prestream brief
- /app/moderation: cases, consistency reviews and handoffs
- /app/cases/[id]: evidence, precedent, human decision and repair actions
- /app/settings: connections, roles, privacy and retention
- /c/[channel]: public Community Lore
- /c/[channel]/catch-up: approved newcomer summaries
- /overlay/[channel]: transparent OBS browser source, accessible only with a valid revocable overlay token

### Server routes

All server routes are owned by NestJS and served under /api through Caddy.

- GET /api/auth/*: authentication callbacks and session handling
- POST /api/webhooks/twitch: verified EventSub delivery
- GET /api/channels/[id]/brief: authorized role-specific brief
- GET, POST /api/channels/[id]/open-loops: commitment workflow
- GET, POST /api/channels/[id]/cases: case workflow
- POST /api/channels/[id]/cases/[caseId]/decision: human decision
- GET, POST /api/channels/[id]/handoffs: shift workflow
- POST /api/channels/[id]/publications: review and publish public entry
- GET /api/channels/[id]/stream: authenticated Server Sent Events for live updates
- GET /api/overlay/[channel]: token-validated overlay data containing approved display content
- POST /api/channels/[id]/overlay-token/rotate: authorized token revocation and regeneration
- GET /api/health: API and dependency health status

The Next.js overlay page fetches data from the token-validated NestJS route. The overlay token must not grant access to private cases or general channel APIs.

These are application route contracts, not claims about Twitch endpoints.

## 13. Reliability requirements

- Enable rawBody in NestJS and verify Twitch webhook signatures against the message ID, timestamp and unmodified raw body.
- Reject invalid signatures and stale deliveries. Handle EventSub verification challenges as plain text.
- Deduplicate persisted events using the Twitch message ID and enqueue BullMQ jobs with the same message ID as the job ID.
- Return a successful 2xx response promptly after durable event acceptance and queue handling.
- Recover persisted events whose jobs were not enqueued because of a temporary Redis failure.
- Use a separate AI queue so model latency cannot block webhook ingestion.
- Make workers idempotent and retryable with bounded attempts and backoff.
- Configure Redis with the noeviction policy.
- Run a repeatable chat retention purge job.
- Record processing errors without silently losing an event.
- Handle expired Twitch access tokens using the stored encrypted refresh token and revoke sessions when authorization is lost.
- Protect NestJS API routes with authentication, guards, channel-scoped repositories and rate limits.
- Keep an audit trail for human decisions and public publication.
- Mark unavailable source evidence explicitly.
- Never log OAuth tokens, session secrets, overlay tokens or raw chat bodies.
- Keep PostgreSQL and Redis inaccessible from the public network. Bind any published maintenance ports to localhost only.
- Provide a /api/health endpoint and an external uptime check.
- Configure Docker Compose restart policies for the API, web, Redis, PostgreSQL and Caddy services.
- Keep a test channel and a separate seeded demo dataset.
- Run automated tests with Vitest or Jest alongside feature development. Run the full regression, security and integration suite before submission.

### Automated test requirements

- Verify valid Twitch webhook signatures, reject altered signatures and reject stale deliveries.
- Verify event deduplication and idempotent job handling.
- Verify allowed and disallowed open-loop and case status transitions.
- Verify that a viewer cannot retrieve a private case through a direct URL, search, an AI prompt or a guessed ID.
- Verify that channel isolation applies before vector similarity ranking and before AI retrieval.
- Verify overlay token revocation and regeneration.
- Verify that retention purges raw chat without deleting confirmed evidence excerpts.

Write the foundational webhook, status transition and authorization tests early. Coding agents must run the relevant tests as they implement each feature.

## 14. Hackathon acceptance criteria

The complete product vision remains in scope. The hackathon implementation must demonstrate each capability at least once through a reliable, connected workflow.

1. A Twitch account connects successfully and a verified live event is received.
2. An authorized broadcaster or moderator sends !promise in chat and a confirmed open loop is saved.
3. The dashboard quick capture field creates a confirmed open loop.
4. AI extraction from ordinary chat produces candidates that require human confirmation.
5. The next-stream brief shows the confirmed commitment with its source.
6. A case displays a rule, evidence and at least one relevant prior decision.
7. A moderator records the final decision rather than the AI doing so.
8. A possible consistency issue is flagged and reviewed by a human.
9. A repair or re-entry action is assigned and completed.
10. A moderator handoff carries unresolved work to the next shift.
11. A public newcomer page explains approved community context.
12. The !catchup command replies with the latest approved public summary when the required Twitch permission is available.
13. A transparent OBS overlay displays approved open loops or a short recap, and its token can be revoked.
14. Public requests cannot access private moderation records.
15. Live, manually supplied and simulated records are visibly distinguished.
16. The primary demo can be completed in under three minutes.
17. A hosted demo mode lets judges use Streamer Home, Moderator Desk and Community Lore without connecting a Twitch account. All seeded records are labeled Demo fixture.
18. The demo video shows the live Twitch integration path, including a verified event and !promise capture.
19. The repository includes a working README with pnpm setup, environment variable names, Docker Compose commands, migrations, seeding and test instructions.
20. The repository records Codex usage through AGENTS.md files, milestone prompts and a short account of parallel coding threads.
21. The submission target is November 2, 2026 at 2:00 PM Pacific Time, as provided for this project. Verify it against the official event page before submission.
22. The stated judging period is November 5 to 15, 2026. Keep the VPS and hosted demo online throughout that period, with restart policies and an uptime check. Verify official dates before deployment planning is finalized.
23. Automated tests for webhooks, status transitions and authorization run successfully in the repository.

## 15. Three-minute judge demo

**0:00 to 0:20.** Show the problem: the stream ends, but the community's commitments and decisions should not disappear.

**0:20 to 1:00.** The broadcaster types !promise in live Twitch chat. Lore validates the event, confirms the promise and places it in the next-stream brief.

**1:00 to 1:55.** A moderator opens a case. Lore shows available evidence, the channel rule, a prior precedent and a potential inconsistency. The moderator makes the decision and assigns a repair action.

**1:55 to 2:30.** A new viewer opens Community Lore and catches up on the approved story and commitment. Private case details remain hidden.

**2:30 to 3:00.** Show the shared memory and permission boundary: one community history, three useful experiences, humans in control.

**Closing line:** Every stream has a story. Lore remembers it.

## 16. Delivery sequence

1. Create the pnpm monorepo, shared Zod schemas, NestJS API, Next.js web app, PostgreSQL, Redis, Docker Compose and Caddy configuration. Add the first automated tests for webhook verification, allowed status transitions and authorization.
2. Implement Twitch OAuth, encrypted refresh token handling, channel membership, guards and channel-scoped repositories.
3. Complete the live promise loop end to end: verified Twitch EventSub webhook, durable event record, BullMQ ingestion, authorized !promise command, confirmed open loop and next-stream brief. Add the dashboard quick capture path. Run feature tests as each part is built.
4. Build cases, evidence storage, pgvector precedent retrieval and human decision workflows. Test channel isolation and private case access.
5. Build moderator handoffs and consistency review. Test status transitions and human review requirements.
6. Add repair and re-entry actions. Test assignment, completion and evidence retention.
7. Build approved public entries, Community Lore and Newcomer Compass. Test public and private data separation.
8. Add the revocable OBS overlay and !catchup command. Verify Twitch chat sending permissions and test overlay token revocation.
9. Set up hosted demo mode with labeled seeded data and ensure all three surfaces work without Twitch login.
10. Finish deployment hardening, retention purge, restart policies, health endpoint, uptime monitoring and token handling. Run the complete regression, integration and security test suite.
11. Record Codex usage in AGENTS.md and milestone notes. Finish the README, verify Docker Compose setup from a clean environment, record the live Twitch demo video, confirm official event dates and submit.
12. Keep the VPS and demo available throughout the stated November 5 to 15, 2026 judging period.

Automated tests are written alongside each feature and run continuously. The final testing stage is for full regression, security and deployment verification, not the first time tests are written.

## 17. Final locked decisions

**Name:** Lore, working name pending brand clearance.

**Tagline:** Every stream has a story. Lore remembers it.

**Positioning:** Shared memory for Twitch communities.

**Keep:** Appeals and precedent, moderation consistency review, promise tracking, shift handoffs, community repair, Open Loops, Newcomer Compass, !catchup and the OBS overlay.

**Remove:** Raid Relay, Questline and generic AI moderation copilot.

**Repository:** pnpm monorepo with apps/api, apps/web and packages/shared.

**API:** NestJS and TypeScript. NestJS owns authentication, authorization, webhooks, AI and data access.

**Web:** Next.js App Router, React, TypeScript and Tailwind CSS. Responsive frontend only.

**Database:** PostgreSQL with pgvector and Drizzle ORM.

**Queues:** Redis with BullMQ, noeviction policy and separate ingestion and AI queues.

**AI:** Gemini behind one AiProvider interface, with shared Zod validation.

**Hosting:** Single VPS with Docker Compose and Caddy HTTPS reverse proxy.

**Evidence storage:** S3 with short lived signed URLs.

**Authentication:** Twitch OAuth in NestJS, httpOnly session cookie, encrypted refresh token and token refresh handling.

**Live updates:** Server Sent Events backed by Redis pub/sub, with Socket.IO as an alternative.

**Promise capture:** Authorized !promise commands and dashboard quick capture create confirmed items. AI chat extraction creates candidates. Microphone transcription is optional and candidate only.

**Retention:** Seven days for ordinary captured chat by default, configurable per channel with shorter retention freely allowed. Confirmed evidence excerpts survive raw chat deletion. Longer retention requires explicit opt in and policy validation.

**Demo:** Hosted seeded mode with Demo fixture labels, plus a video showing the real Twitch path.

**Testing:** Automated tests written alongside features, with a full regression and security pass before submission.

**Core rule:** Humans decide. Evidence stays traceable. Private context stays private.

**Open validation items:** Twitch scopes for the chosen accounts, exact chat badge fields and send chat permission, moderator scope testing on a real test channel with a second moderator account, precise historical data availability, current Twitch retention and platform rules, official hackathon submission conditions and dates, selected Gemini embedding model and vector dimensions, and brand clearance.

**Final definition:** Lore turns the moments, promises and decisions a Twitch community would otherwise lose into useful memory for the next stream.
