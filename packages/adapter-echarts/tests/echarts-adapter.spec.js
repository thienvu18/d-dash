import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  createEChartsAdapters,
  connectEChartsGroup,
  dataFramesToTimeseriesOption,
  dataFramesToGaugeOption,
  dataFramesToBarOption,
  dataFramesToPieOption,
  dataFramesToHeatmapOption,
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
  test("returns five adapters for all supported kinds", () => {
    const { factory } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });

    assert.equal(adapters.length, 5);
    assert.deepEqual(
      adapters.map((a) => a.type),
      ["timeseries", "gauge", "bar", "pie", "heatmap"],
    );
  });

  test("each adapter declares timeseries and resize capabilities", () => {
    const { factory } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });

    for (const adapter of adapters) {
      assert.equal(
        adapter.capabilities?.supportsTimeSeries,
        true,
        `${adapter.type} supportsTimeSeries`,
      );
      assert.equal(
        adapter.capabilities?.supportsResize,
        true,
        `${adapter.type} supportsResize`,
      );
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

    timeseries.render(
      { kind: "timeseries", frames: [], options: {}, context: makeContext() },
      target,
    );

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
        fields: [{ name: "cpu", type: "number", values: [10] }],
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
});

// ---------------------------------------------------------------------------
// createEChartsAdapters — new chart kinds
// ---------------------------------------------------------------------------

describe("createEChartsAdapters — new kinds (gauge, bar, pie, heatmap)", () => {
  test("returns five adapters including the four chart kinds", () => {
    const { factory } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });

    assert.equal(adapters.length, 5);
    const kinds = adapters.map((a) => a.type);
    for (const kind of ["gauge", "bar", "pie", "heatmap"]) {
      assert.ok(kinds.includes(kind), `expected kind '${kind}' to be present`);
    }
  });

  test("new adapters declare supportsGauge, supportsBar, supportsPie, supportsHeatmap capabilities", () => {
    const { factory } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });

    for (const kind of ["gauge", "bar", "pie", "heatmap"]) {
      const adapter = adapters.find((a) => a.type === kind);
      assert.ok(adapter, `adapter for '${kind}' not found`);
      assert.equal(adapter.capabilities?.supportsGauge, true, `${kind} supportsGauge`);
      assert.equal(adapter.capabilities?.supportsBar, true, `${kind} supportsBar`);
      assert.equal(adapter.capabilities?.supportsPie, true, `${kind} supportsPie`);
      assert.equal(adapter.capabilities?.supportsHeatmap, true, `${kind} supportsHeatmap`);
    }
  });

  test("gauge render produces a gauge series with min/max", () => {
    const { factory, calls } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });
    const gauge = adapters.find((a) => a.type === "gauge");

    gauge.render(
      {
        kind: "gauge",
        frames: [{ fields: [{ name: "temp", type: "number", values: [37, 42] }] }],
        options: { min: 0, max: 100 },
        context: makeContext(),
      },
      makeTarget(),
    );

    const opt = calls.setOption[0].option;
    assert.equal(opt.series[0].type, "gauge");
    assert.equal(opt.series[0].min, 0);
    assert.equal(opt.series[0].max, 100);
    // Last value should be used.
    assert.equal(opt.series[0].data[0].value, 42);
  });

  test("bar render maps categories to xAxis and numeric field to bar series", () => {
    const { factory, calls } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });
    const bar = adapters.find((a) => a.type === "bar");

    bar.render(
      {
        kind: "bar",
        frames: [
          {
            fields: [
              { name: "host", type: "string", values: ["web-1", "web-2"] },
              { name: "req/s", type: "number", values: [100, 200] },
            ],
          },
        ],
        options: {},
        context: makeContext(),
      },
      makeTarget(),
    );

    const opt = calls.setOption[0].option;
    assert.equal(opt.series[0].type, "bar");
    assert.deepEqual(opt.series[0].data, [100, 200]);
    assert.deepEqual(opt.xAxis.data, ["web-1", "web-2"]);
  });

  test("bar render swaps axes when orientation is horizontal", () => {
    const { factory, calls } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });
    const bar = adapters.find((a) => a.type === "bar");

    bar.render(
      {
        kind: "bar",
        frames: [
          {
            fields: [
              { name: "host", type: "string", values: ["web-1"] },
              { name: "req/s", type: "number", values: [100] },
            ],
          },
        ],
        options: { orientation: "horizontal" },
        context: makeContext(),
      },
      makeTarget(),
    );

    const opt = calls.setOption[0].option;
    // With horizontal orientation xAxis should be value, yAxis should be category.
    assert.equal(opt.xAxis.type, "value");
    assert.equal(opt.yAxis.type, "category");
  });

  test("pie render maps name+value fields to pieData", () => {
    const { factory, calls } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });
    const pie = adapters.find((a) => a.type === "pie");

    pie.render(
      {
        kind: "pie",
        frames: [
          {
            fields: [
              { name: "label", type: "string", values: ["A", "B"] },
              { name: "count", type: "number", values: [30, 70] },
            ],
          },
        ],
        options: {},
        context: makeContext(),
      },
      makeTarget(),
    );

    const opt = calls.setOption[0].option;
    assert.equal(opt.series[0].type, "pie");
    assert.equal(opt.series[0].data.length, 2);
    assert.equal(opt.series[0].data[0].name, "A");
    assert.equal(opt.series[0].data[0].value, 30);
  });

  test("pie render uses donut radius when donut option is true", () => {
    const { factory, calls } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });
    const pie = adapters.find((a) => a.type === "pie");

    pie.render(
      {
        kind: "pie",
        frames: [],
        options: { donut: true },
        context: makeContext(),
      },
      makeTarget(),
    );

    const opt = calls.setOption[0].option;
    assert.deepEqual(opt.series[0].radius, ["40%", "70%"]);
  });

  test("heatmap render produces heatmap series with visualMap", () => {
    const { factory, calls } = makeEChartsFactory();
    const adapters = createEChartsAdapters({ echarts: factory });
    const heatmap = adapters.find((a) => a.type === "heatmap");

    heatmap.render(
      {
        kind: "heatmap",
        frames: [
          {
            fields: [
              { name: "time", type: "time", values: [1_000_000, 2_000_000] },
              { name: "host", type: "string", values: ["web-1", "web-1"] },
              { name: "lat", type: "number", values: [5, 10] },
            ],
          },
        ],
        options: {},
        context: makeContext(),
      },
      makeTarget(),
    );

    const opt = calls.setOption[0].option;
    assert.equal(opt.series[0].type, "heatmap");
    assert.equal(opt.series[0].data.length, 2);
    assert.ok(opt.visualMap, "visualMap should be defined");
  });
});

// ---------------------------------------------------------------------------
// dataFramesToGaugeOption
// ---------------------------------------------------------------------------

describe("dataFramesToGaugeOption", () => {
  test("reads last value of first numeric field", () => {
    const frames = [
      { fields: [{ name: "cpu", type: "number", values: [10, 87] }] },
    ];
    const opt = dataFramesToGaugeOption(frames, { min: 0, max: 100 });
    assert.equal(opt.series[0].data[0].value, 87);
    assert.equal(opt.series[0].min, 0);
    assert.equal(opt.series[0].max, 100);
  });

  test("applies unit to detail formatter", () => {
    const opt = dataFramesToGaugeOption(
      [{ fields: [{ name: "temp", type: "number", values: [36] }] }],
      { unit: "°C" },
    );
    assert.equal(opt.series[0].detail.formatter, "{value} °C");
  });

  test("builds axisLine color zones from thresholds", () => {
    const opt = dataFramesToGaugeOption(
      [{ fields: [{ name: "v", type: "number", values: [50] }] }],
      {
        min: 0,
        max: 100,
        thresholds: [
          { value: 60, color: "green" },
          { value: 80, color: "orange" },
        ],
      },
    );
    const zones = opt.series[0].axisLine.lineStyle.color;
    assert.ok(Array.isArray(zones));
    // First zone fraction should be 0.6 (60/100).
    assert.equal(zones[0][0], 0.6);
    assert.equal(zones[0][1], "green");
    // Last zone should reach 1.
    assert.equal(zones[zones.length - 1][0], 1);
  });

  test("no axisLine when no thresholds", () => {
    const opt = dataFramesToGaugeOption(
      [{ fields: [{ name: "v", type: "number", values: [50] }] }],
      {},
    );
    assert.equal(opt.series[0].axisLine, undefined);
  });
});

// ---------------------------------------------------------------------------
// dataFramesToBarOption
// ---------------------------------------------------------------------------

describe("dataFramesToBarOption", () => {
  test("stacked option sets stack property on each series", () => {
    const frames = [
      {
        fields: [
          { name: "env", type: "string", values: ["prod"] },
          { name: "errors", type: "number", values: [5] },
          { name: "warnings", type: "number", values: [12] },
        ],
      },
    ];
    const opt = dataFramesToBarOption(frames, { stacked: true });
    for (const s of opt.series) {
      assert.equal(s.stack, "total");
    }
  });

  test("applies thresholds as markLine", () => {
    const frames = [
      {
        fields: [
          { name: "env", type: "string", values: ["prod"] },
          { name: "errors", type: "number", values: [5] },
        ],
      },
    ];
    const opt = dataFramesToBarOption(frames, {
      thresholds: [{ value: 3, color: "red", label: "SLO" }],
    });
    assert.ok(opt.series[0].markLine, "markLine should be defined");
    assert.equal(opt.series[0].markLine.data[0].yAxis, 3);
    assert.equal(opt.series[0].markLine.data[0].lineStyle.color, "red");
  });

  test("no markLine when no thresholds", () => {
    const frames = [
      {
        fields: [
          { name: "env", type: "string", values: ["prod"] },
          { name: "errors", type: "number", values: [5] },
        ],
      },
    ];
    const opt = dataFramesToBarOption(frames, {});
    assert.equal(opt.series[0].markLine, undefined);
  });

  test("skips frames without a category field", () => {
    const frames = [
      { fields: [{ name: "num", type: "number", values: [1, 2, 3] }] },
    ];
    const opt = dataFramesToBarOption(frames);
    assert.equal(opt.series.length, 0);
  });
});

// ---------------------------------------------------------------------------
// dataFramesToPieOption
// ---------------------------------------------------------------------------

describe("dataFramesToPieOption", () => {
  test("skips frames missing name or value field", () => {
    const opt = dataFramesToPieOption([
      { fields: [{ name: "only_numbers", type: "number", values: [1] }] },
    ]);
    assert.equal(opt.series[0].data.length, 0);
  });

  test("hides legend when legend option is false", () => {
    const opt = dataFramesToPieOption([], { legend: false });
    assert.equal(opt.legend.show, false);
  });
});

// ---------------------------------------------------------------------------
// dataFramesToHeatmapOption
// ---------------------------------------------------------------------------

describe("dataFramesToHeatmapOption", () => {
  test("uses custom colorRange when provided", () => {
    const opt = dataFramesToHeatmapOption(
      [
        {
          fields: [
            { name: "t", type: "time", values: [1_000_000] },
            { name: "host", type: "string", values: ["web-1"] },
            { name: "lat", type: "number", values: [5] },
          ],
        },
      ],
      { colorRange: ["#ffffff", "#000000"] },
    );
    assert.deepEqual(opt.visualMap.inRange.color, ["#ffffff", "#000000"]);
  });

  test("skips frames missing required fields", () => {
    const opt = dataFramesToHeatmapOption([
      { fields: [{ name: "num", type: "number", values: [1] }] },
    ]);
    assert.equal(opt.series[0].data.length, 0);
  });
});

// ---------------------------------------------------------------------------
// dataFramesToTimeseriesOption — threshold markLine
// ---------------------------------------------------------------------------

describe("dataFramesToTimeseriesOption — thresholds", () => {
  test("attaches markLine to each series when thresholds are specified", () => {
    const frames = [
      {
        fields: [
          { name: "time", type: "time", values: [1_000_000] },
          { name: "cpu", type: "number", values: [50] },
        ],
      },
    ];
    const opt = dataFramesToTimeseriesOption(frames, {
      thresholds: [
        { value: 80, color: "red", label: "HIGH" },
        { value: 60, color: "orange" },
      ],
    });
    const ml = opt.series[0].markLine;
    assert.ok(ml, "markLine should be present");
    assert.equal(ml.data.length, 2);
    assert.equal(ml.data[0].yAxis, 80);
    assert.equal(ml.data[0].lineStyle.color, "red");
    assert.equal(ml.data[0].label.formatter, "HIGH");
    assert.equal(ml.data[1].yAxis, 60);
    assert.equal(ml.data[1].label.formatter, "60");
  });

  test("no markLine when thresholds array is empty", () => {
    const frames = [
      {
        fields: [
          { name: "time", type: "time", values: [1_000_000] },
          { name: "cpu", type: "number", values: [50] },
        ],
      },
    ];
    const opt = dataFramesToTimeseriesOption(frames, { thresholds: [] });
    assert.equal(opt.series[0].markLine, undefined);
  });
});

// ---------------------------------------------------------------------------
// connectEChartsGroup
// ---------------------------------------------------------------------------

describe("connectEChartsGroup", () => {
  test("calls echarts.connect with the provided group name", () => {
    const connectCalls = [];
    const mockEcharts = {
      init: () => ({ setOption() {}, resize() {}, dispose() {} }),
      connect(name) { connectCalls.push(name); },
    };

    connectEChartsGroup(mockEcharts, "dashboard-1");

    assert.equal(connectCalls.length, 1);
    assert.equal(connectCalls[0], "dashboard-1");
  });
});

// ---------------------------------------------------------------------------
// EChartsTarget.group — crosshair sync init
// ---------------------------------------------------------------------------

describe("EChartsTarget.group — crosshair group assignment", () => {
  test("assigns group to ECharts instance when target.group is set", () => {
    const groups = [];
    const factory = {
      init(_el, _theme) {
        const instance = {
          setOption() {},
          resize() {},
          dispose() {},
          set group(name) { groups.push(name); },
        };
        return instance;
      },
    };

    const adapters = createEChartsAdapters({ echarts: factory });
    const [timeseries] = adapters;
    timeseries.init({ el: {}, group: "g1" });

    assert.equal(groups.length, 1);
    assert.equal(groups[0], "g1");
  });

  test("does not set group when target.group is omitted", () => {
    const groups = [];
    const factory = {
      init(_el, _theme) {
        const instance = {
          setOption() {},
          resize() {},
          dispose() {},
          set group(name) { groups.push(name); },
        };
        return instance;
      },
    };

    const adapters = createEChartsAdapters({ echarts: factory });
    const [timeseries] = adapters;
    timeseries.init({ el: {} });

    assert.equal(groups.length, 0);
  });
});
