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
const eventLogEl = document.getElementById("event-log");

const WIDGET_HOST_IDS = {
  w1: "widget-timeseries",
  w2: "widget-stat",
  w3: "widget-text",
  w4: "widget-html",
};

function logState(message) {
  if (appStateEl) {
    appStateEl.textContent = message;
  }
}

function logEvent(message) {
  if (!eventLogEl) {
    return;
  }

  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} | ${message}`;
  eventLogEl.prepend(item);

  while (eventLogEl.childElementCount > 16) {
    eventLogEl.removeChild(eventLogEl.lastElementChild);
  }
}

function describeElementSize(el) {
  return `${el.clientWidth}x${el.clientHeight}`;
}

async function waitForElementSize(
  el,
  { minWidth = 180, minHeight = 90, timeoutMs = 1200 } = {},
) {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    if (el.clientWidth >= minWidth && el.clientHeight >= minHeight) {
      return true;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  return false;
}

function makeDashboard() {
  return {
    schemaVersion: 1,
    dashboardId: "browser-basic",
    meta: { title: "Browser Demo" },
    timeRange: { type: "relative", value: "now-1h" },
    layout: [
      { id: "l1", x: 0, y: 0, w: 8, h: 6 },
      { id: "l2", x: 8, y: 0, w: 4, h: 3 },
      { id: "l3", x: 8, y: 3, w: 4, h: 3 },
      { id: "l4", x: 0, y: 6, w: 12, h: 3 },
    ],
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
      {
        id: "w2",
        layoutId: "l2",
        datasource: "rest-metrics",
        query: { metric: "mem.usage" },
        visualization: { type: "stat" },
        timeRange: { type: "inherit" },
        options: {
          gaugeOverrides: {
            min: 0,
            max: 100,
            axisLine: {
              lineStyle: {
                width: 10,
              },
            },
          },
        },
      },
      {
        id: "w3",
        layoutId: "l3",
        datasource: "rest-metrics",
        query: { metric: "build.version" },
        visualization: { type: "text" },
        timeRange: { type: "inherit" },
        options: {
          text: "Cluster healthy",
          subtext: "No incidents in last 24h",
        },
      },
      {
        id: "w4",
        layoutId: "l4",
        datasource: "rest-metrics",
        query: { metric: "release.notes" },
        visualization: { type: "html" },
        timeRange: { type: "inherit" },
        options: {
          html: "<div style='font-family: Avenir Next, sans-serif; color: #dce9ff; line-height: 1.45;'><strong>Deployment:</strong> edge-us-2<br/><strong>Version:</strong> 1.14.8<br/><strong>Status:</strong> <span style='color:#7be495'>Healthy</span></div>",
        },
      },
    ],
  };
}

function buildMetricSeries(metric, index) {
  if (metric === "mem.usage") {
    return 55 + Math.cos(index / 3) * 18 + Math.random() * 3;
  }

  return 35 + Math.sin(index / 2) * 20 + Math.random() * 4;
}

function createDemoFetch() {
  return async (_url, init) => {
    const payload = JSON.parse(init?.body ?? "{}");
    const metric = String(payload.metric ?? "cpu.usage");
    const from = Number(payload.from ?? Date.now() - 3_600_000);
    const to = Number(payload.to ?? Date.now());

    const points = 20;
    const step = Math.max(1, Math.floor((to - from) / points));
    const timeValues = [];
    const metricValues = [];

    for (let i = 0; i <= points; i += 1) {
      const t = from + i * step;
      const value = buildMetricSeries(metric, i);
      timeValues.push(t);
      metricValues.push(Math.round(value * 10) / 10);
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
                  name: metric,
                  type: "number",
                  values: metricValues,
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

function collectWidgetTargets() {
  const targets = {};

  for (const [widgetId, hostId] of Object.entries(WIDGET_HOST_IDS)) {
    const el = document.getElementById(hostId);
    if (!el) {
      throw new Error(`Missing widget host element: ${hostId}`);
    }
    targets[widgetId] = { el };
  }

  return targets;
}

function registerAdapters() {
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

  return registry;
}

function setupWidgetResizeObservers(registry, session, widgetTargets) {
  const observers = [];

  for (const widget of session.widgets) {
    const target = widgetTargets[widget.id];
    const adapter = registry.requireVisualization(widget.visualization.type);
    if (!target || !adapter.resize) {
      continue;
    }

    const observer = new ResizeObserver(() => {
      adapter.resize?.(target);
    });
    observer.observe(target.el);
    observers.push(observer);
  }

  return () => {
    for (const observer of observers) {
      observer.disconnect();
    }
  };
}

async function main() {
  if (!gridEl) {
    throw new Error("Missing required DOM elements for browser demo.");
  }

  const widgetTargets = collectWidgetTargets();

  logEvent("Bootstrapping registry and adapters");
  const registry = registerAdapters();

  logEvent("Registered grid, visualization, and datasource adapters");

  const runtime = createDashboardRuntime({
    registry,
    onEvent(event) {
      if (event.type === "widget.execute.started") {
        logEvent(`runtime ${event.type} widget=${event.widgetId}`);
      } else {
        logEvent(
          `runtime ${event.type} widget=${event.widgetId} durationMs=${event.durationMs}`,
        );
      }
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
  logEvent("validateDashboard: ok");

  const preflight = runtime.preflightDashboard(dashboard);
  if (!preflight.ok) {
    throw new Error(
      `Dashboard preflight failed: missingDatasources=${preflight.missingDatasources.join(", ") || "none"}; missingVisualizations=${preflight.missingVisualizations.join(", ") || "none"}`,
    );
  }
  logEvent("preflightDashboard: all adapters resolved");

  const session = runtime.createSession(dashboard);
  logEvent("createSession: completed");

  const gridTarget = {
    el: gridEl,
  };
  registry.requireGrid("gridstack").init(gridTarget);
  logEvent("grid adapter initialized");

  const disconnectResizeObservers = setupWidgetResizeObservers(
    registry,
    session,
    widgetTargets,
  );

  const unbindLayoutResize = await runtime.bindLayoutResize({
    session,
    gridId: "gridstack",
    gridTarget,
    resolveTargetByWidgetId(widgetId) {
      return widgetTargets[widgetId];
    },
  });
  logEvent("bindLayoutResize: grid layout changes now trigger visualization resize");

  const cleanup = () => {
    unbindLayoutResize();
    disconnectResizeObservers();
    logEvent("teardown: unbound layout resize and disconnected ResizeObservers");
  };
  window.addEventListener("beforeunload", cleanup, { once: true });

  await runtime.applyDashboardLayout({
    session,
    gridId: "gridstack",
    target: gridTarget,
  });
  logEvent("applyDashboardLayout: layout synchronized");

  await Promise.all(
    Object.entries(widgetTargets).map(async ([widgetId, target]) => {
      await waitForElementSize(target.el);
      logEvent(`widget ${widgetId} size before execute: ${describeElementSize(target.el)}`);
    }),
  );

  const results = await runtime.executeAllWidgets({
    session,
    targetByWidgetId: widgetTargets,
    context: { traceId: "trace-browser-demo" },
  });

  // Give the layout a tick, then trigger a resize so ECharts re-reads
  // container dimensions after layout settles.
  logState(`Rendered ${results.length} widgets.`);
  for (const { widgetId, result } of results) {
    logEvent(
      `executeWidget: ${widgetId} => ${result.status} (${result.frames.length} frame(s)) warnings=${result.warnings?.length ?? 0}`,
    );
  }

  setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
    for (const [widgetId, target] of Object.entries(widgetTargets)) {
      logEvent(`widget ${widgetId} size after deferred resize: ${describeElementSize(target.el)}`);
    }
  }, 32);
}

main().catch((error) => {
  console.error(error);
  logState(`Error: ${error.message}`);
});
