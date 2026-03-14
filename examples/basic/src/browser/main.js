import { GridStack } from "https://cdn.jsdelivr.net/npm/gridstack@12.3.3/+esm";
import * as echarts from "https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.esm.min.js";

import {
  createAdapterRegistry,
  createDashboardRuntime,
} from "../../../../packages/core/dist/index.js";
import { createGridstackAdapter } from "../../../../packages/adapter-gridstack/dist/index.js";
import { createEChartsAdapters } from "../../../../packages/adapter-echarts/dist/index.js";
import { createRestDatasourceAdapter } from "../../../../packages/datasource-rest/dist/index.js";

const appStateEl = document.getElementById("app-state");
const gridEl = document.getElementById("grid-root");
const widgetHostEl = document.getElementById("widget-chart");

function logState(message) {
  if (appStateEl) {
    appStateEl.textContent = message;
  }
}

function makeDashboard() {
  return {
    schemaVersion: 1,
    dashboardId: "browser-basic",
    meta: { title: "Browser Demo" },
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
        options: {
          title: { text: "CPU Usage (Mock Data)", left: "center" },
          yAxis: { name: "%" },
        },
      },
    ],
  };
}

function createDemoFetch() {
  return async (_url, init) => {
    const payload = JSON.parse(init?.body ?? "{}");
    const from = Number(payload.from ?? Date.now() - 3_600_000);
    const to = Number(payload.to ?? Date.now());

    const points = 20;
    const step = Math.max(1, Math.floor((to - from) / points));
    const timeValues = [];
    const cpuValues = [];

    for (let i = 0; i <= points; i += 1) {
      const t = from + i * step;
      const value = 35 + Math.sin(i / 2) * 20 + Math.random() * 4;
      timeValues.push(t);
      cpuValues.push(Math.round(value * 10) / 10);
    }

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
                { name: "time", type: "time", values: timeValues },
                {
                  name: "cpu.usage",
                  type: "number",
                  values: cpuValues,
                  labels: { host: "srv-1" },
                },
              ],
            },
          ],
        };
      },
    };
  };
}

async function main() {
  if (!gridEl || !widgetHostEl) {
    throw new Error("Missing required DOM elements for browser demo.");
  }

  const registry = createAdapterRegistry();

  registry.registerGrid(createGridstackAdapter({ GridStack }));

  for (const adapter of createEChartsAdapters({ echarts })) {
    registry.registerVisualization(adapter);
  }

  registry.registerDatasource(
    createRestDatasourceAdapter({
      id: "rest-metrics",
      baseUrl: "https://example.local/api",
      fetch: createDemoFetch(),
    }),
  );

  const runtime = createDashboardRuntime({
    registry,
    onEvent(event) {
      if (event.type === "widget.execute.completed") {
        logState(
          `Rendered ${event.widgetId} in ${event.durationMs}ms (status: ${event.status}).`,
        );
      }
      if (event.type === "widget.execute.failed") {
        logState(`Render failed for ${event.widgetId}.`);
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

  const gridTarget = { el: gridEl };
  registry.requireGrid("gridstack").init(gridTarget);
  await runtime.applyDashboardLayout({
    session,
    gridId: "gridstack",
    target: gridTarget,
  });

  const result = await runtime.executeWidget({
    session,
    widgetId: "w1",
    target: { el: widgetHostEl },
    context: { traceId: "trace-browser-demo" },
  });

  // Give the layout a tick, then trigger a resize so ECharts will size to the
  // fully-initialized container. This fixes charts rendering in the top-left
  // corner when their container's size is determined after render.
  logState(`Rendered widget w1 with ${result.frames.length} frame(s).`);
  setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
}

main().catch((error) => {
  console.error(error);
  logState(`Error: ${error.message}`);
});
