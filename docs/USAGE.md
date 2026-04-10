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

// Register all ECharts adapters (timeseries, stat, text, html, gauge, bar, pie, heatmap).
for (const adapter of createEChartsAdapters({ echarts })) {
  registry.registerVisualization(adapter);
}

// Register the DOM-based table adapter.
registry.registerVisualization(createTableAdapter());

registry.registerGrid(gridstackAdapter);

const dashboard = await loadDashboardJson();
const session = runtime.createSession(dashboard);

// Register render targets for all widgets upfront.
runtime.registerWidgetTargets({ w1: el1, w2: el2 });

// Apply layout, execute all widgets, bind resize in one call.
const { unmount } = await runtime.mountDashboard({
  session,
  gridId: "gridstack",
  gridTarget,
  context: { traceId: "my-trace" },
});
```

## 4. Dashboard Loading and Validation

At load time:

1. Validate schemaVersion and structural requirements.
2. Validate widget and layout cross references.
3. Validate datasource and visualization identifiers exist in registry.
4. Validate timeRange inputs.
5. Optionally validate template variable definitions.

Validation failures should be treated as non-retriable user configuration errors.

## 5. Rendering and Layout

1. Grid layout is delegated to grid adapter (for example gridstack.js).
2. Visualization rendering is delegated to visualization adapter (for example ECharts).
3. Host app remains responsible for container lifecycle.

Recommended host lifecycle:

1. mount dashboard
2. mount widgets
3. bind grid layout changes to visualization resize via runtime
4. call adapter resize directly only for host-specific events
5. destroy adapters on unmount

## 6. Template Variables (`@experimental`)

Template variables substitute `$variableName` tokens in widget query filters at execution time.

### Defining variables in the dashboard schema

```json
{
  "schemaVersion": 1,
  "dashboardId": "my-dashboard",
  "variables": [
    { "type": "custom", "name": "host", "options": ["web-1", "web-2"], "default": "web-1" },
    { "type": "query",  "name": "env",  "datasource": "metrics", "query": "environments" },
    { "type": "textbox","name": "search", "default": "" }
  ],
  "widgets": [
    {
      "id": "w1",
      "datasource": "metrics",
      "query": { "metric": "cpu.usage", "filters": { "host": "$host", "env": "$env" } },
      "visualization": { "type": "timeseries" }
    }
  ]
}
```

### Resolving and using variables at runtime

```ts
const session = runtime.createSession(dashboard);

// Resolve initial variable values (custom/textbox use defaults; query executes datasource).
const resolvedVariables = await runtime.resolveVariables(session);
session.resolvedVariables = resolvedVariables;

// Execute widgets — filters will have $host and $env substituted automatically.
const context = { traceId: "trace-1", resolvedVariables };
await runtime.executeAllWidgets({ session, context });
```

### Updating variables (triggering re-render)

```ts
const bound = runtime.createBoundSession(session);
bound.registerWidgetTargets({ w1: el1, w2: el2 });

// Re-executes all widgets with the new host value.
await bound.updateVariables({ host: "web-2" }, { traceId: "trace-2" });
```

## 7. Crosshair Sync (`@experimental`)

ECharts tooltip crosshairs can be linked across all panels in a dashboard by assigning
the same group name to every `EChartsTarget` and then calling `connectEChartsGroup`.

```ts
import { createEChartsAdapters, connectEChartsGroup } from "@d-dash/adapter-echarts";
import * as echarts from "echarts";

// Register adapters.
for (const adapter of createEChartsAdapters({ echarts })) {
  registry.registerVisualization(adapter);
}

// Pass the same group name on every target.
runtime.registerWidgetTargets({
  w1: { el: el1, group: "dashboard-1" },
  w2: { el: el2, group: "dashboard-1" },
});

await runtime.mountDashboard({ session, gridId: "gridstack", gridTarget, context });

// Connect charts after all are initialised.
connectEChartsGroup(echarts, "dashboard-1");
```

## 8. Session Snapshot / Serialization (`@experimental`)

Capture a point-in-time snapshot of a session and its widget data for sharing or
offline viewing.

```ts
// After executing all widgets:
const widgetData: Record<string, DataFrame[]> = {};
for (const { widgetId, result } of widgetResults) {
  widgetData[widgetId] = result.frames;
}

const snapshot = runtime.serializeSession(session, widgetData);
const json = JSON.stringify(snapshot); // persist or share

// Later, restore the session (no re-execution needed):
const restored = runtime.restoreSnapshot(JSON.parse(json));
```

## 9. Visualization Kinds Reference

| Kind          | Package                     | Status      | Notes                                       |
|---------------|-----------------------------|-------------|---------------------------------------------|
| `timeseries`  | `@d-dash/adapter-echarts`   | Stable      | Line chart with time x-axis.                |
| `stat`        | `@d-dash/adapter-echarts`   | Stable      | Single-value gauge display.                 |
| `text`        | `@d-dash/adapter-echarts`   | Stable      | Static text/subtitle card.                  |
| `html`        | `@d-dash/adapter-echarts`   | Stable      | Sanitized HTML content widget.              |
| `gauge`       | `@d-dash/adapter-echarts`   | Experimental| Full ECharts gauge with min/max/thresholds. |
| `bar`         | `@d-dash/adapter-echarts`   | Experimental| Vertical or horizontal bar chart.           |
| `pie`         | `@d-dash/adapter-echarts`   | Experimental| Pie or donut chart.                         |
| `heatmap`     | `@d-dash/adapter-echarts`   | Experimental| Time × category heatmap.                    |
| `table`       | `@d-dash/adapter-table`     | Experimental| DOM-based sortable/paginated table.         |


Preferred runtime bridge:

```ts
// Register render targets before applying layout.
runtime.registerWidgetTargets({ w1: widgetEl1, w2: widgetEl2 });

// Apply the grid layout — stores the grid entry internally.
await runtime.applyDashboardLayout({ session, gridId: "gridstack", target: gridTarget });

// Subscribe grid layout changes to visualization resize.
const unbind = await runtime.bindLayoutResize(session);

// later on unmount
unbind();
```

Or use the single-call convenience:

```ts
runtime.registerWidgetTargets({ w1: widgetEl1, w2: widgetEl2 });

const { unmount } = await runtime.mountDashboard({
  session,
  gridId: "gridstack",
  gridTarget,
  context,
});

// later on unmount
unmount();
```

This keeps host wiring thin while preserving headless core boundaries.

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
