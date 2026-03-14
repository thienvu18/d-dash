# Publish Readiness Checklist

This checklist is the final freeze gate for publishing d-dash packages.

## Contract and implementation alignment

- [x] Documented adapter targets are implemented: ECharts (text/html), Gridstack, REST, gRPC, VictoriaMetrics.
- [x] Core runtime enforces structured contract behavior (validation, registry, execution, errors).
- [x] Schema migration API exists (`migratePersistedDashboard`) with tests.
- [x] Datasource capability checks include ad-hoc filter enforcement.

## Testing and quality gates

- [x] Lint passes: `npm run lint`
- [x] Build passes: `npm run build:release`
- [x] Test suites pass for all packages: `npm run test`
- [x] API docs generation passes: `npm run docs:api`
- [x] Metadata validation passes: `npm run release:check:metadata`
- [x] Version consistency validation passes: `npm run release:check:versions`

## Packaging and release automation

- [x] Package export paths verified: `npm run verify:exports`
- [x] Dry-run publish passes in package order: `npm run release:dry-run`
- [x] CI workflow validates release gate on push/PR (`.github/workflows/ci.yml`).
- [x] Publish workflow supports dry-run and real publish (`.github/workflows/publish.yml`).

## Open source readiness

- [x] Root docs/governance files exist: README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG.
- [x] Docs index and release runbook exist (`docs/README.md`, `docs/RELEASE.md`).
- [x] Package metadata includes description, repository, bugs, homepage, engines, files, publishConfig.

## Final release commands

Run before publishing:

```bash
npm run release:prepare
npm run release:dry-run
```

Publish:

```bash
npm run release:publish
```

Or use GitHub workflow dispatch in `.github/workflows/publish.yml`.
