# GitHub workflow

Repository: [Folareen/Lore](https://github.com/Folareen/Lore).

All work follows this sequence:

1. Fetch the repository and identify its current default branch (`main` or `master`).
2. Create a descriptive feature, fix, or documentation branch from the latest default branch before editing files.
3. Make focused changes and run the relevant checks in [Code quality rules](code-quality.md).
4. Review the diff and commit the intended files. Keep secrets, generated builds, and local data out of commits.
5. Push the working branch to GitHub.
6. Open a pull request targeting the default branch. Describe the change and validation results.
7. Merge through the pull request after review and required checks pass.

Never commit work directly on the default branch, push directly to it, or force-push it. Keep subsequent updates on the pull request branch. Do not merge a pull request unless the user authorizes it.

These are repository contribution instructions. GitHub branch protection or rulesets must be configured separately to enforce them on the server.
