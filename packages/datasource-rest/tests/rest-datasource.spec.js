import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { createRestDatasourceAdapter } from "../dist/index.js";

const BASE_URL = "https://metrics.example.com/api/v1";

function makeContext() {
  return { traceId: "trace-rest-1" };
}

function makeTimeRange() {
  return { from: 1_710_000_000_000, to: 1_710_003_600_000 };
}

/**
 * Builds a fetch mock that returns the given response body.
 * Records the last request for assertion.
 */
function makeFetch(responseBody, { ok = true, status = 200 } = {}) {
  let lastRequest = null;

  const fetchFn = async (url, init) => {
    lastRequest = { url, init };
    return {
      ok,
      status,
      statusText: ok ? "OK" : "Error",
      async json() {
        return responseBody;
      },
    };
  };

  return { fetchFn, getLastRequest: () => lastRequest };
}

/** Returns a fetch mock that rejects with the given error. */
function makeFailingFetch(error) {
  return async () => {
    throw error;
  };
}

/** Returns a fetch mock that rejects with an AbortError. */
function makeAbortFetch() {
  return makeFailingFetch(
    Object.assign(new Error("aborted"), { name: "AbortError" }),
  );
}

// ---------------------------------------------------------------------------
// Adapter identity
// ---------------------------------------------------------------------------

describe("createRestDatasourceAdapter", () => {
  test("adapter id matches options.id", () => {
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
    });
    assert.equal(adapter.id, "metrics");
  });

  test("adapter declares adHocFilters capability", () => {
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
    });
    assert.equal(adapter.capabilities?.supportsAdHocFilters, true);
  });

  test("adapter declares metadata discovery capability", () => {
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
    });
    assert.equal(adapter.capabilities?.supportsMetadataDiscovery, true);
  });

  test("getMetrics maps string metric list response", async () => {
    const { fetchFn, getLastRequest } = makeFetch(["cpu.usage", "mem.usage"]);
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const metrics = await adapter.getMetrics();

    assert.equal(getLastRequest().url, `${BASE_URL}/metrics`);
    assert.equal(metrics.length, 2);
    assert.equal(metrics[0].id, "cpu.usage");
    assert.equal(metrics[0].datasource, "metrics");
  });

  test("getMetrics maps object metric list response", async () => {
    const { fetchFn } = makeFetch({
      metrics: [
        {
          id: "cpu.usage",
          name: "CPU Usage",
          unit: "percent",
          supportedVisualizations: ["timeseries"],
        },
      ],
    });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const metrics = await adapter.getMetrics();

    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].name, "CPU Usage");
    assert.equal(metrics[0].unit, "percent");
    assert.deepEqual(metrics[0].supportedVisualizations, ["timeseries"]);
  });

  test("getMetrics returns empty array on HTTP errors", async () => {
    const { fetchFn } = makeFetch({}, { ok: false, status: 500 });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const metrics = await adapter.getMetrics();

    assert.deepEqual(metrics, []);
  });

  // ---------------------------------------------------------------------------
  // Request construction
  // ---------------------------------------------------------------------------

  test("query POSTs to baseUrl/query with correct envelope", async () => {
    const successBody = { status: "success", frames: [] };
    const { fetchFn, getLastRequest } = makeFetch(successBody);
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    await adapter.query(
      {
        metric: "cpu.usage",
        timeRange: makeTimeRange(),
        filters: { host: "srv1" },
      },
      makeContext(),
    );

    const req = getLastRequest();
    assert.equal(req.url, `${BASE_URL}/query`);
    assert.equal(req.init.method, "POST");

    const body = JSON.parse(req.init.body);
    assert.equal(body.metric, "cpu.usage");
    assert.equal(body.from, 1_710_000_000_000);
    assert.equal(body.to, 1_710_003_600_000);
    assert.deepEqual(body.filters, { host: "srv1" });
    assert.equal(body.context.traceId, "trace-rest-1");
  });

  test("query forwards custom headers", async () => {
    const { fetchFn, getLastRequest } = makeFetch({
      status: "success",
      frames: [],
    });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      headers: { Authorization: "Bearer tok" },
      fetch: fetchFn,
    });

    await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    const req = getLastRequest();
    assert.equal(req.init.headers["Authorization"], "Bearer tok");
    assert.equal(req.init.headers["Content-Type"], "application/json");
  });

  // ---------------------------------------------------------------------------
  // Success / partial / error response mapping
  // ---------------------------------------------------------------------------

  test("maps success response to DatasourceQuerySuccess with normalized frames", async () => {
    const body = {
      status: "success",
      frames: [
        {
          fields: [
            { name: "time", type: "time", values: [1_000_000, 2_000_000] },
            { name: "cpu", type: "number", values: [10, 20] },
          ],
        },
      ],
    };
    const { fetchFn } = makeFetch(body);
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.equal(result.status, "success");
    assert.equal(result.frames.length, 1);
    assert.equal(result.frames[0].fields.length, 2);
    assert.equal(result.frames[0].fields[1].name, "cpu");
    assert.deepEqual(result.frames[0].fields[1].values, [10, 20]);
  });

  test("maps partial response envelope to DatasourceQueryPartial", async () => {
    const body = {
      status: "partial",
      frames: [{ fields: [{ name: "cpu", type: "number", values: [5] }] }],
      error: { code: "PARTIAL_DATA", message: "Some shards timed out." },
    };
    const { fetchFn } = makeFetch(body);
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.equal(result.status, "partial");
    assert.equal(result.error.code, "PARTIAL_DATA");
    assert.equal(result.frames.length, 1);
  });

  test("maps error response envelope to DatasourceQueryError", async () => {
    const body = {
      status: "error",
      frames: [],
      error: { code: "METRIC_NOT_FOUND", message: "Unknown metric." },
    };
    const { fetchFn } = makeFetch(body);
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.query(
      { metric: "unknown", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.equal(result.status, "error");
    assert.equal(result.error.code, "METRIC_NOT_FOUND");
  });

  // ---------------------------------------------------------------------------
  // HTTP-level failures
  // ---------------------------------------------------------------------------

  test("maps HTTP 4xx to structured error result (non-retriable)", async () => {
    const { fetchFn } = makeFetch(null, { ok: false, status: 404 });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATASOURCE_HTTP_ERROR");
    assert.equal(result.error.retriable, false);
    assert.match(String(result.error.message), /404/);
  });

  test("maps HTTP 5xx to retriable structured error result", async () => {
    const { fetchFn } = makeFetch(null, { ok: false, status: 503 });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.equal(result.status, "error");
    assert.equal(result.error.retriable, true);
  });

  test("maps network error to non-retriable structured error result", async () => {
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: makeFailingFetch(new Error("ECONNREFUSED")),
    });

    const result = await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATASOURCE_QUERY_FAILED");
    assert.equal(result.error.retriable, true);
    assert.match(String(result.error.message), /Network error/);
  });

  test("maps AbortError to timeout structured error (non-retriable)", async () => {
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: makeAbortFetch(),
    });

    const result = await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.equal(result.status, "error");
    assert.equal(result.error.retriable, false);
    assert.match(String(result.error.message), /timed out/);
  });

  // ---------------------------------------------------------------------------
  // Field label passthrough
  // ---------------------------------------------------------------------------

  test("preserves field labels in normalized frames", async () => {
    const body = {
      status: "success",
      frames: [
        {
          fields: [
            {
              name: "cpu",
              type: "number",
              values: [50],
              labels: { host: "srv1", region: "us-east" },
            },
          ],
        },
      ],
    };
    const { fetchFn } = makeFetch(body);
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.deepEqual(result.frames[0].fields[0].labels, {
      host: "srv1",
      region: "us-east",
    });
  });

  // ---------------------------------------------------------------------------
  // Warnings passthrough
  // ---------------------------------------------------------------------------

  test("passes through warnings from the response envelope", async () => {
    const body = {
      status: "success",
      frames: [],
      warnings: ["Rate limit approaching."],
    };
    const { fetchFn } = makeFetch(body);
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.query(
      { metric: "cpu.usage", timeRange: makeTimeRange() },
      makeContext(),
    );

    assert.deepEqual(result.warnings, ["Rate limit approaching."]);
  });

  // ---------------------------------------------------------------------------
  // Metric search
  // ---------------------------------------------------------------------------

  test("adapter declares supportsMetricSearch capability by default", () => {
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
    });
    assert.equal(adapter.capabilities?.supportsMetricSearch, true);
  });

  test("searchMetrics GETs the search endpoint with pagination parameters", async () => {
    const { fetchFn, getLastRequest } = makeFetch({
      metrics: [
        { id: "cpu.usage", name: "CPU Usage" },
      ],
      total: 1,
    });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.searchMetrics("cpu", 10, 0);

    const req = getLastRequest();
    assert.equal(req.url, `${BASE_URL}/metrics/search?q=cpu&limit=10&offset=0`);
    assert.equal(req.init.method, "GET");
    assert.equal(result.metrics.length, 1);
    assert.equal(result.metrics[0].id, "cpu.usage");
    assert.equal(result.total, 1);
    assert.equal(result.hasMore, false);
  });

  test("searchMetrics supports custom searchMetricsPath", async () => {
    const { fetchFn, getLastRequest } = makeFetch({
      metrics: ["custom.metric"],
      total: 1,
    });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      searchMetricsPath: "/api/v1/search",
      fetch: fetchFn,
    });

    await adapter.searchMetrics("custom", 5, 10);

    const req = getLastRequest();
    assert.equal(req.url, `${BASE_URL}/api/v1/search?q=custom&limit=5&offset=10`);
  });

  test("searchMetrics maps string metrics response", async () => {
    const { fetchFn } = makeFetch({
      metrics: ["cpu.usage", "mem.usage"],
      total: 150, // total > offset + limit, so hasMore = true
    });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.searchMetrics("usage", 100, 0);

    assert.equal(result.metrics.length, 2);
    assert.equal(result.metrics[0].id, "cpu.usage");
    assert.equal(result.metrics[0].datasource, "metrics");
    assert.equal(result.hasMore, true); // total (150) > offset + limit (100)
  });

  test("searchMetrics returns empty result on HTTP errors", async () => {
    const { fetchFn } = makeFetch({}, { ok: false, status: 500 });
    const adapter = createRestDatasourceAdapter({
      id: "metrics",
      baseUrl: BASE_URL,
      fetch: fetchFn,
    });

    const result = await adapter.searchMetrics("cpu", 10, 0);

    assert.equal(result.metrics.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.hasMore, false);
  });
});
