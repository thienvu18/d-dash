import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  validatePersistedDashboard,
} from "../dist/validation.js";

import {
  buildWidgetExecutionRequest,
  createAdapterRegistry,
  createDashboardRuntime,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseDashboard(overrides = {}) {
  return {
    schemaVersion: 1,
    dashboardId: "dash-1",
    meta: { title: "Test Dashboard" },
    timeRange: { type: "relative", value: "now-1h" },
    layout: [{ id: "l1", x: 0, y: 0, w: 6, h: 4 }],
    widgets: [
      {
        id: "w1",
        layoutId: "l1",
        datasource: "metrics",
        query: { metric: "cpu.usage", filters: { host: "$host" } },
        visualization: { type: "timeseries" },
      },
    ],
    ...overrides,
  };
}

function makeContext(extra = {}) {
  return { traceId: "trace-vars-1", ...extra };
}

// ---------------------------------------------------------------------------
// validatePersistedDashboard — variable validation
// ---------------------------------------------------------------------------

describe("validatePersistedDashboard — template variables", () => {
  test("accepts valid custom variable", () => {
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "custom", name: "host", options: ["web-1", "web-2"], default: "web-1" },
      ],
    });
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test("accepts valid query variable", () => {
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "host", datasource: "metrics", query: "hosts" },
      ],
    });
    const result = validatePersistedDashboard(dashboard, {
      knownDatasources: ["metrics"],
    });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test("accepts valid textbox variable", () => {
    const dashboard = makeBaseDashboard({
      variables: [{ type: "textbox", name: "search", default: "" }],
    });
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test("reports VARIABLE_NAME_DUPLICATE for duplicate names", () => {
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "custom", name: "host", options: ["web-1"] },
        { type: "textbox", name: "host" },
      ],
    });
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some((i) => i.code === "VARIABLE_NAME_DUPLICATE"),
      `Expected VARIABLE_NAME_DUPLICATE, got: ${result.issues.map((i) => i.code).join(",")}`,
    );
  });

  test("reports VARIABLE_INVALID for empty variable name", () => {
    const dashboard = makeBaseDashboard({
      variables: [{ type: "custom", name: "", options: ["a"] }],
    });
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "VARIABLE_INVALID"));
  });

  test("reports VARIABLE_INVALID for name that starts with a digit", () => {
    const dashboard = makeBaseDashboard({
      variables: [{ type: "custom", name: "1host", options: ["web-1"] }],
    });
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "VARIABLE_INVALID"));
  });

  test("reports VARIABLE_INVALID when custom variable has no options array", () => {
    const dashboard = makeBaseDashboard({
      variables: [{ type: "custom", name: "host" }],
    });
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "VARIABLE_INVALID" && i.path.includes("options")));
  });

  test("reports VARIABLE_DATASOURCE_NOT_FOUND when query variable datasource is unknown", () => {
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "host", datasource: "missing-ds", query: "hosts" },
      ],
    });
    const result = validatePersistedDashboard(dashboard, {
      knownDatasources: ["metrics"],
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "VARIABLE_DATASOURCE_NOT_FOUND"));
  });

  test("reports VARIABLE_INVALID when query variable has no datasource", () => {
    const dashboard = makeBaseDashboard({
      variables: [{ type: "query", name: "host", datasource: "", query: "hosts" }],
    });
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "VARIABLE_INVALID" && i.path.includes("datasource")));
  });

  test("reports VARIABLE_INVALID when query variable has no query string", () => {
    const dashboard = makeBaseDashboard({
      variables: [{ type: "query", name: "host", datasource: "metrics", query: "" }],
    });
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "VARIABLE_INVALID" && i.path.includes("query")));
  });

  test("dashboard without variables field passes validation unchanged", () => {
    const dashboard = makeBaseDashboard();
    const result = validatePersistedDashboard(dashboard);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test("does not report circular dependency for a query variable that references no other variables", () => {
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "env", datasource: "metrics", query: "environments" },
        { type: "query", name: "host", datasource: "metrics", query: "hosts" },
      ],
    });
    const result = validatePersistedDashboard(dashboard, { knownDatasources: ["metrics"] });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test("does not report circular dependency for a query variable referencing a non-cycle variable", () => {
    // host -> env (one-way), no cycle
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "env", datasource: "metrics", query: "environments" },
        { type: "query", name: "host", datasource: "metrics", query: "hosts?env=$env" },
      ],
    });
    const result = validatePersistedDashboard(dashboard, { knownDatasources: ["metrics"] });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test("reports VARIABLE_CIRCULAR_DEPENDENCY for a direct mutual dependency (A -> B -> A)", () => {
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "env", datasource: "metrics", query: "environments?host=$host" },
        { type: "query", name: "host", datasource: "metrics", query: "hosts?env=$env" },
      ],
    });
    const result = validatePersistedDashboard(dashboard, { knownDatasources: ["metrics"] });
    assert.equal(result.ok, false);
    const cycleCodes = result.issues.filter((i) => i.code === "VARIABLE_CIRCULAR_DEPENDENCY");
    assert.ok(cycleCodes.length >= 2, `Expected at least 2 cycle issues, got: ${cycleCodes.length}`);
    const cyclingNames = cycleCodes.map((i) => {
      // path is "variables[N].query"; extract N to look up name
      const idx = parseInt(i.path.match(/\[(\d+)\]/)[1], 10);
      return dashboard.variables[idx].name;
    });
    assert.ok(cyclingNames.includes("env"), "env should be flagged");
    assert.ok(cyclingNames.includes("host"), "host should be flagged");
  });

  test("reports VARIABLE_CIRCULAR_DEPENDENCY for a three-node cycle (A -> B -> C -> A)", () => {
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "a", datasource: "ds", query: "qa?ref=$b" },
        { type: "query", name: "b", datasource: "ds", query: "qb?ref=$c" },
        { type: "query", name: "c", datasource: "ds", query: "qc?ref=$a" },
      ],
    });
    const result = validatePersistedDashboard(dashboard, { knownDatasources: ["ds"] });
    assert.equal(result.ok, false);
    const codes = result.issues.filter((i) => i.code === "VARIABLE_CIRCULAR_DEPENDENCY");
    assert.equal(codes.length, 3, `Expected 3 cycle issues, got: ${JSON.stringify(codes)}`);
  });

  test("does not flag a non-cycle variable that references a cycle member", () => {
    // bystander -> env, but only env <-> host is a cycle; bystander is not in the cycle
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "env", datasource: "ds", query: "environments?host=$host" },
        { type: "query", name: "host", datasource: "ds", query: "hosts?env=$env" },
        { type: "query", name: "bystander", datasource: "ds", query: "data?env=$env" },
      ],
    });
    const result = validatePersistedDashboard(dashboard, { knownDatasources: ["ds"] });
    assert.equal(result.ok, false);
    const codes = result.issues.filter((i) => i.code === "VARIABLE_CIRCULAR_DEPENDENCY");
    const cyclingNames = codes.map((i) => {
      const idx = parseInt(i.path.match(/\[(\d+)\]/)[1], 10);
      return dashboard.variables[idx].name;
    });
    assert.ok(!cyclingNames.includes("bystander"), "bystander should NOT be flagged");
    assert.ok(cyclingNames.includes("env"), "env should be flagged");
    assert.ok(cyclingNames.includes("host"), "host should be flagged");
  });
});

// ---------------------------------------------------------------------------
// buildWidgetExecutionRequest — variable substitution
// ---------------------------------------------------------------------------

describe("buildWidgetExecutionRequest — variable substitution", () => {
  const dashboardTimeRange = { from: 1_000, to: 2_000, source: "dashboard" };

  test("substitutes $variable references in filter string values", () => {
    const widget = {
      id: "w1",
      layoutId: "l1",
      datasource: "metrics",
      query: { metric: "cpu.usage", filters: { host: "$host", env: "$env" } },
      visualization: { type: "timeseries" },
    };
    const context = {
      traceId: "trace-1",
      resolvedVariables: { host: "web-1", env: "prod" },
    };

    const req = buildWidgetExecutionRequest({
      dashboardId: "dash-1",
      widget,
      dashboardTimeRange,
      context,
    });

    assert.equal(req.query.filters.host, "web-1");
    assert.equal(req.query.filters.env, "prod");
  });

  test("joins multi-value variables with comma", () => {
    const widget = {
      id: "w1",
      layoutId: "l1",
      datasource: "metrics",
      query: { metric: "cpu.usage", filters: { host: "$host" } },
      visualization: { type: "timeseries" },
    };
    const context = {
      traceId: "trace-1",
      resolvedVariables: { host: ["web-1", "web-2", "web-3"] },
    };

    const req = buildWidgetExecutionRequest({
      dashboardId: "dash-1",
      widget,
      dashboardTimeRange,
      context,
    });

    assert.equal(req.query.filters.host, "web-1,web-2,web-3");
  });

  test("leaves unresolved $variable references unchanged", () => {
    const widget = {
      id: "w1",
      layoutId: "l1",
      datasource: "metrics",
      query: { metric: "cpu.usage", filters: { host: "$host" } },
      visualization: { type: "timeseries" },
    };
    const context = {
      traceId: "trace-1",
      resolvedVariables: {},
    };

    const req = buildWidgetExecutionRequest({
      dashboardId: "dash-1",
      widget,
      dashboardTimeRange,
      context,
    });

    assert.equal(req.query.filters.host, "$host");
  });

  test("does not touch filters when resolvedVariables is absent", () => {
    const widget = {
      id: "w1",
      layoutId: "l1",
      datasource: "metrics",
      query: { metric: "cpu.usage", filters: { host: "$host" } },
      visualization: { type: "timeseries" },
    };

    const req = buildWidgetExecutionRequest({
      dashboardId: "dash-1",
      widget,
      dashboardTimeRange,
      context: { traceId: "trace-1" },
    });

    assert.equal(req.query.filters.host, "$host");
  });

  test("does not mutate non-string filter values", () => {
    const widget = {
      id: "w1",
      layoutId: "l1",
      datasource: "metrics",
      query: { metric: "cpu.usage", filters: { limit: 100, active: true, host: "$host" } },
      visualization: { type: "timeseries" },
    };

    const req = buildWidgetExecutionRequest({
      dashboardId: "dash-1",
      widget,
      dashboardTimeRange,
      context: { traceId: "trace-1", resolvedVariables: { host: "web-1" } },
    });

    assert.equal(req.query.filters.limit, 100);
    assert.equal(req.query.filters.active, true);
    assert.equal(req.query.filters.host, "web-1");
  });
});

// ---------------------------------------------------------------------------
// DashboardRuntime — resolveVariables
// ---------------------------------------------------------------------------

describe("DashboardRuntime.resolveVariables — custom and textbox", () => {
  function makeRegistry() {
    return createAdapterRegistry();
  }

  test("resolves custom variable using default value", async () => {
    const registry = makeRegistry();
    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "custom", name: "host", options: ["web-1", "web-2"], default: "web-1" },
      ],
    });
    const session = runtime.createSession(dashboard);

    const resolved = await runtime.resolveVariables(session);
    assert.equal(resolved.host, "web-1");
  });

  test("resolves custom variable using first option when no default", async () => {
    const registry = makeRegistry();
    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "custom", name: "env", options: ["prod", "staging"] },
      ],
    });
    const session = runtime.createSession(dashboard);

    const resolved = await runtime.resolveVariables(session);
    assert.equal(resolved.env, "prod");
  });

  test("override takes precedence over default", async () => {
    const registry = makeRegistry();
    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "custom", name: "host", options: ["web-1", "web-2"], default: "web-1" },
      ],
    });
    const session = runtime.createSession(dashboard);

    const resolved = await runtime.resolveVariables(session, { host: "web-2" });
    assert.equal(resolved.host, "web-2");
  });

  test("resolves textbox variable using default", async () => {
    const registry = makeRegistry();
    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [{ type: "textbox", name: "search", default: "error" }],
    });
    const session = runtime.createSession(dashboard);

    const resolved = await runtime.resolveVariables(session);
    assert.equal(resolved.search, "error");
  });

  test("returns empty string for textbox with no default", async () => {
    const registry = makeRegistry();
    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [{ type: "textbox", name: "search" }],
    });
    const session = runtime.createSession(dashboard);

    const resolved = await runtime.resolveVariables(session);
    assert.equal(resolved.search, "");
  });

  test("returns empty record when dashboard has no variables", async () => {
    const registry = makeRegistry();
    const runtime = createDashboardRuntime({ registry });
    const session = runtime.createSession(makeBaseDashboard());

    const resolved = await runtime.resolveVariables(session);
    assert.deepEqual(resolved, {});
  });
});

describe("DashboardRuntime.resolveVariables — query variable", () => {
  test("calls datasource adapter to resolve query variable values", async () => {
    const registry = createAdapterRegistry();
    const seen = [];
    registry.registerDatasource({
      id: "metrics",
      async query(request, context) {
        seen.push({ request, context });
        return {
          status: "success",
          frames: [
            {
              fields: [
                { name: "host", type: "string", values: ["web-1", "web-2"] },
              ],
            },
          ],
        };
      },
    });

    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "host", datasource: "metrics", query: "hosts" },
      ],
    });
    const session = runtime.createSession(dashboard);

    const resolved = await runtime.resolveVariables(session);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].request.metric, "hosts");
    // Single-value mode (multi not set): first value from the field.
    assert.equal(resolved.host, "web-1");
  });

  test("resolves as array when variable.multi is true", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        return {
          status: "success",
          frames: [
            {
              fields: [
                { name: "host", type: "string", values: ["web-1", "web-2", "web-3"] },
              ],
            },
          ],
        };
      },
    });

    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "host", datasource: "metrics", query: "hosts", multi: true },
      ],
    });
    const session = runtime.createSession(dashboard);

    const resolved = await runtime.resolveVariables(session);
    assert.deepEqual(resolved.host, ["web-1", "web-2", "web-3"]);
  });

  test("falls back to empty string when datasource query fails", async () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource({
      id: "metrics",
      async query() {
        throw new Error("connection refused");
      },
    });

    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "query", name: "host", datasource: "metrics", query: "hosts" },
      ],
    });
    const session = runtime.createSession(dashboard);

    const resolved = await runtime.resolveVariables(session);
    assert.equal(resolved.host, "");
  });
});

// ---------------------------------------------------------------------------
// BoundDashboardSession.updateVariables
// ---------------------------------------------------------------------------

describe("BoundDashboardSession.updateVariables", () => {
  test("updates resolvedVariables on the session and re-executes all widgets", async () => {
    const registry = createAdapterRegistry();
    const executedFilters = [];

    registry.registerDatasource({
      id: "metrics",
      async query(request) {
        executedFilters.push({ ...request.filters });
        return { status: "success", frames: [] };
      },
    });
    registry.registerVisualization({
      type: "timeseries",
      render() {},
    });

    const runtime = createDashboardRuntime({ registry });
    const dashboard = makeBaseDashboard({
      variables: [
        { type: "custom", name: "host", options: ["web-1", "web-2"], default: "web-1" },
      ],
    });
    const session = runtime.createSession(dashboard);
    const bound = runtime.createBoundSession(session);

    // Register a fake target so executeAllWidgets can find it.
    bound.registerWidgetTargets({ w1: {} });

    const results = await bound.updateVariables(
      { host: "web-2" },
      makeContext(),
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].result.status, "success");
    // The filter should have been substituted with web-2.
    assert.equal(executedFilters[0].host, "web-2");
    // Session should reflect updated variables.
    assert.equal(bound.session.resolvedVariables?.host, "web-2");
  });
});

// ---------------------------------------------------------------------------
// DashboardRuntime — serializeSession / restoreSnapshot
// ---------------------------------------------------------------------------

describe("DashboardRuntime.serializeSession and restoreSnapshot", () => {
  const NOW = 1_710_000_000_000;

  function makeRuntime() {
    const registry = createAdapterRegistry();
    return createDashboardRuntime({ registry, now: () => NOW });
  }

  test("serializeSession captures dashboard, capturedAt, widgetData, and resolvedVariables", () => {
    const runtime = makeRuntime();
    const dashboard = makeBaseDashboard();
    const session = runtime.createSession(dashboard);
    session.resolvedVariables = { host: "web-1" };

    const widgetData = { w1: [{ fields: [{ name: "cpu", type: "number", values: [50] }] }] };
    const snapshot = runtime.serializeSession(session, widgetData);

    assert.equal(snapshot.capturedAt, NOW);
    assert.deepEqual(snapshot.dashboard, dashboard);
    assert.deepEqual(snapshot.widgetData, widgetData);
    assert.deepEqual(snapshot.resolvedVariables, { host: "web-1" });
  });

  test("serializeSession sets resolvedVariables to undefined when session has none", () => {
    const runtime = makeRuntime();
    const session = runtime.createSession(makeBaseDashboard());
    const snapshot = runtime.serializeSession(session, {});
    assert.equal(snapshot.resolvedVariables, undefined);
  });

  test("restoreSnapshot reconstructs a valid session with dashboard time range", () => {
    const runtime = makeRuntime();
    const dashboard = makeBaseDashboard();
    const session = runtime.createSession(dashboard);
    const snapshot = runtime.serializeSession(session, {});

    const restored = runtime.restoreSnapshot(snapshot);

    assert.equal(restored.dashboard.dashboardId, "dash-1");
    assert.ok(Number.isFinite(restored.dashboardTimeRange.from));
    assert.ok(Number.isFinite(restored.dashboardTimeRange.to));
  });

  test("restoreSnapshot preserves resolvedVariables from the snapshot", () => {
    const runtime = makeRuntime();
    const session = runtime.createSession(makeBaseDashboard());
    session.resolvedVariables = { host: ["web-1", "web-2"] };

    const snapshot = runtime.serializeSession(session, {});
    const restored = runtime.restoreSnapshot(snapshot);

    assert.deepEqual(restored.resolvedVariables, { host: ["web-1", "web-2"] });
  });

  test("restoreSnapshot throws SCHEMA_INVALID for an invalid dashboard snapshot", () => {
    const runtime = makeRuntime();
    const badSnapshot = {
      dashboard: { schemaVersion: 99, dashboardId: "", meta: { title: "" }, timeRange: { type: "relative", value: "now-1h" }, layout: [], widgets: [] },
      capturedAt: NOW,
      widgetData: {},
    };

    assert.throws(
      () => runtime.restoreSnapshot(badSnapshot),
      (err) => err.code === "SCHEMA_INVALID",
    );
  });
});
