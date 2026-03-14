import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  buildWidgetExecutionRequest,
  createAdapterRegistry,
  executeWidget,
  executeWidgetQuery,
  executeWidgetRender,
} from "../dist/index.js";

function makeWidget(overrides = {}) {
  return {
    id: "w1",
    layoutId: "l1",
    datasource: "metrics",
    query: { metric: "cpu.usage", filters: { host: "api-1" } },
    visualization: { type: "timeseries" },
    timeRange: { type: "inherit" },
    ...overrides,
  };
}

describe("buildWidgetExecutionRequest", () => {
  test("inherits dashboard time range by default", () => {
    const dashboardTimeRange = { from: 100, to: 200, source: "dashboard" };
    const request = buildWidgetExecutionRequest({
      dashboardId: "system-overview",
      widget: makeWidget(),
      dashboardTimeRange,
      context: { traceId: "trace-1" },
    });

    assert.equal(request.dashboardId, "system-overview");
    assert.equal(request.widgetId, "w1");
    assert.equal(request.datasourceId, "metrics");
    assert.equal(request.context.traceId, "trace-1");
    assert.equal(request.resolvedTimeRange, dashboardTimeRange);
  });

  test("resolves widget relative override", () => {
    const now = 1_710_000_000_000;
    const request = buildWidgetExecutionRequest({
      dashboardId: "system-overview",
      widget: makeWidget({ timeRange: { type: "relative", value: "now-15m" } }),
      dashboardTimeRange: {
        from: now - 24 * 60 * 60 * 1000,
        to: now,
        source: "dashboard",
      },
      context: { traceId: "trace-2" },
      now,
    });

    assert.equal(request.resolvedTimeRange.from, now - 15 * 60 * 1000);
    assert.equal(request.resolvedTimeRange.to, now);
    assert.equal(request.resolvedTimeRange.source, "widget");
  });
});

describe("executeWidgetQuery", () => {
  test("executes datasource query with mapped request", async () => {
    const registry = createAdapterRegistry();

    const seen = [];
    registry.registerDatasource({
      id: "metrics",
      async query(request, context) {
        seen.push({ request, context });
        return {
          status: "success",
          frames: [],
        };
      },
    });

    const result = await executeWidgetQuery(registry, {
      dashboardId: "system-overview",
      widgetId: "w1",
      datasourceId: "metrics",
      query: { metric: "cpu.usage", filters: { host: "api-1" } },
      visualization: { type: "timeseries" },
      resolvedTimeRange: { from: 100, to: 200, source: "dashboard" },
      context: { traceId: "trace-3" },
    });

    assert.equal(result.status, "success");
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].request, {
      metric: "cpu.usage",
      filters: { host: "api-1" },
      timeRange: { from: 100, to: 200, source: "dashboard" },
    });
    assert.equal(seen[0].context.traceId, "trace-3");
  });

  test("throws when datasource adapter is missing", async () => {
    const registry = createAdapterRegistry();

    await assert.rejects(
      executeWidgetQuery(registry, {
        dashboardId: "system-overview",
        widgetId: "w1",
        datasourceId: "missing",
        query: { metric: "cpu.usage" },
        visualization: { type: "timeseries" },
        resolvedTimeRange: { from: 100, to: 200, source: "dashboard" },
        context: { traceId: "trace-4" },
      }),
      /No registered datasource adapter found/,
    );
  });

  test("throws when datasource returns invalid frame payload", async () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource({
      id: "metrics",
      async query() {
        return {
          status: "success",
          frames: [
            {
              fields: [
                {
                  name: "cpu",
                  type: "number",
                  values: ["bad-value"],
                },
              ],
            },
          ],
        };
      },
    });

    await assert.rejects(
      executeWidgetQuery(registry, {
        dashboardId: "system-overview",
        widgetId: "w1",
        datasourceId: "metrics",
        query: { metric: "cpu.usage" },
        visualization: { type: "timeseries" },
        resolvedTimeRange: { from: 100, to: 200, source: "dashboard" },
        context: { traceId: "trace-5" },
      }),
      /DataField.values contains invalid scalar value/,
    );
  });

  test("throws when partial result misses structured error", async () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource({
      id: "metrics",
      async query() {
        return {
          status: "partial",
          frames: [],
        };
      },
    });

    await assert.rejects(
      executeWidgetQuery(registry, {
        dashboardId: "system-overview",
        widgetId: "w1",
        datasourceId: "metrics",
        query: { metric: "cpu.usage" },
        visualization: { type: "timeseries" },
        resolvedTimeRange: { from: 100, to: 200, source: "dashboard" },
        context: { traceId: "trace-6" },
      }),
      /must include a structured error/,
    );
  });

  test("throws when datasource capability rejects ad-hoc filters", async () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource({
      id: "metrics",
      capabilities: {
        supportsAdHocFilters: false,
      },
      async query() {
        return {
          status: "success",
          frames: [],
        };
      },
    });

    await assert.rejects(
      executeWidgetQuery(registry, {
        dashboardId: "system-overview",
        widgetId: "w1",
        datasourceId: "metrics",
        query: { metric: "cpu.usage", filters: { host: "api-1" } },
        visualization: { type: "timeseries" },
        resolvedTimeRange: { from: 100, to: 200, source: "dashboard" },
        context: { traceId: "trace-6b" },
      }),
      /does not support ad-hoc filters/,
    );
  });
});

describe("executeWidgetRender", () => {
  test("executes visualization render with mapped request", async () => {
    const registry = createAdapterRegistry();

    const seen = [];
    registry.registerVisualization({
      type: "timeseries",
      render(request, target) {
        seen.push({ request, target });
      },
    });

    const target = { nodeId: "widget-node-1" };
    await executeWidgetRender(registry, {
      request: {
        dashboardId: "system-overview",
        widgetId: "w1",
        datasourceId: "metrics",
        query: { metric: "cpu.usage" },
        visualization: { type: "timeseries" },
        resolvedTimeRange: { from: 100, to: 200, source: "dashboard" },
        options: { smooth: true },
        context: { traceId: "trace-7" },
      },
      frames: [],
      target,
    });

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].request, {
      kind: "timeseries",
      frames: [],
      options: { smooth: true },
      context: { traceId: "trace-7" },
    });
    assert.equal(seen[0].target, target);
  });

  test("throws when visualization adapter is missing", async () => {
    const registry = createAdapterRegistry();

    await assert.rejects(
      executeWidgetRender(registry, {
        request: {
          dashboardId: "system-overview",
          widgetId: "w1",
          datasourceId: "metrics",
          query: { metric: "cpu.usage" },
          visualization: { type: "timeseries" },
          resolvedTimeRange: { from: 100, to: 200, source: "dashboard" },
          context: { traceId: "trace-8" },
        },
        frames: [],
        target: {},
      }),
      /No registered visualization adapter found/,
    );
  });

  test("throws when visualization capability does not support widget kind", async () => {
    const registry = createAdapterRegistry();

    registry.registerVisualization({
      type: "html",
      capabilities: {
        supportsHtmlWidget: false,
      },
      render() {},
    });

    await assert.rejects(
      executeWidgetRender(registry, {
        request: {
          dashboardId: "system-overview",
          widgetId: "w1",
          datasourceId: "metrics",
          query: { metric: "cpu.usage" },
          visualization: { type: "html" },
          resolvedTimeRange: { from: 100, to: 200, source: "dashboard" },
          context: { traceId: "trace-8b" },
        },
        frames: [],
        target: {},
      }),
      /does not support html widgets/,
    );
  });
});

describe("executeWidget", () => {
  test("queries and renders for successful datasource result", async () => {
    const registry = createAdapterRegistry();

    const renderCalls = [];
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
    registry.registerVisualization({
      type: "timeseries",
      render(request, target) {
        renderCalls.push({ request, target });
      },
    });

    const result = await executeWidget({
      registry,
      dashboardId: "system-overview",
      widget: makeWidget(),
      dashboardTimeRange: { from: 100, to: 200, source: "dashboard" },
      context: { traceId: "trace-9" },
      target: { nodeId: "w1" },
    });

    assert.equal(result.status, "success");
    assert.equal(renderCalls.length, 1);
    assert.equal(renderCalls[0].request.kind, "timeseries");
  });

  test("queries and renders for partial datasource result", async () => {
    const registry = createAdapterRegistry();

    const renderCalls = [];
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return {
          status: "partial",
          frames: [],
          error: {
            code: "DATASOURCE_QUERY_FAILED",
            message: "partial response",
            retriable: true,
          },
        };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render(request, target) {
        renderCalls.push({ request, target });
      },
    });

    const result = await executeWidget({
      registry,
      dashboardId: "system-overview",
      widget: makeWidget(),
      dashboardTimeRange: { from: 100, to: 200, source: "dashboard" },
      context: { traceId: "trace-10" },
      target: { nodeId: "w1" },
    });

    assert.equal(result.status, "partial");
    assert.equal(renderCalls.length, 1);
  });

  test("does not render when datasource returns error", async () => {
    const registry = createAdapterRegistry();

    let rendered = false;
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return {
          status: "error",
          frames: [],
          error: {
            code: "DATASOURCE_QUERY_FAILED",
            message: "query failed",
            retriable: true,
          },
        };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {
        rendered = true;
      },
    });

    const result = await executeWidget({
      registry,
      dashboardId: "system-overview",
      widget: makeWidget(),
      dashboardTimeRange: { from: 100, to: 200, source: "dashboard" },
      context: { traceId: "trace-11" },
      target: { nodeId: "w1" },
    });

    assert.equal(result.status, "error");
    assert.equal(rendered, false);
  });
});
