# GitHub workflow

Repository: [Folareen/Lore](https://github.com/Folareen/Lore).

All work follows this sequence:

1. Fetch the repository and identify its current default branch (`main` or `master`).
2. Create a `<type>/<short-kebab-case-description>` branch from the latest default branch before editing files.
3. Make focused changes and run the relevant checks in [Code quality rules](code-quality.md).
4. Review the diff and commit the intended files. Keep secrets, generated builds, and local data out of commits.
5. Push the working branch to GitHub.
6. Open a pull request targeting the default branch. Use a Conventional Commit title and describe the change and validation results.
7. Merge through the pull request after review and required checks pass.

Never commit work directly on the default branch, push directly to it, or force-push it. Keep subsequent updates on the pull request branch. Do not merge a pull request unless the user authorizes it.

These are repository contribution instructions. GitHub branch protection or rulesets must be configured separately to enforce them on the server.

## Naming conventions

Use these prefixes for branches, commits, and pull request titles:

| Type       | Purpose                                    | Example branch                |
| ---------- | ------------------------------------------ | ----------------------------- |
| `feat`     | New product behavior                       | `feat/twitch-oauth`           |
| `fix`      | Correct existing behavior                  | `fix/webhook-deduplication`   |
| `chore`    | Repository maintenance and initial setup   | `chore/setup-lore-monorepo`   |
| `docs`     | Documentation changes                      | `docs/frontend-conventions`   |
| `refactor` | Restructure code without changing behavior | `refactor/channel-repository` |
| `test`     | Add or improve tests                       | `test/open-loop-transitions`  |
| `ci`       | Continuous integration workflows           | `ci/check-pull-requests`      |
| `build`    | Build tooling or dependency changes        | `build/update-nextjs`         |
| `perf`     | Performance improvements                   | `perf/precedent-query`        |
| `style`    | Formatting-only changes                    | `style/format-shared-schemas` |
| `revert`   | Revert an earlier change                   | `revert/queue-retry-change`   |

Commits and PR titles use `<type>(<optional-scope>): <description>`, for example:

```text
chore: set up Lore monorepo
feat(api): add Twitch OAuth callback
fix(api): reject stale EventSub deliveries
docs: clarify local Docker setup
```

Choose the type that describes the change. Keep descriptions specific and use scopes such as `api`, `web`, or `shared` when helpful. Mark a breaking contract change with `!` after the type or scope and explain it in a `BREAKING CHANGE:` footer.

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) defines the commit format; the branch prefix and PR title conventions above are Lore’s matching repository policy.
