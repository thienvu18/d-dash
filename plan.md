## Plan: d-dash Contract-First Foundation

Build a documentation-first, contract-first foundation for d-dash before coding runtime features. The goal is to ensure the architecture can easily support adapters for gridstack.js, ECharts (including text/html widget types), REST, gRPC, and VictoriaMetrics while keeping extension points open for external contributors.

**Steps**
1. Phase 1: Contract Baseline (blocks all implementation)
Define and approve stable contract boundaries for persisted schema, runtime resolved model, datasource adapter API, visualization adapter API, grid adapter API, registry behavior, and error model. Mark API tiers as stable/experimental/internal.
2. Phase 1: Commit 1 docs only (parallel-safe with review prep)
Create `docs/CONTRACTS.md` and `docs/CODE_RULES.md` with versioning policy, compatibility rules, deprecation policy, contract change requirements, and coding rules for strong APIs.
3. Phase 2: Architecture Spec (depends on 1)
Create `docs/ARCHITECTURE.md` defining headless core orchestration, adapter boundaries, lifecycle hooks, capability negotiation, and ownership rules (core vs adapter vs host app).
4. Phase 2: Schema Spec (depends on 1)
Create `docs/SCHEMA_DESIGN.md` defining persisted dashboard schema and separate runtime-resolved schema, invariants, migration approach, validation rules, and JSON-only persistence constraints.
5. Phase 2: Integrator and plugin docs (parallel with 3 and 4 once baseline is approved)
Create `docs/USAGE.md` for app integrators and `docs/PLUGIN_DEVELOPMENT.md` for adapter authors, including conformance expectations for gridstack.js, ECharts, REST, gRPC, and VictoriaMetrics adapters.
6. Phase 3: Review and freeze docs (depends on 2-5)
Run final doc consistency review so all terms/types match across files. Freeze v1 contract vocabulary before scaffolding packages.
7. Phase 4: Implementation preparation (depends on 6)
Only after docs are approved, scaffold repo/package layout and begin small implementation commits in isolated slices (core contracts, validation, registry, time resolver, runtime flow, adapters).

**Relevant files**
- `/Users/thienvu/Library/Application Support/Code/User/workspaceStorage/2946ded0d0d99c7d45d7a5f23c48d70b/GitHub.copilot-chat/memory-tool/memories/YmEyOTk1ZmUtNDc5Ny00MTE1LThhOGItZjNiNmY2OTVjMDEz/plan.md` — source-of-truth plan for this session
- `docs/CONTRACTS.md` — API stability tiers, versioning, compatibility guarantees
- `docs/CODE_RULES.md` — coding and contract-change guardrails
- `docs/ARCHITECTURE.md` — system boundaries and adapter lifecycle
- `docs/SCHEMA_DESIGN.md` — persisted vs runtime schemas and invariants
- `docs/USAGE.md` — app integration guide
- `docs/PLUGIN_DEVELOPMENT.md` — plugin authoring and conformance guide

**Verification**
1. Contract integrity check: every stable contract in `docs/CONTRACTS.md` appears consistently in `docs/ARCHITECTURE.md` and `docs/SCHEMA_DESIGN.md`.
2. Adapter feasibility check: each target integration (gridstack.js, ECharts text/html, REST, gRPC, VictoriaMetrics) has explicit mapping and lifecycle requirements documented.
3. Governance check: breaking-change and migration policy is documented before any runtime implementation commit.
4. Documentation usability check: examples in `docs/USAGE.md` and `docs/PLUGIN_DEVELOPMENT.md` are coherent and implementable.

**Decisions**
- Do not edit `idea.md` in this phase.
- Keep commits small and approval-gated after each commit.
- Prioritize adapter-friendly contracts and architecture clarity over implementation speed.
- Keep architecture open for third-party ecosystem while validating first-party target integrations.

**Further Considerations**
1. Capability model recommendation: define explicit adapter capabilities (for example streaming support, html widget support, resize handling) to prevent runtime surprises.
2. Security recommendation: define html-widget sanitization policy in architecture and plugin docs before implementation.
3. Agent continuity requirement: after any context compaction, read `/Users/thienvu/Library/Application Support/Code/User/workspaceStorage/2946ded0d0d99c7d45d7a5f23c48d70b/GitHub.copilot-chat/memory-tool/memories/YmEyOTk1ZmUtNDc5Ny00MTE1LThhOGItZjNiNmY2OTVjMDEz/plan.md` (if missing read `plan.md` in workspace) first, then read all docs before action.