# d-dash Contracts

This document defines contract boundaries, stability guarantees, and change rules for d-dash.

## 1. Contract Layers

d-dash uses three explicit contract layers:

1. Persisted Schema Contract
- Purpose: dashboard storage and interchange.
- Format: JSON only.
- Examples: dashboard definition, layout, widget intent, display metadata.

2. Runtime Resolved Contract
- Purpose: execution-ready model used by runtime orchestration.
- Format: TypeScript runtime objects.
- Examples: resolved timestamps, validated references, execution context.

3. Adapter Contract
- Purpose: extension interfaces for datasource, visualization, and grid adapters.
- Format: TypeScript interfaces and result envelopes.
- Examples: datasource query API, visualization lifecycle, grid event bridge.

Rule: no runtime-only fields are allowed in persisted schema.

## 2. API Stability Tiers

All exported APIs must be tagged as one of:

1. Stable
- Covered by semantic versioning guarantees.
- Breaking changes only in major releases.
- Must include migration guidance when changed.

2. Experimental
- May change in minor releases.
- Not covered by full backward-compatibility guarantees.
- Must be labeled clearly in docs and type comments.

3. Internal
- Not part of public API.
- Can change without notice.
- Must not be documented as extension points.

## 3. Versioning Policy

1. Package versioning follows semver.
2. Persisted schema has independent schemaVersion.
3. Schema migrations must be explicit and tested.
4. Stable contract changes require release notes and migration notes.

## 4. Compatibility Guarantees

For stable contracts:

1. No silent behavior changes.
2. No field meaning redefinition without migration support.
3. New fields must be additive and optional unless major release.
4. Removed or renamed fields require a major release and migration docs.

## 5. Error Contract

All runtime and adapter errors must be structured:

1. code: stable machine-readable identifier.
2. message: human-readable summary.
3. details: optional metadata for diagnostics.
4. retriable: optional hint for callers.

Rule: avoid throwing untyped string errors in public contract paths.

## 6. Adapter Feasibility Targets (v1)

The architecture must support first-party integrations without contract exceptions:

1. Grid: gridstack.js.
2. Visualization: ECharts, including text and html widget types.
3. Datasources: REST, gRPC, VictoriaMetrics.

If an adapter needs a contract exception, update this document before implementation workaround.

## 7. Contract Change Process

Any stable contract change must include:

1. Contract diff summary.
2. Updated docs across architecture/schema/usage/plugin docs.
3. Tests covering old and new behavior where applicable.
4. Migration notes.
5. Changelog entry.

## 8. Extension Boundary Rules

1. Core runtime is headless orchestration only.
2. Adapters own library-specific behavior.
3. Host app owns framework-specific mounting and lifecycle orchestration.
4. Internal runtime objects are not valid extension points.

## 9. Open-Source Governance for Contracts

1. Contract-breaking proposals require explicit reviewer approval.
2. Deprecations must precede removals unless urgent security issue.
3. Public examples must stay aligned with latest stable contracts.
4. Conformance tests are required for first-party adapter packages.
