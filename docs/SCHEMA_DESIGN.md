# d-dash Schema Design

This document defines persisted dashboard schema, runtime-resolved schema, validation invariants, and schema evolution rules.

## 1. Design Principles

1. Persisted schema is JSON-only and stores intent.
2. Runtime schema is execution-ready and stores resolved values.
3. Persisted and runtime contracts must not be mixed.
4. Schema evolution must be explicit and migration-safe.

## 2. Persisted Schema (Storage and Interchange)

## 2.1 Top-Level Dashboard Shape

Required fields:

1. schemaVersion
2. dashboardId
3. meta.title
4. timeRange
5. layout
6. widgets

Optional fields:

1. meta.description
2. meta.tags
3. meta.folder

Example shape:

```json
{
  "schemaVersion": 1,
  "dashboardId": "system-overview",
  "meta": {
    "title": "System Overview",
    "description": "Primary SRE dashboard",
    "tags": ["infra", "prod"]
  },
  "timeRange": { "type": "relative", "value": "now-6h" },
  "layout": [{ "id": "w1", "x": 0, "y": 0, "w": 6, "h": 4 }],
  "widgets": []
}
```

## 2.2 Persisted Widget Shape

Required fields:

1. id
2. layoutId
3. datasource
4. query
5. visualization

Optional fields:

1. display.title
2. display.description
3. timeRange (widget override)
4. options

Rule: id is stable identity, display.title is mutable presentation text.

Example shape:

```json
{
  "id": "cpu_widget",
  "layoutId": "w1",
  "display": {
    "title": "CPU Usage"
  },
  "datasource": "metrics",
  "query": {
    "metric": "cpu.usage",
    "filters": { "host": "*" }
  },
  "timeRange": { "type": "inherit" },
  "visualization": {
    "type": "timeseries"
  },
  "options": {
    "legend": true,
    "unit": "percent"
  }
}
```

## 2.3 Persisted Time Range Input

Supported authoring forms:

1. inherit
2. relative
3. absolute

Example:

```json
{ "type": "inherit" }
```

```json
{ "type": "relative", "value": "now-1h" }
```

```json
{ "type": "absolute", "from": 1710000000000, "to": 1710003600000 }
```

Rule: persisted schema never stores resolved timestamps for relative or inherit values.

## 3. Runtime-Resolved Schema (Execution)

Runtime contracts are not persisted.

## 3.1 Resolved Time Range

Runtime shape:

1. from (epoch milliseconds)
2. to (epoch milliseconds)
3. source (dashboard or widget)

## 3.2 Resolved Widget Execution Request

Runtime shape:

1. dashboardId
2. widgetId
3. datasourceId
4. query
5. resolvedTimeRange
6. context (traceId, abort signal, optional feature flags)

## 3.3 Datasource Result Envelope

Runtime shape:

1. status (success, partial, error)
2. frames (DataFrame array)
3. warnings (optional)
4. error (structured error, optional)

## 4. DataFrame Contract

DataFrame fields should use bounded types.

Field shape:

1. name
2. type (time, number, string, boolean)
3. values (typed scalar array with nullable support)
4. labels (optional map)

Rule: avoid unbounded any values in stable contracts.

## 5. Validation Invariants

A dashboard is valid only if all conditions are true:

1. schemaVersion is recognized.
2. dashboardId is non-empty.
3. layout ids are unique.
4. widget ids are unique.
5. each widget.layoutId exists in layout.
6. each widget.datasource exists in registry at runtime load.
7. each widget.visualization.type exists in registry at runtime load.
8. metric and visualization compatibility check passes when metric metadata exists.
9. timeRange inputs are structurally valid.

## 6. Compatibility and Extensibility

1. New persisted fields must be additive and optional in minor versions.
2. Required-field additions are major-version changes.
3. Widget and visualization variants should use discriminated unions.
4. Unknown optional fields should be preserved when possible for forward compatibility.

## 7. Migration Strategy

1. Persisted schema includes schemaVersion.
2. Every version bump requires explicit migration path.
3. Migrations should be pure transforms from old schema to new schema.
4. Migration tests are required for each supported upgrade path.

## 8. Security and Safety Rules

1. HTML widget content is untrusted by default.
2. Sanitization policy must be enforced in rendering layer.
3. Persisted schema must not include executable code.

## 9. Relationship to Other Docs

1. Contract guarantees are defined in CONTRACTS.md.
2. Runtime boundaries are defined in ARCHITECTURE.md.
3. Usage patterns are defined in USAGE.md.
4. Plugin implementation details are defined in PLUGIN_DEVELOPMENT.md.
