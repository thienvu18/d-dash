import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { createAdapterRegistry } from "../dist/index.js";

function makeDatasource(id) {
  return {
    id,
    async query() {
      return { status: "success", frames: [] };
    },
  };
}

function makeVisualization(type) {
  return {
    type,
    render() {},
  };
}

function makeGrid(id) {
  return {
    id,
    init() {},
    applyLayout() {},
    destroy() {},
  };
}

describe("createAdapterRegistry", () => {
  test("register and require adapters", () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource(makeDatasource("metrics"));
    registry.registerVisualization(makeVisualization("timeseries"));
    registry.registerGrid(makeGrid("gridstack"));

    assert.equal(registry.requireDatasource("metrics").id, "metrics");
    assert.equal(registry.requireVisualization("timeseries").type, "timeseries");
    assert.equal(registry.requireGrid("gridstack").id, "gridstack");
  });

  test("reject duplicate registrations by default", () => {
    const registry = createAdapterRegistry();
    registry.registerDatasource(makeDatasource("metrics"));

    assert.throws(() => {
      registry.registerDatasource(makeDatasource("metrics"));
    }, /Duplicate datasource adapter registration/);
  });

  test("replace duplicate registrations when policy is replace", () => {
    const registry = createAdapterRegistry({ duplicatePolicy: "replace" });

    const first = makeDatasource("metrics");
    const second = makeDatasource("metrics");

    registry.registerDatasource(first);
    registry.registerDatasource(second);

    assert.equal(registry.requireDatasource("metrics"), second);
  });

  test("throw not found for require methods", () => {
    const registry = createAdapterRegistry();

    assert.throws(() => {
      registry.requireDatasource("missing");
    }, /No registered datasource adapter found/);

    assert.throws(() => {
      registry.requireVisualization("missing");
    }, /No registered visualization adapter found/);

    assert.throws(() => {
      registry.requireGrid("missing");
    }, /No registered grid adapter found/);
  });

  test("list registered adapter identifiers", () => {
    const registry = createAdapterRegistry();

    registry.registerDatasource(makeDatasource("metrics"));
    registry.registerDatasource(makeDatasource("logs"));
    registry.registerVisualization(makeVisualization("timeseries"));
    registry.registerVisualization(makeVisualization("stat"));
    registry.registerGrid(makeGrid("gridstack"));

    assert.deepEqual(registry.listDatasourceIds(), ["metrics", "logs"]);
    assert.deepEqual(registry.listVisualizationKinds(), ["timeseries", "stat"]);
    assert.deepEqual(registry.listGridIds(), ["gridstack"]);
  });
});
