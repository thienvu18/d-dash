# d-dash Architecture

This document defines the runtime architecture and ownership boundaries for d-dash.

## 1. Architecture Goals

1. Keep core runtime headless and framework-agnostic.
2. Keep persisted schema portable and JSON-only.
3. Enable adapters for gridstack.js, ECharts (timeseries/stat/text/html/gauge/bar/pie/heatmap), REST, gRPC, and VictoriaMetrics.
4. Keep extension points stable for open-source contributors.

## 2. Layered Architecture

1. Persisted Dashboard Layer

- Source: JSON dashboard definition.
- Responsibility: store user intent only.

2. Core Runtime Layer

- Responsibility: parse, validate, resolve, orchestrate, normalize.
- No chart/grid/framework imports.

3. Adapter Layer

- Datasource adapters: execute queries and return normalized frames.
- Visualization adapters: render/update/destroy visual outputs.
- Grid adapter: map layout contract to layout engine and events.

4. Host App Layer

- Responsibility: container creation, framework integration, app lifecycle.
- Chooses adapters and wires runtime execution to UI lifecycle.

## 3. Ownership Boundaries

1. Core owns:

- schema validation
- time-range resolution
- registry lookup and compatibility checks
- widget execution orchestration
- normalized runtime events and errors

2. Adapters own:

- library-specific integrations
- transport and protocol specifics
- render lifecycle for specific visualization targets
- grid engine behavior and event bridging

3. Host app owns:

- UI framework mount/update/unmount
- auth/session wiring for datasource clients
- policy decisions (refresh cadence, retry strategy, feature flags)

Rule: if logic depends on a specific external library API, it belongs in an adapter or host app, not core.

## 4. Runtime Execution Flow

1. Load persisted dashboard JSON.
2. Validate schema and references.
3. Resolve dashboard and widget effective time ranges.
4. Build execution context for each widget.
5. Resolve datasource adapter and execute query.
6. Normalize response to DataFrame contract.
7. Resolve visualization adapter for widget type.
8. Delegate render intent to host plus adapter lifecycle.
9. Track status/error events for observability.

## 5. Adapter Lifecycle Contract

All adapter types should follow explicit lifecycle patterns.

1. init

- Optional one-time setup.

2. execute or render

- Datasource: execute query.
- Visualization: render or update output.
- Grid: apply layout and sync events.

3. resize or reconcile

- Visualization and grid adapters should handle host resize/layout changes.

4. destroy

- Required cleanup path to avoid memory leaks.

## 6. Capability Model

Adapters should declare capabilities so runtime can pre-validate compatibility.

Examples:

1. Datasource capabilities

- supportsStreaming
- supportsAdHocFilters
- supportsMetadataDiscovery

2. Visualization capabilities

- supportsTimeSeries
- supportsStat
- supportsTextWidget
- supportsHtmlWidget
- supportsTheming
- supportsGauge (`@experimental`)
- supportsBar (`@experimental`)
- supportsPie (`@experimental`)
- supportsHeatmap (`@experimental`)
- supportsTable (`@experimental`)

3. Grid capabilities

- supportsDrag
- supportsResize
- supportsResponsiveBreakpoints

## 7. Target Adapter Fit

### 7.1 gridstack.js

Expected mapping:

1. Persisted layout item to gridstack widget position.
2. Grid move/resize events to host callbacks.
3. Cleanup through explicit destroy path.

### 7.2 ECharts

Expected mapping:

1. DataFrame fields to ECharts series/options.
2. Update path for data refresh and option change.
3. Resize path wired to container/grid events.
4. Text/HTML widget types implemented as visualization variants.

First-party ECharts adapters:
- `timeseries` — line chart with time x-axis
- `stat` — single-value gauge display
- `text` — static text card
- `html` — sanitized HTML content
- `gauge` — configurable gauge with min/max/thresholds (`@experimental`)
- `bar` — vertical/horizontal bar chart with optional stacking/thresholds (`@experimental`)
- `pie` — pie or donut chart (`@experimental`)
- `heatmap` — time × category heatmap with visualMap (`@experimental`)

Crosshair sync: set `EChartsTarget.group` to a shared name and call
`connectEChartsGroup(echarts, groupName)` after all adapters are initialised.
(`@experimental`)

### 7.3 REST Datasource

Expected mapping:

1. Query envelope to HTTP request.
2. Response envelope to DataFrame normalization.
3. Structured error mapping.

### 7.4 gRPC Datasource

Expected mapping:

1. Query envelope to gRPC request.
2. Protocol payload to DataFrame normalization.
3. Structured error mapping and retry hints.

### 7.5 VictoriaMetrics Datasource

Expected mapping:

1. Query model to VictoriaMetrics query API.
2. Timeseries labels/values to DataFrame fields.
3. Range/instant query compatibility handling.

## 8. Security and Safety Boundaries

1. HTML widget rendering must be treated as untrusted input.
2. Sanitization policy must be defined before HTML widget support is enabled.
3. Datasource adapters must avoid exposing credentials in logs or errors.

## 9. Observability and Diagnostics

Core runtime should emit structured execution events:

1. validation.started and validation.failed
2. widget.query.started and widget.query.completed
3. widget.render.started and widget.render.failed
4. adapter.error with stable error code

These events support debugging and plugin conformance checks.

## 10. Non-Goals for Core Runtime

1. Core does not implement UI framework rendering primitives.
2. Core does not embed chart or grid library behavior.
3. Core does not own application auth/session state.

## 11. Evolution Rules

1. Stable boundaries in this document must align with CONTRACTS.md.
2. Changes to stable architecture contracts require migration and changelog updates.
3. New adapter features should be additive when possible.
