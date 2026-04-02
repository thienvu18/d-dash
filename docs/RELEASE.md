# Release Runbook

This repository uses [Changesets](https://github.com/changesets/changesets) for independent per-package semantic versioning.

## Preconditions

- All intended changes are merged into `main`.
- Node.js >=20.19.0 and npm are available.
- You have npm publish rights for `@d-dash/*`.
- `NPM_TOKEN` is set in your environment (local) or in GitHub Actions secrets.

---

## Typical release (2 commands)

### Step 1 — Bump versions and update changelogs

```bash
npm run release:version
```

This runs `changeset version`, which:
- consumes all pending `.changeset/*.md` files
- bumps each affected package to the correct semver level (patch / minor / major)
- updates each package's `CHANGELOG.md`
- removes the consumed changeset files

Then stages and commits the result with message `chore(release): version packages`.

### Step 2 — Validate, publish to npm, tag, and push

```bash
npm run release:publish
```

This runs, in order:

1. `release:prepare` — lint, clean build, full test suite, TypeDoc, metadata and version consistency checks.
2. `changeset publish` — publishes each package to npm (in topological order) and creates a git tag per package (e.g. `@d-dash/core@1.2.0`).
3. `git push --follow-tags origin main` — pushes the version-bump commit and all release tags to GitHub.

### Or as a single command

```bash
npm run release
```

Chains `release:version` then `release:publish`.

---

## During development — creating changesets

Whenever you make a user-facing change, create a changeset before committing:

```bash
npm run changeset
```

Follow the interactive prompt to select affected packages and describe the change type (patch / minor / major). Commit the generated `.changeset/*.md` file alongside your code.

---

## Dry-run (no publish, no version bump)

Validates the full build and simulates npm publish output without touching npm or git:

```bash
npm run release:dry-run
```

---

## GitHub releases

After `release:publish` pushes the tags, each `@package@version` tag appears under **Tags** on GitHub. To publish a formal GitHub Release from a tag:

```bash
gh release create @d-dash/core@1.2.0 --generate-notes
```

Repeat for each published package, or automate via a GitHub Actions workflow triggered on `push` of tags matching `@d-dash/*`.

---

## What `release:prepare` checks

| Step | Script |
|---|---|
| Lint | `eslint .` |
| Clean build + export verification | `build:release` → `verify:exports` |
| Test suites | all packages |
| API docs | `typedoc` |
| Package metadata completeness | `release:check:metadata` |

---

## Rollback guidance

1. Do not republish an already-published version — npm rejects it.
2. Fix the issue in a new commit, create a changeset for it, and re-run the two-step release flow.
3. If a package was partially published, treat the published version as released and ship a follow-up patch.
