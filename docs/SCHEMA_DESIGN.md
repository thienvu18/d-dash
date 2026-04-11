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
4. meta.tenant
5. variables (`@experimental`)
6. extensions

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

## 2.3 Persisted Widget `visualization.type` Values

The `visualization.type` field is a string discriminator.  Recognized named values:

| Value          | Status       | Description                      |
|----------------|--------------|----------------------------------|
| `timeseries`   | stable       | Line/area time series chart      |
| `table`        | stable       | Data table                       |
| `text`         | stable       | Markdown / plain-text panel      |
| `html`         | stable       | Raw HTML panel                   |
| `gauge`        | experimental | Gauge / needle chart             |
| `bar`          | experimental | Vertical bar chart               |
| `pie`          | experimental | Pie / donut chart                |
| `heatmap`      | experimental | Heat-map matrix                  |

Any other string is treated as an unknown kind and forwarded to registered adapters unchanged (open extensibility).

## 2.4 Template Variables (`@experimental`)

Optional top-level `variables` array.  Defines variables that are substituted
into widget query filter string values using the `$variableName` syntax at
execution time.

Supported variable types:

| type       | Required fields                    | Optional fields               |
|------------|------------------------------------|-------------------------------|
| `custom`   | `name`, `options` (string array)   | `label`, `default`, `multi`   |
| `query`    | `name`, `datasource`, `query`      | `label`, `multi`              |
| `textbox`  | `name`                             | `label`, `default`            |

Example:

```json
{
  "variables": [
    {
      "type": "custom",
      "name": "host",
      "label": "Host",
      "options": ["web-1", "web-2", "db-1"],
      "default": "web-1"
    },
    {
      "type": "query",
      "name": "env",
      "label": "Environment",
      "datasource": "metrics",
      "query": "environments"
    },
    {
      "type": "textbox",
      "name": "search",
      "label": "Search",
      "default": ""
    }
  ]
}
```

Variable reference in widget query filters:

```json
{ "filters": { "host": "$host", "env": "$env", "search": "$search" } }
```

Validation rules:

1. `name` must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`.
2. Variable names must be unique within the dashboard.
3. `custom` requires a non-empty `options` array.
4. `query` requires non-empty `datasource` and `query` strings.
5. `query.datasource` must reference a known datasource when checked at runtime.
6. `query` variable queries can contain `$variableName` syntax to enable chained variable resolution.

## 2.5 Persisted Time Range Input

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
4. query (with filter values substituted when `resolvedVariables` is present)
5. resolvedTimeRange
6. context (traceId, abort signal, optional feature flags, optional `resolvedVariables`)

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
10. variable names match `/^[a-zA-Z_][a-zA-Z0-9_]*$/` and are unique.
11. `custom` variables have a non-empty `options` array.
12. `query` variables have non-empty `datasource` and `query` strings, and the datasource is registered.

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
