# Lore: purpose, audience and current scope

Reviewed: October 31, 2026. Implementation reference: the community workflow completion PR.

This document separates implemented behavior from intended behavior. The [original PRD](product/LORE_Product_PRD_Technical_Spec_v1.1.md) describes the intended product; its requirements are not evidence that every feature is built.

**Implemented** means application code exists for the workflow. It does not mean the feature is deployed publicly or verified against every live service. Live Twitch sign-in was confirmed during local setup. Other live integration checks are identified separately below; this review does not establish whether someone has tested them outside this session.

## 1. What the product does

**Lore is shared memory for a Twitch community.** It helps a streamer and their authorized team remember commitments, preserve moderation context and explain approved community history to viewers.

It addresses three concrete problems:

1. **Forgotten commitments:** a streamer promises something in chat, but the promise disappears between streams.
2. **Lost moderation context:** a moderator reviews an incident or appeal without the evidence, earlier decisions or previous shift's notes.
3. **Confused newcomers:** a viewer arrives without understanding the community's recurring references, milestones or ongoing stories.

Lore keeps those workflows connected while separating private team information from material explicitly approved for the public.

## 2. Intended audience and authentication

| Audience                            | What they use Lore for                                                                                                                         | Account and access requirements                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twitch streamer/channel owner       | Connect their channel; manage team access, settings and consent; track commitments; review and publish community information.                  | Must sign in with Twitch. They can connect their own Twitch channel.                                                                                            |
| Owner-approved moderators           | Review private cases and evidence; compare earlier decisions; record human decisions; manage consistency reviews, repair actions and handoffs. | Must sign in with Twitch and receive a moderator role from the channel owner in Lore.                                                                           |
| Owner-approved general team members | Capture and review follow-ups, read the next-stream brief and prepare community publishing drafts.                                             | Must sign in with Twitch and receive a team role from the owner. A general team role does not grant access to private moderation cases or publication approval. |
| Viewers and newcomers               | Read published Community Lore, catch-up summaries and approved commitment updates.                                                             | No Lore login or Twitch account is required to read public pages. Sending `!catchup` in Twitch chat requires a Twitch account.                                  |
| Demo visitors and hackathon judges  | Try the product using synthetic examples.                                                                                                      | No login, connected Twitch channel or provider credentials are required.                                                                                        |

### Access rules

- Twitch sign-in identifies a person and creates their Lore account if needed. It does not grant access to someone else's channel.
- The owner grants moderator/team access inside Lore. These grants are owner-approved; they are not automatically synchronized with Twitch's moderator list.
- Ordinary login requests no chat or moderation permissions. Chat capture and chat replies require separate Twitch authorization and explicit owner opt-in.
- A verified moderator badge can authorize a `!promise` command in Twitch chat. It does not, by itself, give that person access to Lore's private workspace.
- Public readers receive only published information. Knowing a channel name, private record ID or public link does not grant private workspace access.

**The current authentication choice is Twitch-only for the private workspace, with anonymous access to public pages and the demo. Email/password signup is not part of the current scope.**

## 3. What is implemented

| Area                                    | Working behavior                                                                                                                                                                 | Important limit                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Channel and team management             | Twitch sign-in, connecting the owner's channel, owner-managed roles, disconnecting and retention settings.                                                                       | Role grants are manual in Lore. There is no automatic Twitch moderator-role synchronization.                                                                                                                                                                                                     |
| Live Twitch capture                     | Verified EventSub handling for chat messages, message deletion, room/user chat clearing and stream online/offline events. Processing includes deduplication and recovery.        | Requires capture authorization, owner opt-in and a reachable HTTPS webhook. It captures supported events going forward; it does not import historical chat.                                                                                                                                      |
| Confirmed commitments                   | Dashboard capture and authorized `!promise <wording>` commands create confirmed open loops. People can start, postpone, fulfill or cancel them and inspect their source/history. | A command is an explicit human action. Casual chat and AI output do not automatically become confirmed promises.                                                                                                                                                                                 |
| AI candidate review                     | Gemini suggests commitments, unanswered questions or announcements from retained captured chat. A person edits/confirms or dismisses a suggestion.                               | Confirmation saves a general open-loop record. There is no separate announcement scheduler or viewer Q&A workflow.                                                                                                                                                                               |
| Next-stream brief                       | Lists active open loops, source-linked promise changes and currently published developments since the last retained stream end (otherwise seven days).                           | It is a bounded, deterministic brief; it does not reconstruct missing chat or claim to cover every stream event.                                                                                                                                                                                 |
| Private moderation cases                | Owners/moderators review manual cases or opted-in Twitch ban/timeout/unban-request imports, attach evidence and record human decisions.                                          | Imports cover future authorized events, not historical backfills; imported rules remain unknown until a human supplies them. Recording a decision does not execute a moderation action on Twitch.                                                                                                |
| Evidence attachments                    | Authorized case uploads to private Cloudflare R2 storage; authorized download links expire after 60 seconds.                                                                     | Accepts PNG, JPEG, PDF and UTF-8 text files up to 5 MB. Uploaded file contents are not analyzed by AI.                                                                                                                                                                                           |
| Precedent retrieval and recommendations | Gemini embeddings retrieve eligible, human-decided cases from the same channel. Gemini drafts a cited recommendation for human review.                                           | Similarity is a retrieval aid, not proof of guilt or a requirement to repeat an earlier outcome. Recommendations cannot decide or alter a case themselves.                                                                                                                                       |
| Consistency reviews                     | Humans can flag concerns, and deterministic comparisons can identify different documented outcomes under matching rules for review.                                              | This is not an AI verdict about fairness or misconduct. Humans assess context and resolve the concern.                                                                                                                                                                                           |
| Repair actions and handoffs             | Moderators document agreed follow-ups/re-entry conditions, assign actions, record progress and generate source-linked shift snapshots.                                           | These are records and tasks. They do not automatically unban someone, enforce re-entry conditions or contact that person.                                                                                                                                                                        |
| Community publishing and catch-up pages | Team members prepare drafts; owners/moderators review and publish exact public wording. Visitors can read, search and filter published entries and summaries.                    | Gemini can draft summaries from 1–10 selected, already-published public entries after separate owner consent; people edit and approve publication. Private cases and notes are not automatically published. Changing or withdrawing a published source withdraws dependent summaries for review. |
| `!catchup` replies                      | Sends the latest approved summary's reviewed short wording, or a neutral message if no summary is approved.                                                                      | Requires live capture, chat authorization and owner opt-in. It does not generate a new AI answer for each viewer.                                                                                                                                                                                |
| OBS overlay                             | Displays one approved public recap or up to three approved public commitment titles through a transparent browser source with a revocable token.                                 | Selection is manual. Lore does not start OBS, switch scenes or automatically choose a stream-start recap.                                                                                                                                                                                        |
| Demo                                    | Guided synthetic workflows, chat simulation, tab-local changes and reset. `/demo` falls back to bundled sample data; `/preview` redirects to it.                                 | Simulated AI, chat and overlay credentials do not prove the corresponding external integration is configured.                                                                                                                                                                                    |
| Retention and access protections        | Configurable 1–7 day ordinary-chat retention, automatic/manual expiry cleanup, private channel boundaries and audited human decisions.                                           | Human-retained evidence has a separate lifecycle. Purging ordinary chat does not automatically delete retained proof or recall information already downloaded or broadcast.                                                                                                                      |

## 4. What Lore does not do

These are product boundaries, not missing items to assume are on the roadmap:

- **No autonomous moderation:** Lore helps authorized humans review evidence and record decisions. It does not execute warnings, timeouts, bans, unbans or appeal resolutions on Twitch. Moderators carry out any resulting Twitch action themselves. Consistency reviews concern case decisions; they do not score or discipline moderators.
- **No generic toxicity filter or spam bot:** the product focuses on continuity, evidence and follow-through rather than replacing chat moderation tools.
- **No permanent character or reputation scoring:** it does not create public offender labels, cross-channel reputation profiles or public moderator grades.
- **No unrestricted chat archive:** it does not promise complete historical chat, indefinite raw-chat storage or recovery of events that were never captured.
- **No stream recorder or VOD archive:** Lore does not record or archive full broadcasts. Optional microphone capture accepts only explicitly recorded clips up to 30 seconds; it is not continuous stream listening.
- **No automatic publication of private information:** moderation cases, appeals, internal notes and repair details are not a public knowledge base.
- **No autonomous AI decisions or fabricated evidence:** suggestions require human review, and missing context must remain identified as missing.
- **No general-purpose community assistant:** public catch-up is an approved feed and fixed summary reply, not an unrestricted chatbot answering questions about everyone in a channel.
- **No Raid Relay, Community Questline or cross-platform community management:** these are outside the current approved scope.

## 5. Previously missing workflows — implementation checklist

These six tasks are implemented together. Live account verification remains separate (section 6).

- [x] Import authorized future Twitch bans, timeouts and unban-request creation/resolution events into private review cases. Read permissions and a default-off owner setting are required. Duplicate and out-of-order appeal events link to one appeal case. Resolution evidence never decides a Lore case. A human must replace the unknown rule snapshot before deciding.
- [x] Add source-linked brief context: up to 20 changed promises and 10 currently published community developments since the latest retained processed `stream.offline` event, falling back to seven days. This shows current records, not a reconstructed stream transcript; larger result sets are labeled truncated.
- [x] Generate editable Gemini summary drafts using 1–10 selected published sources from the same channel. Private chat/cases are excluded; changes to source versions or consent while generating discard the result. Saving and publication approval remain explicit human steps.
- [x] Push authenticated, channel-scoped workspace invalidations through SSE. The server checks the committed database revision and current access every two seconds. Clean views refresh; edits are preserved with a visible reload notice. Consent refreshes even while edits are held. Public pages and overlays retain their existing refresh behavior.
- [x] Add separate default-off `!promise` confirmations for accepted authorized commands. Replies use fixed wording, expire after 90 seconds, have a 15-second channel cooldown, respect deletion/consent and do not retry ambiguous sends.
- [x] Add optional microphone capture in candidate review: owner opt-in, browser permission, deliberate recording (maximum 30 seconds), local playback and explicit submission to Gemini. Lore stores no raw audio. Transcripts are unverified, suggestions are unconfirmed, and a human must confirm each promise. Unconfirmed transcripts follow current chat retention and are scrubbed on opt-out/disconnection; confirming retains a separate source excerpt.

AI drafting/transcription share the channel's existing daily call allowance. Free-tier provider quotas can still reject calls; the app reports failure without confirming or publishing anything. Demo mode does not activate a microphone, send messages or call providers.

Automatic Twitch role synchronization, email/password signup, a viewer self-service appeal portal and support for other streaming platforms are **not implemented and are not committed requirements in the current PRD**. Adding them would be a scope decision, not completion of an existing promise.

## 6. Implementation is not the same as launch readiness

The following work must be tracked separately from missing product features:

- **Live integration verification:** Twitch login has been confirmed locally. This review has not established recorded live verification for supported EventSub deliveries, real chat capture/deletion, live `!promise`/`!catchup`, configured Gemini extraction/recommendations, real R2 uploads/downloads or actual OBS capture. Verify each with the configured accounts before declaring it ready for production. Automated mocks and demo examples do not establish those live checks.
- **Production deployment:** the repository has local PostgreSQL/Redis Docker services. A complete production deployment with the applications, HTTPS reverse proxy, process supervision, uptime monitoring and tested backup/restore remains deployment work.
- **Production data handling:** ordinary-chat retention is implemented. Final retention/sharing policies, handling of data requests and validation against applicable Twitch requirements remain launch work; the current cleanup feature is not a claim that every data lifecycle requirement is complete.
- **Hosted demo and submission evidence:** local demo code exists. Public hosting and a video demonstrating the real Twitch path require separate delivery and verification.

## 7. What is stored, and where

| Store         | Purpose                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL    | Users, roles, encrypted OAuth credentials, sessions, captured chat with retention deadlines, promises, candidates, cases, text evidence, decisions, handoffs, public entries, audit records and precedent embeddings. |
| Cloudflare R2 | Human-uploaded private case evidence files. It is not the primary store for chat, cases or promises.                                                                                                                  |
| Redis/BullMQ  | Background job coordination and retry/recovery support. It is not the primary product record store.                                                                                                                   |

Gemini is the AI provider for extraction, embeddings, recommendations, public summary drafts and optional microphone transcription. Extraction and private-case AI have separate owner-controlled channel consent. Google’s free-tier data-use terms must be understood before sending sensitive content; a private Lore workspace does not imply that an external AI provider has a no-retention policy.

## 8. A concrete example

1. A streamer types `!promise Finish the community island tour next stream.` Authorized capture saves a confirmed commitment.
2. The next-stream brief shows that commitment and its source. The streamer later marks it fulfilled with a reason.
3. Separately, a moderator manually creates a spoiler-appeal case, attaches evidence and compares earlier decisions from the same channel.
4. Gemini may suggest a response. The moderator records their own final decision and creates any agreed follow-up action. Lore does not execute a Twitch ban or unban.
5. The team drafts an appropriate public island-tour update. An owner/moderator reviews and publishes it. Private appeal details remain private.
6. A newcomer reads the public catch-up page without signing in. If chat replies are enabled, `!catchup` returns the reviewed public summary. The approved recap can also be manually selected for the OBS overlay.

For installation and credentials, use the [project README](../README.md). For implementation rules and access details, use the [backend conventions](backend.md) and [frontend conventions](frontend.md).
