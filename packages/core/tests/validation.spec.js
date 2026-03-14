import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  toSchemaValidationError,
  validatePersistedDashboard,
} from "../dist/validation.js";

function makeDashboard() {
  return {
    schemaVersion: 1,
    dashboardId: "system-overview",
    meta: { title: "System Overview" },
    timeRange: { type: "relative", value: "now-6h" },
    layout: [{ id: "w1", x: 0, y: 0, w: 6, h: 4 }],
    widgets: [
      {
        id: "cpu_widget",
        layoutId: "w1",
        datasource: "metrics",
        query: { metric: "cpu.usage", filters: { host: "*" } },
        visualization: { type: "timeseries" },
        timeRange: { type: "inherit" },
      },
    ],
  };
}

describe("validatePersistedDashboard", () => {
  test("returns ok for valid dashboard", () => {
    const dashboard = makeDashboard();

    const result = validatePersistedDashboard(dashboard, {
      knownDatasources: ["metrics"],
      knownVisualizations: ["timeseries", "stat"],
      knownMetrics: [
        {
          id: "cpu.usage",
          name: "CPU Usage",
          unit: "percent",
          datasource: "metrics",
          supportedVisualizations: ["timeseries", "stat"],
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
  });

  test("reports duplicate ids and bad references", () => {
    const dashboard = makeDashboard();
    dashboard.layout.push({ id: "w1", x: 0, y: 4, w: 6, h: 4 });
    dashboard.widgets.push({
      id: "cpu_widget",
      layoutId: "missing_layout",
      datasource: "unknown",
      query: { metric: "unknown.metric" },
      visualization: { type: "unknown_viz" },
    });

    const result = validatePersistedDashboard(dashboard, {
      knownDatasources: ["metrics"],
      knownVisualizations: ["timeseries"],
      knownMetrics: [
        {
          id: "cpu.usage",
          name: "CPU Usage",
          unit: "percent",
          datasource: "metrics",
          supportedVisualizations: ["timeseries"],
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_LAYOUT_ID"));
    assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_WIDGET_ID"));
    assert.ok(result.issues.some((issue) => issue.code === "LAYOUT_REF_NOT_FOUND"));
    assert.ok(result.issues.some((issue) => issue.code === "DATASOURCE_NOT_FOUND"));
    assert.ok(result.issues.some((issue) => issue.code === "VISUALIZATION_NOT_FOUND"));
    assert.ok(result.issues.some((issue) => issue.code === "METRIC_NOT_FOUND"));
  });

  test("reports metric and visualization mismatch", () => {
    const dashboard = makeDashboard();
    dashboard.widgets[0].visualization.type = "stat";

    const result = validatePersistedDashboard(dashboard, {
      knownDatasources: ["metrics"],
      knownVisualizations: ["timeseries", "stat"],
      knownMetrics: [
        {
          id: "cpu.usage",
          name: "CPU Usage",
          unit: "percent",
          datasource: "metrics",
          supportedVisualizations: ["timeseries"],
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "METRIC_VISUALIZATION_MISMATCH",
      ),
    );
  });

  test("converts failing validation result to structured schema error", () => {
    const dashboard = makeDashboard();
    dashboard.dashboardId = "";

    const result = validatePersistedDashboard(dashboard);
    const error = toSchemaValidationError(result);

    assert.equal(result.ok, false);
    assert.ok(error);
    assert.equal(error?.code, "SCHEMA_INVALID");
    assert.equal(error?.retriable, false);
  });
});
