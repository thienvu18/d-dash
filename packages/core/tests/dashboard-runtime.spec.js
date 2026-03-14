import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  createAdapterRegistry,
  createDashboardRuntime,
} from "../dist/index.js";

function makeDashboard(overrides = {}) {
  return {
    schemaVersion: 1,
    dashboardId: "system-overview",
    meta: { title: "System Overview" },
    timeRange: { type: "relative", value: "now-1h" },
    layout: [{ id: "l1", x: 0, y: 0, w: 6, h: 4 }],
    widgets: [
      {
        id: "w1",
        layoutId: "l1",
        datasource: "metrics",
        query: { metric: "cpu.usage" },
        visualization: { type: "timeseries" },
        timeRange: { type: "inherit" },
      },
    ],
    ...overrides,
  };
}

function makeTwoWidgetDashboard() {
  return {
    schemaVersion: 1,
    dashboardId: "system-overview",
    meta: { title: "System Overview" },
    timeRange: { type: "relative", value: "now-1h" },
    layout: [
      { id: "l1", x: 0, y: 0, w: 6, h: 4 },
      { id: "l2", x: 6, y: 0, w: 6, h: 4 },
    ],
    widgets: [
      {
        id: "w1",
        layoutId: "l1",
        datasource: "metrics",
        query: { metric: "cpu.usage" },
        visualization: { type: "timeseries" },
        timeRange: { type: "inherit" },
      },
      {
        id: "w2",
        layoutId: "l2",
        datasource: "metrics",
        query: { metric: "mem.usage" },
        visualization: { type: "timeseries" },
        timeRange: { type: "inherit" },
      },
    ],
  };
}

describe("createDashboardRuntime", () => {
  test("validateDashboard uses registry-known adapters", () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const result = runtime.validateDashboard(makeDashboard());

    assert.equal(result.ok, true);
  });

  test("preflightDashboard reports missing adapter registrations", () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });

    const result = runtime.preflightDashboard(
      makeDashboard({
        widgets: [
          {
            id: "w1",
            layoutId: "l1",
            datasource: "metrics",
            query: { metric: "cpu.usage" },
            visualization: { type: "timeseries" },
            timeRange: { type: "inherit" },
          },
          {
            id: "w2",
            layoutId: "l1",
            datasource: "logs",
            query: { metric: "logs.count" },
            visualization: { type: "table" },
            timeRange: { type: "inherit" },
          },
        ],
      }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(result.missingDatasources, ["logs"]);
    assert.deepEqual(result.missingVisualizations, ["table"]);
  });

  test("applyDashboardLayout maps layout items to widget ids and delegates to grid adapter", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const applyCalls = [];
    registry.registerGrid({
      id: "gridstack",
      init() {},
      applyLayout(changes, target) {
        applyCalls.push({ changes, target });
      },
      destroy() {},
    });

    const runtime = createDashboardRuntime({
      registry,
      now: () => 1_710_000_000_000,
    });
    const session = runtime.createSession(makeDashboard());
    const target = { containerEl: "div#grid" };

    await runtime.applyDashboardLayout({
      session,
      gridId: "gridstack",
      target,
    });

    assert.equal(applyCalls.length, 1);
    assert.equal(applyCalls[0].target, target);
    assert.deepEqual(applyCalls[0].changes, [
      { widgetId: "w1", x: 0, y: 0, w: 6, h: 4 },
    ]);
  });

  test("bindLayoutResize subscribes to grid changes and resizes affected widget targets", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });

    const resizedTargets = [];
    registry.registerVisualization({
      type: "timeseries",
      render() {},
      resize(target) {
        resizedTargets.push(target);
      },
    });

    let emitLayoutChange = null;
    registry.registerGrid({
      id: "gridstack",
      init() {},
      subscribeLayoutChanges(_target, handler) {
        emitLayoutChange = handler;
        return () => {
          emitLayoutChange = null;
        };
      },
      applyLayout() {},
      destroy() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const session = runtime.createSession(makeDashboard());
    const widgetTarget = { el: "widget-el" };

    const unsubscribe = await runtime.bindLayoutResize({
      session,
      gridId: "gridstack",
      gridTarget: { el: "grid-el" },
      targetByWidgetId: { w1: widgetTarget },
    });

    assert.equal(typeof emitLayoutChange, "function");
    emitLayoutChange?.([
      { widgetId: "w1", x: 1, y: 2, w: 3, h: 4 },
      { widgetId: "w1", x: 1, y: 2, w: 3, h: 5 },
    ]);

    assert.equal(resizedTargets.length, 1);
    assert.equal(resizedTargets[0], widgetTarget);

    unsubscribe();
    assert.equal(emitLayoutChange, null);
  });

  test("bindLayoutResize returns no-op unsubscribe when grid adapter lacks subscriptions", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });
    registry.registerGrid({
      id: "gridstack",
      init() {},
      applyLayout() {},
      destroy() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const session = runtime.createSession(makeDashboard());

    const unsubscribe = await runtime.bindLayoutResize({
      session,
      gridId: "gridstack",
      gridTarget: {},
      targetByWidgetId: {},
    });

    assert.doesNotThrow(() => unsubscribe());
  });

  test("preflightDashboard returns ok when all adapters are present", () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const result = runtime.preflightDashboard(makeDashboard());

    assert.equal(result.ok, true);
    assert.deepEqual(result.missingDatasources, []);
    assert.deepEqual(result.missingVisualizations, []);
  });

  test("createSession and executeWidget by id", async () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource({
      id: "metrics",
      async query() {
        return {
          status: "success",
          frames: [
            {
              fields: [
                { name: "time", type: "time", values: [100, 200] },
                { name: "cpu", type: "number", values: [10, 20] },
              ],
            },
          ],
        };
      },
    });

    let renderCount = 0;
    registry.registerVisualization({
      type: "timeseries",
      render() {
        renderCount += 1;
      },
    });

    const runtime = createDashboardRuntime({
      registry,
      now: () => 1_710_000_000_000,
    });

    const session = runtime.createSession(makeDashboard());
    const result = await runtime.executeWidget({
      session,
      widgetId: "w1",
      target: {},
      context: { traceId: "trace-runtime-1" },
    });

    assert.equal(result.status, "success");
    assert.equal(renderCount, 1);
  });

  test("executeWidget throws for unknown widget id", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const session = runtime.createSession(makeDashboard());

    await assert.rejects(
      runtime.executeWidget({
        session,
        widgetId: "missing",
        target: {},
        context: { traceId: "trace-runtime-2" },
      }),
      (error) => {
        assert.equal(error?.code, "RUNTIME_WIDGET_NOT_FOUND");
        assert.match(String(error?.message), /not found in session/);
        return true;
      },
    );
  });

  test("executeAllWidgets runs all widgets in order", async () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource({
      id: "metrics",
      async query() {
        return {
          status: "success",
          frames: [
            {
              fields: [{ name: "value", type: "number", values: [1] }],
            },
          ],
        };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const session = runtime.createSession(makeTwoWidgetDashboard());

    const results = await runtime.executeAllWidgets({
      session,
      targetByWidgetId: {
        w1: {},
        w2: {},
      },
      context: { traceId: "trace-runtime-3" },
    });

    assert.deepEqual(
      results.map((entry) => entry.widgetId),
      ["w1", "w2"],
    );
    assert.equal(results[0].result.status, "success");
    assert.equal(results[1].result.status, "success");
  });

  test("executeAllWidgets throws when a widget target is missing", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const session = runtime.createSession(makeTwoWidgetDashboard());

    await assert.rejects(
      runtime.executeAllWidgets({
        session,
        targetByWidgetId: { w1: {} },
        context: { traceId: "trace-runtime-4" },
      }),
      (error) => {
        assert.equal(error?.code, "RUNTIME_TARGET_MISSING");
        assert.match(
          String(error?.message),
          /Missing render target for widget 'w2'/,
        );
        return true;
      },
    );
  });

  test("createSession throws structured schema error for invalid dashboard", () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });

    assert.throws(
      () => {
        runtime.createSession(makeDashboard({ meta: { title: "" } }));
      },
      (error) => {
        assert.equal(error?.code, "SCHEMA_INVALID");
        return true;
      },
    );
  });

  test("discoverMetrics aggregates and deduplicates across datasources", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async getMetrics() {
        return [
          {
            id: "cpu.usage",
            name: "CPU Usage",
            unit: "percent",
            datasource: "metrics",
            supportedVisualizations: ["timeseries", "stat"],
          },
          {
            id: "cpu.usage",
            name: "CPU Usage Duplicate",
            unit: "percent",
            datasource: "metrics",
            supportedVisualizations: ["timeseries", "stat"],
          },
        ];
      },
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerDatasource({
      id: "logs",
      async getMetrics() {
        return [
          {
            id: "logs.count",
            name: "Log Count",
            unit: "count",
            datasource: "logs",
            supportedVisualizations: ["stat"],
          },
        ];
      },
      async query() {
        return { status: "success", frames: [] };
      },
    });

    const runtime = createDashboardRuntime({ registry });
    const metrics = await runtime.discoverMetrics();

    assert.deepEqual(
      metrics.map((metric) => `${metric.datasource}:${metric.id}`),
      ["metrics:cpu.usage", "logs:logs.count"],
    );
  });

  test("discoverMetrics supports datasource-specific lookup", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async getMetrics() {
        return [
          {
            id: "cpu.usage",
            name: "CPU Usage",
            unit: "percent",
            datasource: "metrics",
            supportedVisualizations: ["timeseries"],
          },
        ];
      },
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerDatasource({
      id: "logs",
      async query() {
        return { status: "success", frames: [] };
      },
    });

    const runtime = createDashboardRuntime({ registry });

    const metricsOnly = await runtime.discoverMetrics("metrics");
    const logsOnly = await runtime.discoverMetrics("logs");

    assert.equal(metricsOnly.length, 1);
    assert.equal(metricsOnly[0].datasource, "metrics");
    assert.equal(logsOnly.length, 0);
  });

  test("validateDashboardWithRegistryMetrics detects metric compatibility issues", async () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource({
      id: "metrics",
      async getMetrics() {
        return [
          {
            id: "cpu.usage",
            name: "CPU Usage",
            unit: "percent",
            datasource: "metrics",
            supportedVisualizations: ["timeseries"],
          },
        ];
      },
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });
    registry.registerVisualization({
      type: "stat",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeDashboard({
      widgets: [
        {
          id: "w1",
          layoutId: "l1",
          datasource: "metrics",
          query: { metric: "cpu.usage" },
          visualization: { type: "stat" },
          timeRange: { type: "inherit" },
        },
      ],
    });

    const result =
      await runtime.validateDashboardWithRegistryMetrics(dashboard);

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "METRIC_VISUALIZATION_MISMATCH",
      ),
    );
  });

  test("validateDashboardWithRegistryMetrics can allow unknown metrics", async () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource({
      id: "metrics",
      async getMetrics() {
        return [];
      },
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const result = await runtime.validateDashboardWithRegistryMetrics(
      makeDashboard(),
      { allowUnknownMetrics: true },
    );

    assert.equal(result.ok, true);
  });

  test("createSessionWithRegistryMetrics succeeds with discovered compatible metric", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async getMetrics() {
        return [
          {
            id: "cpu.usage",
            name: "CPU Usage",
            unit: "percent",
            datasource: "metrics",
            supportedVisualizations: ["timeseries"],
          },
        ];
      },
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({
      registry,
      now: () => 1_710_000_000_000,
    });
    const session =
      await runtime.createSessionWithRegistryMetrics(makeDashboard());

    assert.equal(session.dashboard.dashboardId, "system-overview");
    assert.equal(session.widgets.length, 1);
  });

  test("createSessionWithRegistryMetrics throws structured error on mismatch", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async getMetrics() {
        return [
          {
            id: "cpu.usage",
            name: "CPU Usage",
            unit: "percent",
            datasource: "metrics",
            supportedVisualizations: ["timeseries"],
          },
        ];
      },
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });
    registry.registerVisualization({
      type: "stat",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });

    await assert.rejects(
      runtime.createSessionWithRegistryMetrics(
        makeDashboard({
          widgets: [
            {
              id: "w1",
              layoutId: "l1",
              datasource: "metrics",
              query: { metric: "cpu.usage" },
              visualization: { type: "stat" },
              timeRange: { type: "inherit" },
            },
          ],
        }),
      ),
      (error) => {
        assert.equal(error?.code, "SCHEMA_INVALID");
        return true;
      },
    );
  });

  test("onEvent emits started and completed events for a successful executeWidget", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const events = [];
    const runtime = createDashboardRuntime({
      registry,
      now: () => 1_710_000_000_000,
      onEvent(event) {
        events.push(event);
      },
    });

    const session = runtime.createSession(makeDashboard());
    await runtime.executeWidget({
      session,
      widgetId: "w1",
      target: {},
      context: { traceId: "trace-events-1" },
    });

    assert.equal(events.length, 2);
    assert.equal(events[0].type, "widget.execute.started");
    assert.equal(events[0].widgetId, "w1");
    assert.equal(events[0].dashboardId, "system-overview");
    assert.equal(events[1].type, "widget.execute.completed");
    assert.equal(events[1].widgetId, "w1");
    assert.equal(events[1].status, "success");
    assert.ok(typeof events[1].durationMs === "number");
  });

  test("onEvent emits started and failed events when executeWidget throws", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        throw new Error("datasource down");
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const events = [];
    const runtime = createDashboardRuntime({
      registry,
      now: () => 1_710_000_000_000,
      onEvent(event) {
        events.push(event);
      },
    });

    const session = runtime.createSession(makeDashboard());

    await assert.rejects(
      runtime.executeWidget({
        session,
        widgetId: "w1",
        target: {},
        context: { traceId: "trace-events-2" },
      }),
    );

    assert.equal(events.length, 2);
    assert.equal(events[0].type, "widget.execute.started");
    assert.equal(events[1].type, "widget.execute.failed");
    assert.equal(events[1].widgetId, "w1");
    assert.ok(events[1].error instanceof Error);
    assert.ok(typeof events[1].durationMs === "number");
  });
});
