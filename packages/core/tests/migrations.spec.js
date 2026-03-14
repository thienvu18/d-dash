import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  LATEST_SCHEMA_VERSION,
  migratePersistedDashboard,
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
      },
    ],
    ...overrides,
  };
}

describe("migratePersistedDashboard", () => {
  test("returns no-op migration result for latest schema version", () => {
    const dashboard = makeDashboard();
    const result = migratePersistedDashboard(dashboard);

    assert.equal(result.fromVersion, LATEST_SCHEMA_VERSION);
    assert.equal(result.toVersion, LATEST_SCHEMA_VERSION);
    assert.equal(result.migrated, false);
    assert.equal(result.dashboard, dashboard);
  });

  test("throws for unsupported schema versions", () => {
    const dashboard = makeDashboard({ schemaVersion: 99 });

    assert.throws(
      () => migratePersistedDashboard(dashboard),
      /Unsupported schema version/,
    );
  });
});
