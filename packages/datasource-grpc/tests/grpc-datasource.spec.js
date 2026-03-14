import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { createGrpcDatasourceAdapter } from "../dist/index.js";

function makeContext() {
  return { traceId: "trace-grpc-1" };
}

function makeTimeRange() {
  return { from: 1_710_000_000_000, to: 1_710_003_600_000 };
}

describe("createGrpcDatasourceAdapter", () => {
  test("adapter id matches options.id", () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          return { status: "success", frames: [] };
        },
      },
    });

    assert.equal(adapter.id, "grpc");
  });

  test("declares ad hoc filter capability", () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          return { status: "success", frames: [] };
        },
      },
    });

    assert.equal(adapter.capabilities?.supportsAdHocFilters, true);
  });

  test("declares metadata discovery when getMetrics is provided", () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          return { status: "success", frames: [] };
        },
        async getMetrics() {
          return [];
        },
      },
    });

    assert.equal(adapter.capabilities?.supportsMetadataDiscovery, true);
  });

  test("query maps request to gRPC envelope", async () => {
    let lastEnvelope;
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query(envelope) {
          lastEnvelope = envelope;
          return { status: "success", frames: [] };
        },
      },
    });

    await adapter.query(
      {
        metric: "cpu.usage",
        timeRange: makeTimeRange(),
        filters: { host: "srv-1" },
      },
      makeContext(),
    );

    assert.equal(lastEnvelope.metric, "cpu.usage");
    assert.equal(lastEnvelope.from, 1_710_000_000_000);
    assert.equal(lastEnvelope.to, 1_710_003_600_000);
    assert.deepEqual(lastEnvelope.filters, { host: "srv-1" });
    assert.equal(lastEnvelope.context.traceId, "trace-grpc-1");
  });

  test("normalizes success response frames", async () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          return {
            status: "success",
            frames: [
              {
                fields: [
                  { name: "time", type: "time", values: [1_000_000] },
                  { name: "cpu", type: "number", values: [50], labels: { host: "srv-1" } },
                ],
              },
            ],
          };
        },
      },
    });

    const result = await adapter.query({ metric: "cpu", timeRange: makeTimeRange() }, makeContext());

    assert.equal(result.status, "success");
    assert.equal(result.frames.length, 1);
    assert.equal(result.frames[0].fields[1].name, "cpu");
    assert.deepEqual(result.frames[0].fields[1].labels, { host: "srv-1" });
  });

  test("maps partial response with structured error", async () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          return {
            status: "partial",
            frames: [],
            error: { code: "PARTIAL_DATA", message: "Shard timed out", retriable: true },
          };
        },
      },
    });

    const result = await adapter.query({ metric: "cpu", timeRange: makeTimeRange() }, makeContext());

    assert.equal(result.status, "partial");
    assert.equal(result.error.code, "PARTIAL_DATA");
    assert.equal(result.error.retriable, true);
  });

  test("maps error response with fallback error code", async () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          return {
            status: "error",
            frames: [],
            error: { message: "failed" },
          };
        },
      },
    });

    const result = await adapter.query({ metric: "cpu", timeRange: makeTimeRange() }, makeContext());

    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATASOURCE_QUERY_FAILED");
    assert.equal(result.error.message, "failed");
  });

  test("maps retriable transport error using gRPC code", async () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          const error = new Error("unavailable");
          error.code = "UNAVAILABLE";
          throw error;
        },
      },
    });

    const result = await adapter.query({ metric: "cpu", timeRange: makeTimeRange() }, makeContext());

    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATASOURCE_QUERY_FAILED");
    assert.equal(result.error.retriable, true);
  });

  test("getMetrics maps string and object metric definitions", async () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          return { status: "success", frames: [] };
        },
        async getMetrics() {
          return [
            "cpu.usage",
            { id: "mem.usage", name: "Memory Usage", unit: "bytes", supportedVisualizations: ["timeseries"] },
          ];
        },
      },
    });

    const metrics = await adapter.getMetrics();

    assert.equal(metrics.length, 2);
    assert.equal(metrics[0].id, "cpu.usage");
    assert.equal(metrics[1].name, "Memory Usage");
    assert.deepEqual(metrics[1].supportedVisualizations, ["timeseries"]);
  });

  test("getMetrics returns empty array when client does not support discovery", async () => {
    const adapter = createGrpcDatasourceAdapter({
      id: "grpc",
      client: {
        async query() {
          return { status: "success", frames: [] };
        },
      },
    });

    const metrics = await adapter.getMetrics();
    assert.deepEqual(metrics, []);
  });
});
