# Release Runbook

This runbook describes how to publish d-dash packages safely.

## 1. Preconditions

1. All intended changes are merged into `main`.
2. Node.js 18+ and npm are available.
3. You have npm publish permissions for `@d-dash/*`.
4. `NPM_TOKEN` is configured for CI publish workflow.

## 2. Local validation

Run full release checks:

```bash
npm run release:prepare
```

This verifies:

- clean build for all packages
- test suites across core and adapters
- TypeDoc API docs generation
- package metadata completeness
- package version consistency

## 3. Local dry-run publish

```bash
npm run release:dry-run
```

This performs publish dry-runs in deterministic order (core first).

## 4. GitHub Actions dry-run

Use workflow dispatch for `Publish Packages` with `dry_run=true`.

## 5. Real publish

Option A: local

```bash
npm run release:publish
```

Option B: GitHub Actions workflow dispatch with `dry_run=false`.

## 6. Post-publish checks

1. Confirm package versions are visible on npm.
2. Update `CHANGELOG.md` if needed.
3. Tag release in git.
4. Verify docs links and API docs are accessible.

## 7. Rollback guidance

If publish partially fails:

1. Do not republish existing versions.
2. Fix issue in a new commit.
3. Bump versions consistently.
4. Re-run `release:prepare` and `release:dry-run`.
5. Publish new versions.
