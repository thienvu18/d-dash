## Plan: Implement Documented Features and Publish Readiness

Close all documented-but-missing functionality, complete adapter parity with documented core expectations, add JSDoc-driven API documentation generation, add release-grade build/release scripts, and finish open-source packaging so the monorepo is ready for GitHub and npm publication.

**Steps**

1. Phase 0: Baseline and acceptance matrix (blocks all implementation)
   Define docs-to-code acceptance criteria from `plan.md` and `docs/*.md` for html widget support and sanitization policy, grid move/resize event bridge, datasource metadata discovery, capability validation, schema migrations, and gRPC adapter completion.

2. Phase 1: Core contract completion (depends on 1)
   Extend core runtime to enforce documented capabilities consistently, add explicit html sanitization contract boundaries without breaking headless core ownership, and add schema migration framework with migration tests for supported schemaVersion transitions.

3. Phase 2: Adapter parity with documented features (depends on 2)

- ECharts adapter: implement html visualization variant, declare `supportsHtmlWidget`, and add html safety tests.
- Gridstack adapter: implement move/resize event bridge callbacks and lifecycle cleanup tests.
- REST adapter: implement `getMetrics()` discovery path and tests.
- VictoriaMetrics adapter: implement `getMetrics()` discovery path and tests.
- gRPC adapter: implement package fully (query mapping, normalization, structured errors, retry hints, capabilities, and tests).

4. Phase 3: Public API docs with JSDoc and TypeDoc (parallel with 2, finalize after 2)
   Add or normalize JSDoc on all exported interfaces, types, and functions in core and first-party adapters. Add TypeDoc config and generation scripts, then wire generated API docs into project documentation.

5. Phase 4: Release-mode build and validation scripts (depends on 2 and 3)
   Replace placeholder root scripts with workspace release scripts: clean build artifacts, build all packages, run tests, run type checks, verify exports, validate package metadata, and run publish dry-run checks.

6. Phase 5: Open-source publication hardening (parallel with 4, finalize after 4)
   Create root OSS files and publishing metadata:

- `README.md` (opensource-friendly)
- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `docs/README.md` index
  Also standardize package metadata for publishability and align package README quality.

7. Phase 6: Final publish-readiness verification and freeze (depends on 2-5)
   Run full verification matrix (build, tests, docs generation, metadata checks, dry-run publish), validate docs-to-code alignment for target integrations (gridstack.js, ECharts text/html, REST, gRPC, VictoriaMetrics), and produce final release checklist.

**Relevant files**

- `plan.md`
- `docs/CONTRACTS.md`
- `docs/CODE_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/SCHEMA_DESIGN.md`
- `docs/USAGE.md`
- `docs/PLUGIN_DEVELOPMENT.md`
- `package.json`
- `tsconfig.base.json`
- `packages/core/src/adapters.ts`
- `packages/core/src/execution.ts`
- `packages/core/src/dashboard-runtime.ts`
- `packages/core/src/validation.ts`
- `packages/core/src/schema.ts`
- `packages/adapter-echarts/src/index.ts`
- `packages/adapter-gridstack/src/index.ts`
- `packages/datasource-rest/src/index.ts`
- `packages/datasource-victoriametrics/src/index.ts`
- `packages/datasource-grpc/README.md` (to be replaced with implemented package docs)
- `packages/core/tests/*.spec.js`
- `packages/adapter-echarts/tests/echarts-adapter.spec.js`
- `packages/adapter-gridstack/tests/gridstack-adapter.spec.js`
- `packages/datasource-rest/tests/rest-datasource.spec.js`
- `packages/datasource-victoriametrics/tests/victoriametrics-datasource.spec.js`

**Verification**

1. Contract-completion check: every documented feature is implemented or explicitly marked experimental, with matching tests.
2. Adapter parity check: first-party adapters satisfy documented lifecycle, capability, and structured-error expectations.
3. Build/release check: release scripts pass for build, test, type-check, export validation, metadata validation, and publish dry-run.
4. API docs check: TypeDoc output includes all public exported interfaces/types/functions.
5. OSS readiness check: root docs/governance files exist and are linked consistently.

**Decisions**

- Implement gRPC now; do not defer for release readiness.
- Use TypeDoc generated from JSDoc comments for public API docs.
- Preserve headless core boundaries; keep library-specific behavior in adapters/host.
- Keep changes small and review-gated per commit.

**Further Considerations**

1. Versioning workflow: adopt changesets now or keep manual changelog for first release and migrate later.
2. API docs publishing: commit generated docs or publish from CI to GitHub Pages.
3. Package publish scope: publish all packages together only after gRPC and parity checks are complete.
