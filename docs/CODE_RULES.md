# d-dash Code Rules

This document defines coding rules for contract safety, maintainability, and adapter consistency.

## 1. Contract Safety Rules

1. Do not use any in stable contracts.
2. Prefer bounded JSON-safe unions for persisted payloads.
3. Use discriminated unions for typed widget and visualization variants.
4. Keep persisted schema and runtime resolved types separate.
5. Public interfaces must be documented with intent and constraints.

## 2. Core Runtime Rules

1. Core must stay headless and framework-agnostic.
2. Core must not import chart, grid, or UI framework libraries.
3. Core handles parse, validate, resolve, orchestrate, and normalize only.
4. Rendering details live in visualization or grid adapters.

## 3. Adapter Rules

1. Adapters implement only public adapter interfaces.
2. Adapters must declare capabilities explicitly.
3. Adapters must implement lifecycle cleanup to avoid leaks.
4. Adapter errors must follow the shared structured error contract.
5. Adapters must include conformance tests.

## 4. Error and Logging Rules

1. Use typed error codes for user-visible or contract-level failures.
2. Do not throw raw strings.
3. Include actionable context in error details.
4. Keep logs concise and avoid leaking secrets.

## 5. Testing Rules

1. Add unit tests for business logic changes.
2. Add contract tests for stable API changes.
3. Add migration tests for schema version transitions.
4. Keep adapter tests focused on contract behavior.

## 6. Change Management Rules

1. Stable contract changes require migration notes and changelog updates.
2. Prefer additive changes over breaking changes.
3. Breaking changes are major-version only.
4. Experimental APIs must be labeled clearly.

## 7. Documentation Rules

1. Keep architecture, schema, usage, and plugin docs aligned.
2. Update docs in the same change when contract behavior changes.
3. Use clear examples that can be implemented without hidden assumptions.

## 8. Security Rules

1. Treat html widget rendering as untrusted by default.
2. Require explicit sanitization policy for html content.
3. Avoid unsafe defaults in datasource transport and auth handling.

## 9. Style Rules

1. Keep code comments concise and intent-focused.
2. Avoid broad refactors in contract-focused commits.
3. Preserve backward compatibility where promised by stability tier.
