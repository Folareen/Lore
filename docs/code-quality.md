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

## Shared contracts

Use Zod schemas and inferred types in `packages/shared` for cross-workspace contracts. Keep feature-specific helpers with their feature. Type assertions do not validate external data; do not use `as any` to hide mismatches. Keep `safeParse` where validation failures need explicit handling.

Stack-specific rules live in [frontend conventions](frontend.md) and [backend conventions](backend.md).

## Before completing a change

Inspect the changed code for unnecessary complexity and confirm Lore’s privacy and workflow requirements still hold. For code changes, run relevant behavior tests, `pnpm lint`, and `pnpm typecheck`; run `pnpm build` when application or build configuration changes. Run `pnpm format:check` for documentation changes. Existing CI verifies formatting, lint, types, tests, and the build; these design rules also require review.
