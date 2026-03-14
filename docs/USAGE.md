# d-dash Usage Guide

This guide shows how an app integrates d-dash using the stable contracts.

## 1. Integration Overview

A host app integrates d-dash in five steps:

1. Load persisted dashboard JSON.
2. Register adapters (datasource, visualization, grid).
3. Validate and resolve dashboard runtime model.
4. Execute widgets through runtime orchestration.
5. Mount output through host UI lifecycle.

## 2. Expected Runtime Wiring

The host app should provide:

1. Adapter registrations.
2. Container lifecycle hooks (mount, resize, unmount).
3. Optional refresh policy and retry policy.
4. Optional auth/session context for datasource adapters.

## 3. Minimal Integration Flow

```ts
// Pseudocode illustrating integration shape.
const runtime = createDashboardRuntime({ registry, clock });

registry.registerDatasource(restDatasource);
registry.registerDatasource(grpcDatasource);
registry.registerDatasource(victoriaMetricsDatasource);

registry.registerVisualization(echartsTimeseriesAdapter);
registry.registerVisualization(echartsStatAdapter);
registry.registerVisualization(textWidgetAdapter);
registry.registerVisualization(htmlWidgetAdapter);

registry.registerGrid(gridstackAdapter);

const dashboard = await loadDashboardJson();
const validated = runtime.validateDashboard(dashboard);
const session = runtime.createSession(validated);

for (const widget of session.widgets) {
  const result = await runtime.executeWidget(widget.id);
  host.renderWidget(widget.id, result);
}
```

## 4. Dashboard Loading and Validation

At load time:

1. Validate schemaVersion and structural requirements.
2. Validate widget and layout cross references.
3. Validate datasource and visualization identifiers exist in registry.
4. Validate timeRange inputs.

Validation failures should be treated as non-retriable user configuration errors.

## 5. Rendering and Layout

1. Grid layout is delegated to grid adapter (for example gridstack.js).
2. Visualization rendering is delegated to visualization adapter (for example ECharts).
3. Host app remains responsible for container lifecycle.

Recommended host lifecycle:

1. mount dashboard
2. mount widgets
3. subscribe to resize/layout events
4. call adapter resize or update as needed
5. destroy adapters on unmount

## 6. Refresh and Time Range Behavior

1. Dashboard timeRange acts as default.
2. Widget timeRange can override or inherit.
3. Runtime resolves effective time range before datasource execution.

Recommended refresh pattern:

1. host sets refresh interval policy
2. runtime re-executes eligible widgets
3. adapters receive updated data via update path

## 7. Error Handling Expectations

All contract-level errors should be structured.

Host should handle at least:

1. validation errors
2. datasource execution errors
3. adapter render errors
4. capability mismatch errors

## 8. Security Notes

1. Treat HTML widget content as untrusted.
2. Apply sanitization before render.
3. Avoid leaking datasource credentials in logs/errors.

## 9. Integration Checklist

1. Register required adapters before dashboard execution.
2. Validate dashboard before creating execution session.
3. Provide resize and destroy lifecycle paths.
4. Handle structured errors consistently.
5. Verify capability compatibility for selected adapters.

## 10. Next Steps

1. See PLUGIN_DEVELOPMENT.md for writing custom adapters.
2. See SCHEMA_DESIGN.md for persisted and runtime schema constraints.
3. See ARCHITECTURE.md for ownership boundaries.
