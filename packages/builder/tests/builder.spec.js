import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { DashboardBuilder, WidgetBuilder } from "../dist/index.js";

describe("DashboardBuilder", () => {
  test("creates a valid dashboard", () => {
    const dashboard = new DashboardBuilder("dash-1")
      .title("My Dashboard")
      .description("Metrics everywhere")
      .tenant("team-a")
      .timeRange({ type: "relative", value: "now-6h" })
      .addVariable({ type: "textbox", name: "search", default: "" })
      .addWidget(
        new WidgetBuilder("w1", "l1")
          .datasource("metrics-ds")
          .query("cpu_usage_total", { env: "prod" })
          .visualization("timeseries")
          .display("CPU Usage")
      )
      .addLayoutItem({ id: "l1", w: 12, h: 4, x: 0, y: 0 })
      .build();

    assert.equal(dashboard.dashboardId, "dash-1");
    assert.equal(dashboard.meta.title, "My Dashboard");
    assert.equal(dashboard.meta.description, "Metrics everywhere");
    assert.equal(dashboard.meta.tenant, "team-a");
    assert.deepEqual(dashboard.timeRange, { type: "relative", value: "now-6h" });
    
    assert.equal(dashboard.variables?.length, 1);
    assert.equal(dashboard.variables?.[0].name, "search");

    assert.equal(dashboard.widgets.length, 1);
    assert.equal(dashboard.widgets[0].id, "w1");
    assert.equal(dashboard.widgets[0].datasource, "metrics-ds");
    assert.equal(dashboard.widgets[0].display?.title, "CPU Usage");
    assert.deepEqual(dashboard.widgets[0].query, { metric: "cpu_usage_total", filters: { env: "prod" } });

    assert.equal(dashboard.layout.length, 1);
    assert.equal(dashboard.layout[0].id, "l1");
  });

  test("throws if missing required meta title", () => {
    const builder = new DashboardBuilder("dash-1");
    assert.throws(() => builder.build(), /must have a title/);
  });
});

describe("WidgetBuilder", () => {
  test("throws if mission required fields", () => {
    const builder = new WidgetBuilder("w1", "l1");
    assert.throws(() => builder.build(), /missing required fields/);
  });

  test("builds raw widget format", () => {
    const widget = new WidgetBuilder("w1", "l1")
      .datasource("ds")
      .query("metric")
      .visualization("stat")
      .options({ threshold: 50 })
      .build();

    assert.deepEqual(widget, {
      id: "w1",
      layoutId: "l1",
      datasource: "ds",
      query: { metric: "metric", filters: undefined },
      visualization: { type: "stat" },
      display: undefined,
      timeRange: undefined,
      options: { threshold: 50 }
    });
  });
});
