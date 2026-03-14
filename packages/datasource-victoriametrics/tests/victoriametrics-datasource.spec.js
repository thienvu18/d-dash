import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { createVictoriaMetricsDatasourceAdapter } from "../dist/index.js";

const BASE_URL = "https://vm.example.com";

function makeContext() {
  return { traceId: "trace-vm-1" };
}

function makeTimeRange() {
  return { from: 1_710_000_000_000, to: 1_710_003_600_000 };
}

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

function makeFailingFetch(error) {
  return async () => {
    throw error;
  };
}

describe("createVictoriaMetricsDatasourceAdapter", () => {
  test("adapter id matches options.id", () => {
    const adapter = createVictoriaMetricsDatasourceAdapter({ id: "vm", baseUrl: BASE_URL });
    assert.equal(adapter.id, "vm");
  });

  test("range query uses /api/v1/query_range and includes start/end/step", async () => {
    const { fetchFn, getLastRequest } = makeFetch({ status: "success", data: { resultType: "matrix", result: [] } });
    const adapter = createVictoriaMetricsDatasourceAdapter({
      id: "vm",
      baseUrl: BASE_URL,
      defaultStep: "30s",
      fetch: fetchFn,
    });

    await adapter.query({ metric: "up", timeRange: makeTimeRange() }, makeContext());

    const req = getLastRequest();
    assert.equal(req.url, `${BASE_URL}/api/v1/query_range`);
    const body = JSON.parse(req.init.body);
    assert.equal(body.query, "up");
    assert.ok(typeof body.start === "number");
    assert.ok(typeof body.end === "number");
    assert.equal(body.step, "30s");
    assert.equal(body.traceId, "trace-vm-1");
  });

  test("instant query mode uses /api/v1/query and includes time", async () => {
    const { fetchFn, getLastRequest } = makeFetch({ status: "success", data: { resultType: "vector", result: [] } });
    const adapter = createVictoriaMetricsDatasourceAdapter({ id: "vm", baseUrl: BASE_URL, fetch: fetchFn });

    await adapter.query({
      metric: "up",
      timeRange: makeTimeRange(),
      filters: { mode: "instant" },
    }, makeContext());

    const req = getLastRequest();
    assert.equal(req.url, `${BASE_URL}/api/v1/query`);
    const body = JSON.parse(req.init.body);
    assert.ok(typeof body.time === "number");
    assert.equal(body.start, undefined);
    assert.equal(body.end, undefined);
  });

  test("filters.step overrides default step", async () => {
    const { fetchFn, getLastRequest } = makeFetch({ status: "success", data: { resultType: "matrix", result: [] } });
    const adapter = createVictoriaMetricsDatasourceAdapter({
      id: "vm",
      baseUrl: BASE_URL,
      defaultStep: "60s",
      fetch: fetchFn,
    });

    await adapter.query({
      metric: "up",
      timeRange: makeTimeRange(),
      filters: { step: "15s" },
    }, makeContext());

    const body = JSON.parse(getLastRequest().init.body);
    assert.equal(body.step, "15s");
  });

  test("matrix response normalizes to time + numeric fields", async () => {
    const { fetchFn } = makeFetch({
      status: "success",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { __name__: "cpu_usage", host: "srv1" },
            values: [[1710000000, "10"], [1710000060, "20"]],
          },
        ],
      },
    });

    const adapter = createVictoriaMetricsDatasourceAdapter({ id: "vm", baseUrl: BASE_URL, fetch: fetchFn });
    const result = await adapter.query({ metric: "cpu_usage", timeRange: makeTimeRange() }, makeContext());

    assert.equal(result.status, "success");
    assert.equal(result.frames.length, 1);
    assert.equal(result.frames[0].fields[0].name, "time");
    assert.equal(result.frames[0].fields[0].type, "time");
    assert.deepEqual(result.frames[0].fields[0].values, [1710000000000, 1710000060000]);
    assert.equal(result.frames[0].fields[1].name, "cpu_usage");
    assert.equal(result.frames[0].fields[1].type, "number");
    assert.deepEqual(result.frames[0].fields[1].values, [10, 20]);
    assert.deepEqual(result.frames[0].fields[1].labels, { __name__: "cpu_usage", host: "srv1" });
  });

  test("vector response normalizes to single-point frames", async () => {
    const { fetchFn } = makeFetch({
      status: "success",
      data: {
        resultType: "vector",
        result: [
          {
            metric: { __name__: "up", job: "node" },
            value: [1710000000, "1"],
          },
        ],
      },
    });

    const adapter = createVictoriaMetricsDatasourceAdapter({ id: "vm", baseUrl: BASE_URL, fetch: fetchFn });
    const result = await adapter.query({
      metric: "up",
      timeRange: makeTimeRange(),
      filters: { mode: "instant" },
    }, makeContext());

    assert.equal(result.status, "success");
    assert.equal(result.frames[0].fields[0].values[0], 1710000000000);
    assert.equal(result.frames[0].fields[1].values[0], 1);
  });

  test("http error maps to DATASOURCE_HTTP_ERROR", async () => {
    const { fetchFn } = makeFetch({}, { ok: false, status: 503 });
    const adapter = createVictoriaMetricsDatasourceAdapter({ id: "vm", baseUrl: BASE_URL, fetch: fetchFn });

    const result = await adapter.query({ metric: "up", timeRange: makeTimeRange() }, makeContext());

    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATASOURCE_HTTP_ERROR");
    assert.equal(result.error.retriable, true);
  });

  test("network error maps to DATASOURCE_QUERY_FAILED", async () => {
    const adapter = createVictoriaMetricsDatasourceAdapter({
      id: "vm",
      baseUrl: BASE_URL,
      fetch: makeFailingFetch(new Error("ECONNRESET")),
    });

    const result = await adapter.query({ metric: "up", timeRange: makeTimeRange() }, makeContext());

    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATASOURCE_QUERY_FAILED");
    assert.equal(result.error.retriable, true);
  });

  test("AbortError maps to timeout-like DATASOURCE_QUERY_FAILED", async () => {
    const adapter = createVictoriaMetricsDatasourceAdapter({
      id: "vm",
      baseUrl: BASE_URL,
      fetch: makeFailingFetch(Object.assign(new Error("aborted"), { name: "AbortError" })),
    });

    const result = await adapter.query({ metric: "up", timeRange: makeTimeRange() }, makeContext());

    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATASOURCE_QUERY_FAILED");
    assert.equal(result.error.retriable, false);
    assert.match(String(result.error.message), /timed out/);
  });
});
