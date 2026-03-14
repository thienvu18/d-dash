# d-dash Plugin Development Guide

This guide defines how to build adapters that conform to d-dash contracts.

## 1. Plugin Types

d-dash supports three adapter categories:

1. Datasource adapters

- Execute query requests and return normalized DataFrame results.

2. Visualization adapters

- Render widget outputs for a visualization type.

3. Grid adapters

- Render and synchronize dashboard layout behavior.

## 2. Adapter Contract Principles

1. Use only public stable interfaces.
2. Do not depend on core internals.
3. Return structured errors, not raw thrown strings.
4. Implement lifecycle cleanup.
5. Declare capabilities explicitly.

## 3. Datasource Adapter Authoring

A datasource adapter should implement:

1. id
2. getMetrics (if supported)
3. query(request, context)

Recommended behavior:

1. Validate request shape early.
2. Map transport errors to structured error codes.
3. Normalize all successful data into DataFrame arrays.
4. Return partial status when only part of query succeeds.

### 3.1 REST Adapter Notes

1. Map request envelope to HTTP request payload.
2. Support timeout and cancellation if transport allows.
3. Keep auth injection in host config, not hardcoded.

### 3.2 gRPC Adapter Notes

1. Map query envelope to protobuf request shape.
2. Handle protocol-specific status codes.
3. Normalize response payload to DataFrame.
4. Distinguish retryable and non-retryable failures.

### 3.3 VictoriaMetrics Adapter Notes

1. Support range and instant query paths.
2. Preserve labels as metadata fields when useful.
3. Normalize metric vectors/matrices to DataFrame.

## 4. Visualization Adapter Authoring

A visualization adapter should implement:

1. type
2. init (optional)
3. render or update
4. resize (recommended)
5. destroy (required)

Recommended behavior:

1. Validate options for visualization type.
2. Fail with structured error for unsupported data shapes.
3. Keep internal instances scoped to lifecycle.
4. Avoid side effects outside assigned container.

### 4.1 ECharts Adapter Notes

1. Map DataFrame fields into ECharts series/options consistently.
2. Implement update path without unnecessary full re-init.
3. Implement resize path for grid and viewport changes.

### 4.2 Text and HTML Widget Notes

1. Treat text and html as explicit visualization types.
2. HTML content must be sanitized before rendering.
3. Do not execute untrusted scripts.

## 5. Grid Adapter Authoring

A grid adapter should implement:

1. init layout
2. apply layout updates
3. emit move/resize events
4. destroy

### 5.1 Gridstack Adapter Notes

1. Map schema layout items to gridstack coordinates.
2. Keep move/resize event payloads stable and minimal.
3. Ensure teardown removes listeners and instances.

## 6. Capability Declaration

Adapters should expose capability flags such as:

1. supportsStreaming
2. supportsHtmlWidget
3. supportsResize
4. supportsAdHocFilters

Runtime can reject incompatible dashboard configurations early.

## 7. Conformance Testing

Each adapter package should include tests for:

1. happy-path execution/render behavior
2. structured error behavior
3. lifecycle cleanup
4. capability declaration accuracy
5. normalization validity (for datasource adapters)

## 8. Versioning and Compatibility

1. Stable adapter interfaces follow semver guarantees.
2. Experimental fields may change in minor releases.
3. Breaking changes require major release and migration notes.

## 9. Security Requirements

1. Never log secrets or credentials.
2. Treat external data as untrusted input.
3. Enforce sanitization for html widget rendering.
4. Use least-privilege auth configuration where possible.

## 10. Plugin Author Checklist

1. Implement only public stable interfaces.
2. Declare adapter capabilities.
3. Add contract and lifecycle tests.
4. Document options and error codes.
5. Verify compatibility with latest schema and architecture docs.
