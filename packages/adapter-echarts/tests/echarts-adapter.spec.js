import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  createEChartsAdapters,
  dataFramesToTimeseriesOption,
  dataFramesToStatOption,
  widgetOptionsToTextOption,
} from "../dist/index.js";

/** Builds a mock ECharts factory and records all calls. */
function makeEChartsFactory() {
  const calls = { init: [], setOption: [], resize: [], dispose: [] };

  const factory = {
    init(el, theme) {
      calls.init.push({ el, theme });
      return {
        setOption(option, notMerge) {
          calls.setOption.push({ option, notMerge });
        },
        resize() {
          calls.resize.push({});
        },
        dispose() {
          calls.dispose.push({});
        },
      };
    },
  };

  return { factory, calls };
}

function makeTarget(theme) {
  return { el: {}, theme };
}

function makeContext() {
  return { traceId: "trace-echarts-1" };
}

// ---------------------------------------------------------------------------
// createEChartsAdapters
// ---------------------------------------------------------------------------

describe("createEChartsAdapters", () => {
  test("returns three adapters for timeseries, stat, and text", () => {
    const { factory } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });

    assert.equal(adapters.length, 3);
    assert.deepEqual(
      adapters.map((a) => a.type),
      ["timeseries", "stat", "text"],
    );
  });

  test("each adapter declares timeseries, stat, text, and resize capabilities", () => {
    const { factory } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });

    for (const adapter of adapters) {
      assert.equal(adapter.capabilities?.supportsTimeSeries, true, `${adapter.type} supportsTimeSeries`);
      assert.equal(adapter.capabilities?.supportsStat, true, `${adapter.type} supportsStat`);
      assert.equal(adapter.capabilities?.supportsTextWidget, true, `${adapter.type} supportsTextWidget`);
      assert.equal(adapter.capabilities?.supportsResize, true, `${adapter.type} supportsResize`);
    }
  });

  test("init creates an ECharts instance on the target element", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget();

    timeseries.init(target);

    assert.equal(calls.init.length, 1);
    assert.equal(calls.init[0].el, target.el);
  });

  test("init forwards theme to echarts.init", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget("dark");

    timeseries.init(target);

    assert.equal(calls.init[0].theme, "dark");
  });

  test("init is idempotent — repeated calls do not create duplicate instances", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget();

    timeseries.init(target);
    timeseries.init(target);

    assert.equal(calls.init.length, 1);
  });

  test("render auto-inits if init was not called", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget();

    timeseries.render({ kind: "timeseries", frames: [], options: {}, context: makeContext() }, target);

    assert.equal(calls.init.length, 1);
  });

  test("resize calls chart.resize()", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget();

    timeseries.init(target);
    timeseries.resize(target);

    assert.equal(calls.resize.length, 1);
  });

  test("resize on uninitialized target is a no-op", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget();

    assert.doesNotThrow(() => timeseries.resize(target));
    assert.equal(calls.resize.length, 0);
  });

  test("destroy calls chart.dispose() and cleans up instance", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget();

    timeseries.init(target);
    timeseries.destroy(target);

    assert.equal(calls.dispose.length, 1);
  });

  test("destroy on uninitialized target is a no-op", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget();

    assert.doesNotThrow(() => timeseries.destroy(target));
    assert.equal(calls.dispose.length, 0);
  });

  test("two separate targets each get independent ECharts instances", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const targetA = makeTarget();
    const targetB = makeTarget();
    // Give them distinct el objects
    targetB.el = {};

    timeseries.init(targetA);
    timeseries.init(targetB);

    assert.equal(calls.init.length, 2);
    assert.notEqual(calls.init[0].el, calls.init[1].el);
  });
});

// ---------------------------------------------------------------------------
// dataFramesToTimeseriesOption
// ---------------------------------------------------------------------------

describe("dataFramesToTimeseriesOption", () => {
  test("maps time and value fields to line series data", () => {
    const frames = [
      {
        fields: [
          { name: "time", type: "time", values: [1_000_000, 2_000_000] },
          { name: "cpu", type: "number", values: [10, 20] },
        ],
      },
    ];

    const option = dataFramesToTimeseriesOption(frames);

    assert.equal(option.series.length, 1);
    assert.equal(option.series[0].type, "line");
    assert.equal(option.series[0].name, "cpu");
    assert.equal(option.series[0].data.length, 2);
  });

  test("skips frames with no time field", () => {
    const frames = [
      {
        fields: [
          { name: "cpu", type: "number", values: [10] },
        ],
      },
    ];

    const option = dataFramesToTimeseriesOption(frames);
    assert.equal(option.series.length, 0);
  });

  test("merges caller options into the returned option", () => {
    const option = dataFramesToTimeseriesOption([], { legend: { show: true } });
    assert.deepEqual(option.legend, { show: true });
  });
});

// ---------------------------------------------------------------------------
// dataFramesToStatOption
// ---------------------------------------------------------------------------

describe("dataFramesToStatOption", () => {
  test("reads last value of first numeric field", () => {
    const frames = [
      {
        fields: [
          { name: "cpu", type: "number", values: [10, 42] },
        ],
      },
    ];

    const option = dataFramesToStatOption(frames);

    assert.equal(option.series[0].type, "gauge");
    assert.equal(option.series[0].data[0].value, 42);
    assert.equal(option.series[0].data[0].name, "cpu");
  });

  test("returns null value when frames are empty", () => {
    const option = dataFramesToStatOption([]);
    assert.equal(option.series[0].data[0].value, null);
  });
});

// ---------------------------------------------------------------------------
// widgetOptionsToTextOption
// ---------------------------------------------------------------------------

describe("widgetOptionsToTextOption", () => {
  test("sets title text from options.text", () => {
    const option = widgetOptionsToTextOption({ text: "Hello Dashboard" });
    assert.equal(option.title.text, "Hello Dashboard");
  });

  test("sets subtext from options.subtext", () => {
    const option = widgetOptionsToTextOption({ text: "Title", subtext: "Sub" });
    assert.equal(option.title.subtext, "Sub");
  });

  test("uses empty string when options.text is missing", () => {
    const option = widgetOptionsToTextOption({});
    assert.equal(option.title.text, "");
  });

  test("series is always empty", () => {
    const option = widgetOptionsToTextOption({ text: "Hello" });
    assert.deepEqual(option.series, []);
  });
});

// ---------------------------------------------------------------------------
// render integration — timeseries, stat, text
// ---------------------------------------------------------------------------

describe("render integration", () => {
  test("timeseries render calls setOption with notMerge=true", () => {
    const { factory, calls } = makeEChartsFactory();
    const [timeseries] = createEChartsAdapters({ echarts: factory });
    const target = makeTarget();

    timeseries.render(
      {
        kind: "timeseries",
        frames: [
          {
            fields: [
              { name: "time", type: "time", values: [1_000_000] },
              { name: "cpu", type: "number", values: [50] },
            ],
          },
        ],
        options: {},
        context: makeContext(),
      },
      target,
    );

    assert.equal(calls.setOption.length, 1);
    assert.equal(calls.setOption[0].notMerge, true);
    assert.equal(calls.setOption[0].option.series.length, 1);
  });

  test("stat render produces a gauge series", () => {
    const { factory, calls } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });
    const stat = adapters.find((a) => a.type === "stat");
    const target = makeTarget();

    stat.render(
      {
        kind: "stat",
        frames: [{ fields: [{ name: "memory", type: "number", values: [77] }] }],
        options: {},
        context: makeContext(),
      },
      target,
    );

    assert.equal(calls.setOption[0].option.series[0].type, "gauge");
    assert.equal(calls.setOption[0].option.series[0].data[0].value, 77);
  });

  test("text render produces a title with text content", () => {
    const { factory, calls } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });
    const text = adapters.find((a) => a.type === "text");
    const target = makeTarget();

    text.render(
      {
        kind: "text",
        frames: [],
        options: { text: "System Status" },
        context: makeContext(),
      },
      target,
    );

    assert.equal(calls.setOption[0].option.title.text, "System Status");
    assert.deepEqual(calls.setOption[0].option.series, []);
  });
});
