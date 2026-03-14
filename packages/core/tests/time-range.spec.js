import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  resolveDashboardTimeRange,
  resolveWidgetTimeRange,
} from "../dist/index.js";

describe("time range resolver", () => {
  test("resolves dashboard relative ranges using provided now", () => {
    const now = 1_710_000_000_000;

    const resolved = resolveDashboardTimeRange(
      { type: "relative", value: "now-1h" },
      { now },
    );

    assert.equal(resolved.from, now - 60 * 60 * 1000);
    assert.equal(resolved.to, now);
    assert.equal(resolved.source, "dashboard");
  });

  test("resolves dashboard absolute ranges", () => {
    const resolved = resolveDashboardTimeRange({
      type: "absolute",
      from: 100,
      to: 200,
    });

    assert.deepEqual(resolved, {
      from: 100,
      to: 200,
      source: "dashboard",
    });
  });

  test("inherits dashboard range for inherit or missing widget override", () => {
    const dashboardRange = {
      from: 100,
      to: 200,
      source: "dashboard",
    };

    assert.equal(resolveWidgetTimeRange(undefined, dashboardRange), dashboardRange);
    assert.equal(
      resolveWidgetTimeRange({ type: "inherit" }, dashboardRange),
      dashboardRange,
    );
  });

  test("resolves widget relative overrides", () => {
    const now = 1_710_000_000_000;
    const dashboardRange = {
      from: now - 24 * 60 * 60 * 1000,
      to: now,
      source: "dashboard",
    };

    const resolved = resolveWidgetTimeRange(
      { type: "relative", value: "now-15m" },
      dashboardRange,
      { now },
    );

    assert.equal(resolved.from, now - 15 * 60 * 1000);
    assert.equal(resolved.to, now);
    assert.equal(resolved.source, "widget");
  });

  test("throws on invalid relative expression", () => {
    const dashboardRange = {
      from: 100,
      to: 200,
      source: "dashboard",
    };

    assert.throws(() => {
      resolveWidgetTimeRange(
        { type: "relative", value: "last-hour" },
        dashboardRange,
      );
    }, /Invalid relative time range expression/);
  });
});
