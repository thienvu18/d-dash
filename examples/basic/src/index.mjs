import {
  createAdapterRegistry,
  createDashboardRuntime,
} from "../../../packages/core/dist/index.js";
import { createGridstackAdapter } from "../../../packages/adapter-gridstack/dist/index.js";
import { createEChartsAdapters } from "../../../packages/adapter-echarts/dist/index.js";
import { createRestDatasourceAdapter } from "../../../packages/datasource-rest/dist/index.js";
import { createVictoriaMetricsDatasourceAdapter } from "../../../packages/datasource-victoriametrics/dist/index.js";

function createMockGridStackFactory() {
  return {
    init() {
      return {
        update() {},
        destroy() {},
      };
    },
  };
}

function createMockEChartsFactory() {
  return {
    init() {
      return {
        setOption() {},
        resize() {},
        dispose() {},
      };
    },
  };
}

function createMockFetch() {
  return async (url, init) => {
    const payload = JSON.parse(init?.body ?? "{}");

    if (url.endsWith("/query")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return {
            status: "success",
            frames: [
              {
                fields: [
                  {
                    name: "time",
                    type: "time",
                    values: [payload.from, payload.to],
                  },
                  {
                    name: "cpu.usage",
                    type: "number",
                    values: [41, 47],
                    labels: { host: "srv-1" },
                  },
                ],
              },
            ],
            warnings: ["demo data"],
          };
        },
      };
    }

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return {
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: { __name__: "cpu_usage", host: "srv-1" },
                values: [
                  [Math.floor(payload.start), "40"],
                  [Math.floor(payload.end), "45"],
                ],
              },
            ],
          },
        };
      },
    };
  };
}

function makeDashboard() {
  return {
    schemaVersion: 1,
    dashboardId: "basic-example",
    meta: { title: "Basic Example" },
    timeRange: { type: "relative", value: "now-1h" },
    layout: [{ id: "l1", x: 0, y: 0, w: 12, h: 6 }],
    widgets: [
      {
        id: "w1",
        layoutId: "l1",
        datasource: "rest-metrics",
        query: { metric: "cpu.usage" },
        visualization: { type: "timeseries" },
        timeRange: { type: "inherit" },
        options: { text: "CPU" },
      },
    ],
  };
}

async function main() {
  const registry = createAdapterRegistry();

  registry.registerGrid(
    createGridstackAdapter({
      GridStack: createMockGridStackFactory(),
    }),
  );

  for (const adapter of createEChartsAdapters({
    echarts: createMockEChartsFactory(),
  })) {
    registry.registerVisualization(adapter);
  }

  const fetchImpl = createMockFetch();
  registry.registerDatasource(
    createRestDatasourceAdapter({
      id: "rest-metrics",
      baseUrl: "https://example.local/api",
      fetch: fetchImpl,
    }),
  );

  registry.registerDatasource(
    createVictoriaMetricsDatasourceAdapter({
      id: "vm-metrics",
      baseUrl: "https://vm.local",
      fetch: fetchImpl,
    }),
  );

  const runtime = createDashboardRuntime({
    registry,
    now: () => 1_710_000_000_000,
    onEvent(event) {
      if (event.type === "widget.execute.failed") {
        console.error(
          "runtime event",
          event.type,
          event.widgetId,
          event.durationMs,
        );
      }
    },
  });

  const dashboard = makeDashboard();
  const validation = runtime.validateDashboard(dashboard);
  if (!validation.ok) {
    throw new Error(
      `Dashboard invalid: ${validation.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const session = runtime.createSession(dashboard);

  const gridTarget = {
    el: {
      querySelector(selector) {
        if (selector === '[gs-id="w1"]') {
          return {};
        }
        return null;
      },
    },
  };
  registry.requireGrid("gridstack").init(gridTarget);
  await runtime.applyDashboardLayout({
    session,
    gridId: "gridstack",
    target: gridTarget,
  });

  const queryResult = await runtime.executeWidget({
    session,
    widgetId: "w1",
    target: { el: {} },
    context: { traceId: "trace-basic-example" },
  });

  console.log("dashboard", dashboard.dashboardId);
  console.log("widget", session.widgets[0].id);
  console.log("result status", queryResult.status);
  console.log("frames", queryResult.frames.length);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
