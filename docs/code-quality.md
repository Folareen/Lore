# Code quality rules

Applies to TypeScript and JavaScript in all Lore workspaces.

## Selected source principles

Condensed from [pipethedev’s TypeScript Anti-Slop gist](https://gist.github.com/pipethedev/ff13d98a5b626f985708afb343723048), reviewed October 26, 2026. This is a project adaptation; consult the original for its full examples.

1. Parse external data at entry points; pass precise types through internal code.
2. Repair overly broad upstream types instead of introducing field extractors or universal converters.
3. Express exclusive states with discriminated unions and known keys with literal unions.
4. Make fields optional only when the domain permits absence. Keep required dependencies required.
5. Reject invalid input explicitly; avoid empty defaults and coercions that disguise failures.
6. Retain checks for real uncertainty, including missing records, malformed messages, and permissions.
7. Extract helpers and layers for meaningful behavior; avoid trivial wrappers, speculative generics, and duplicate DTOs.
8. Favor clear branches and early exits over nesting or dense expressions.
9. Catch failures for recovery, translation, or cleanup. Avoid duplicate logging and mechanical rethrows.
10. Use existing promises directly; clone data only for a concrete ownership need.
11. Explain constraints in comments; remove obsolete code after refactoring.
12. Review added complexity and preserve existing behavior during cleanup.

## Applying these rules in Lore

- **Contracts:** use Zod in `packages/shared` for contracts consumed across workspaces and infer types with `z.infer`. Keep API-only configuration and provider details inside `apps/api`.
- **Entry points:** parse HTTP input, Twitch payloads, environment configuration, provider responses, and persisted BullMQ payloads at their respective receiving boundaries. A worker is a new boundary even if a producer validated its input earlier. Zod’s `safeParse` is appropriate when rejection needs explicit handling.
- **Authentication and authorization:** schema validation establishes shape. NestJS must still check sessions, channel membership, visibility, and allowed transitions for each protected operation. EventSub verification must use the exact raw request bytes.
- **Persistence:** use Drizzle’s inferred row and insert types. Keep explicit public response projections so private evidence and credentials cannot leave the API accidentally.
- **Architecture:** use standard NestJS modules and injection. Keep channel-scoped repositories and the OpenAI/Gemini `AiProvider` interface because they enforce ownership and support distinct implementations. Framework controllers can delegate to services.
- **Assertions:** a TypeScript assertion does not validate runtime data. Do not cast Twitch, AI, queue, or request payloads into trusted types. Local integration assertions need a clear contract; do not use `as any` to suppress a mismatch.
- **Reliability:** preserve bounded retries, idempotency, durable event acceptance, dependency health reporting, and secret redaction when simplifying code.

MongoDB-specific examples from the source are outside this PostgreSQL/Drizzle project. The shared workspace remains the home for shared contracts, rather than miscellaneous utilities.

## Before completing a change

Inspect the changed code for unnecessary complexity and confirm Lore’s privacy and workflow requirements still hold. For code changes, run relevant behavior tests, `pnpm lint`, and `pnpm typecheck`; run `pnpm build` when application or build configuration changes. Run `pnpm format:check` for documentation changes. Existing CI verifies formatting, lint, types, tests, and the build; these design rules also require review.
