import type {
  DataFrame,
  VisualizationAdapter,
  VisualizationCapabilities,
  VisualizationRenderRequest,
} from "@d-dash/core";
// Use the official `echarts` types for full compatibility and better typing.
import type * as echarts from "echarts";

// ---------------------------------------------------------------------------
// Threshold type shared across numeric chart variants
// ---------------------------------------------------------------------------

/**
 * A single threshold entry used by timeseries, bar, and gauge adapters.
 * - For timeseries/bar: rendered as a `markLine` at the given y-value.
 * - For gauge: rendered as a color zone in `axisLine.lineStyle.color`.
 * @experimental
 */
export type ThresholdEntry = {
  value: number;
  color: string;
  label?: string;
};

// ---------------------------------------------------------------------------
// Target and adapter options
// ---------------------------------------------------------------------------

/** Target passed to every adapter method; the host app owns the element. */
export type EChartsTarget = {
  el: HTMLElement;
  /** Optional ECharts theme name, e.g. "dark". */
  theme?: string;
  /**
   * Optional crosshair sync group name. Set the same value across all widget targets
   * in a dashboard, then call `connectEChartsGroup(echarts, groupName)` once after
   * all adapters are initialised.
   * @experimental
   */
  group?: string;
};

export type EChartsAdapterOptions = {
  /** The echarts module (injected for testability). */
  echarts: typeof echarts;
  /**
   * Optional sanitizer for html widget content.
   * If omitted, a conservative built-in sanitizer is used.
   */
  sanitizeHtml?: (rawHtml: string) => string;
};

// ---------------------------------------------------------------------------
// DataFrame → ECharts option converters
// ---------------------------------------------------------------------------

/**
 * Converts DataFrames to an ECharts line-chart option for `timeseries` widgets.
 * Expects frames with a "time" field and one or more numeric fields.
 *
 * Accepts optional `options.thresholds` to render horizontal `markLine` rules.
 */
export function dataFramesToTimeseriesOption(
  frames: DataFrame[],
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const series: unknown[] = [];

  for (const frame of frames) {
    const timeField = frame.fields.find((f) => f.type === "time");
    const valueFields = frame.fields.filter((f) => f.type === "number");

    if (!timeField) {
      continue;
    }

    const xAxisData = timeField.values.map((v) =>
      typeof v === "number" ? new Date(v).toISOString() : v,
    );

    for (const field of valueFields) {
      const data = field.values.map((v, i) => [xAxisData[i], v]);
      series.push({
        name: field.name,
        type: "line",
        data,
        smooth: true,
        markLine: buildMarkLine(options["thresholds"] as ThresholdEntry[] | undefined),
        ...((
          options["seriesOverrides"] as Record<string, unknown> | undefined
        )?.[field.name] ?? {}),
      });
    }
  }

  return {
    tooltip: { trigger: "axis" },
    xAxis: { type: "time" },
    yAxis: { type: "value" },
    series,
    ...options,
  };
}

/**
 * Converts DataFrames to an ECharts option for `stat` widgets.
 * Reads the last value of the first numeric field across all frames.
 */
export function dataFramesToStatOption(
  frames: DataFrame[],
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  let value: unknown = null;
  let name = "";

  outer: for (const frame of frames) {
    for (const field of frame.fields) {
      if (field.type === "number" && field.values.length > 0) {
        value = field.values[field.values.length - 1];
        name = field.name;
        break outer;
      }
    }
  }

  return {
    series: [
      {
        type: "gauge",
        data: [{ name, value }],
        ...((options["gaugeOverrides"] as
          | Record<string, unknown>
          | undefined) ?? {}),
      },
    ],
    ...options,
  };
}

/**
 * Converts DataFrames to an ECharts gauge option for `gauge` widgets.
 * Reads the last value of the first numeric field. Supports `min`, `max`,
 * `unit`, and `thresholds` options for ranged color zones.
 * @experimental
 */
export function dataFramesToGaugeOption(
  frames: DataFrame[],
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  let value: unknown = 0;
  let name = "";

  outer: for (const frame of frames) {
    for (const field of frame.fields) {
      if (field.type === "number" && field.values.length > 0) {
        value = field.values[field.values.length - 1];
        name = field.name;
        break outer;
      }
    }
  }

  const min = typeof options["min"] === "number" ? options["min"] : 0;
  const max = typeof options["max"] === "number" ? options["max"] : 100;
  const unit = typeof options["unit"] === "string" ? options["unit"] : "";
  const thresholds = options["thresholds"] as ThresholdEntry[] | undefined;

  // Build axisLine color stops from thresholds (sorted ascending by value).
  const axisLineColor = buildGaugeColorZones(thresholds, min, max);

  return {
    series: [
      {
        type: "gauge",
        min,
        max,
        detail: { formatter: unit ? `{value} ${unit}` : "{value}" },
        // Only set axisLine when there are explicit color zones; omitting it lets
        // ECharts use its built-in default ([[1, '#E6EBF8']]), which is required
        // by GaugeView — it crashes if axisLine.lineStyle.color is undefined.
        ...(axisLineColor ? { axisLine: { lineStyle: { color: axisLineColor } } } : {}),
        data: [{ name, value }],
        ...((options["gaugeOverrides"] as Record<string, unknown> | undefined) ?? {}),
      },
    ],
    ...options,
  };
}

/**
 * Converts DataFrames to an ECharts bar-chart option for `bar` widgets.
 * Maps the first string/time field to xAxis (or yAxis for horizontal) and
 * all numeric fields to bar series.
 *
 * Supports options: `orientation` ("horizontal"|"vertical"), `stacked` (boolean),
 * `seriesOverrides`, and `thresholds`.
 * @experimental
 */
export function dataFramesToBarOption(
  frames: DataFrame[],
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const series: unknown[] = [];
  const isHorizontal = options["orientation"] === "horizontal";
  const stacked = options["stacked"] === true;
  let categories: unknown[] = [];

  for (const frame of frames) {
    const catField = frame.fields.find(
      (f) => f.type === "string" || f.type === "time",
    );
    const valueFields = frame.fields.filter((f) => f.type === "number");

    if (!catField) {
      continue;
    }

    categories = catField.values.map((v) =>
      typeof v === "number" ? new Date(v).toISOString() : v,
    );

    for (const field of valueFields) {
      series.push({
        name: field.name,
        type: "bar",
        data: field.values,
        stack: stacked ? "total" : undefined,
        markLine: buildMarkLine(options["thresholds"] as ThresholdEntry[] | undefined),
        ...((options["seriesOverrides"] as Record<string, unknown> | undefined)?.[field.name] ?? {}),
      });
    }
  }

  const categoryAxis = { type: "category", data: categories };
  const valueAxis = { type: "value" };

  return {
    tooltip: { trigger: "axis" },
    xAxis: isHorizontal ? valueAxis : categoryAxis,
    yAxis: isHorizontal ? categoryAxis : valueAxis,
    series,
    ...options,
  };
}

/**
 * Converts DataFrames to an ECharts pie/donut option for `pie` widgets.
 * Expects frames with one string field (names) and one numeric field (values).
 *
 * Supports options: `donut` (boolean), `legend` (boolean), `labels` (boolean).
 * @experimental
 */
export function dataFramesToPieOption(
  frames: DataFrame[],
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const pieData: { name: unknown; value: unknown }[] = [];

  for (const frame of frames) {
    const nameField = frame.fields.find((f) => f.type === "string");
    const valueField = frame.fields.find((f) => f.type === "number");

    if (!nameField || !valueField) {
      continue;
    }

    for (let i = 0; i < nameField.values.length; i += 1) {
      pieData.push({ name: nameField.values[i], value: valueField.values[i] });
    }
  }

  // Destructure adapter-specific flags so they are not forwarded to ECharts via spread.
  const { donut, legend, labels, pieOverrides, ...passthroughOptions } = options as {
    donut?: boolean;
    legend?: boolean;
    labels?: boolean;
    pieOverrides?: Record<string, unknown>;
    [key: string]: unknown;
  };

  const isDonut = donut === true;
  const showLegend = legend !== false;
  const showLabels = labels !== false;

  return {
    tooltip: { trigger: "item" },
    legend: showLegend ? { orient: "vertical", left: "left" } : { show: false },
    series: [
      {
        type: "pie",
        radius: isDonut ? ["40%", "70%"] : "70%",
        data: pieData,
        label: { show: showLabels },
        ...(pieOverrides ?? {}),
      },
    ],
    ...passthroughOptions,
  };
}

/**
 * Converts DataFrames to an ECharts heatmap option for `heatmap` widgets.
 * Expects frames with time, string (category), and numeric (value) fields.
 *
 * Supports options: `colorRange` ([minColor, maxColor]) and `bucketSize`.
 * @experimental
 */
export function dataFramesToHeatmapOption(
  frames: DataFrame[],
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const heatData: [unknown, unknown, unknown][] = [];
  const timeLabels: unknown[] = [];
  const categoryLabels: unknown[] = [];
  const catLabelSet = new Set<unknown>();

  for (const frame of frames) {
    const timeField = frame.fields.find((f) => f.type === "time");
    const catField = frame.fields.find((f) => f.type === "string");
    const valueField = frame.fields.find((f) => f.type === "number");

    if (!timeField || !catField || !valueField) {
      continue;
    }

    for (let i = 0; i < timeField.values.length; i += 1) {
      const t = typeof timeField.values[i] === "number"
        ? new Date(timeField.values[i] as number).toISOString()
        : timeField.values[i];
      const cat = catField.values[i];
      const val = valueField.values[i];

      if (!timeLabels.includes(t)) {
        timeLabels.push(t);
      }
      if (!catLabelSet.has(cat)) {
        catLabelSet.add(cat);
        categoryLabels.push(cat);
      }

      heatData.push([t, cat, val]);
    }
  }

  const colorRange = Array.isArray(options["colorRange"])
    ? (options["colorRange"] as [string, string])
    : ["#313695", "#a50026"];

  return {
    tooltip: { position: "top" },
    xAxis: { type: "category", data: timeLabels },
    yAxis: { type: "category", data: categoryLabels },
    visualMap: {
      calculable: true,
      orient: "horizontal",
      left: "center",
      inRange: { color: colorRange },
    },
    series: [
      {
        type: "heatmap",
        data: heatData,
        label: { show: false },
        ...((options["heatmapOverrides"] as Record<string, unknown> | undefined) ?? {}),
      },
    ],
    ...options,
  };
}

/**
 * Converts widget options to an ECharts graphic/title option for `text` widgets.
 * The text content is read from `options.text`; data frames are ignored.
 */
export function widgetOptionsToTextOption(
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const text = typeof options["text"] === "string" ? options["text"] : "";
  const subtext =
    typeof options["subtext"] === "string" ? options["subtext"] : undefined;

  return {
    title: {
      text,
      subtext,
      left: "center",
      top: "center",
      textStyle: {
        fontSize: 16,
        ...((options["textStyle"] as Record<string, unknown> | undefined) ??
          {}),
      },
    },
    xAxis: { show: false },
    yAxis: { show: false },
    series: [],
    ...options,
  };
}

/**
 * Resolves and sanitizes html content for `html` widgets.
 * The sanitized string is intended for host-controlled rendering.
 */
export function widgetOptionsToHtmlContent(
  options: Record<string, unknown> = {},
  sanitizeHtml: (rawHtml: string) => string = defaultSanitizeHtml,
): string {
  const raw = typeof options["html"] === "string" ? options["html"] : "";
  return sanitizeHtml(raw);
}

function defaultSanitizeHtml(rawHtml: string): string {
  // Minimal baseline sanitization. Host apps can provide a stricter sanitizer.
  return rawHtml
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

// ---------------------------------------------------------------------------
// Threshold helpers
// ---------------------------------------------------------------------------

/** Builds an ECharts markLine config for threshold lines. Returns undefined when no thresholds. */
function buildMarkLine(
  thresholds: ThresholdEntry[] | undefined,
): Record<string, unknown> | undefined {
  if (!thresholds || thresholds.length === 0) {
    return undefined;
  }

  return {
    symbol: "none",
    data: thresholds.map((t) => ({
      yAxis: t.value,
      label: {
        formatter: t.label ?? String(t.value),
      },
      lineStyle: { color: t.color },
    })),
  };
}

/**
 * Builds ECharts axisLine color zones for a gauge from threshold entries.
 * Returns an array of [fraction, color] pairs ordered 0 → 1, or undefined.
 */
function buildGaugeColorZones(
  thresholds: ThresholdEntry[] | undefined,
  min: number,
  max: number,
): [number, string][] | undefined {
  if (!thresholds || thresholds.length === 0) {
    return undefined;
  }

  const range = max - min || 1;
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  const zones: [number, string][] = sorted.map((t) => [
    Math.min(1, Math.max(0, (t.value - min) / range)),
    t.color,
  ]);

  // Ensure the last zone reaches 1 using the final color.
  if (zones[zones.length - 1][0] < 1) {
    zones.push([1, zones[zones.length - 1][1]]);
  }

  return zones;
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

const CAPABILITIES: VisualizationCapabilities = {
  supportsTimeSeries: true,
  supportsStat: true,
  supportsTextWidget: true,
  supportsHtmlWidget: true,
  supportsResize: true,
  supportsGauge: true,
  supportsBar: true,
  supportsPie: true,
  supportsHeatmap: true,
};

/** All visualization kinds supported by the ECharts adapter factory. */
type EChartsKind =
  | "timeseries"
  | "stat"
  | "text"
  | "html"
  | "gauge"
  | "bar"
  | "pie"
  | "heatmap";

/**
 * Creates d-dash VisualizationAdapters backed by ECharts for each supported kind.
 * Returns an array so each kind can be registered independently.
 *
 * Usage:
 * ```ts
 * import * as echarts from "echarts";
 * import { createEChartsAdapters } from "@d-dash/adapter-echarts";
 *
 * for (const adapter of createEChartsAdapters({ echarts })) {
 *   registry.registerVisualization(adapter);
 * }
 * ```
 */
export function createEChartsAdapters(
  adapterOptions: EChartsAdapterOptions,
): VisualizationAdapter<EChartsTarget>[] {
  return [
    makeEChartsAdapter("timeseries", adapterOptions),
    makeEChartsAdapter("stat", adapterOptions),
    makeEChartsAdapter("text", adapterOptions),
    makeEChartsAdapter("html", adapterOptions),
    makeEChartsAdapter("gauge", adapterOptions),
    makeEChartsAdapter("bar", adapterOptions),
    makeEChartsAdapter("pie", adapterOptions),
    makeEChartsAdapter("heatmap", adapterOptions),
  ];
}

/**
 * Connects all ECharts instances that share the given `group` name so that
 * tooltip crosshair events are synchronised across panels. Call this once
 * after all widgets have been rendered.
 *
 * @param echartsLib - The ECharts module (same reference passed to `createEChartsAdapters`).
 * @param groupName  - The group name used in `EChartsTarget.group`.
 * @experimental
 */
export function connectEChartsGroup(
  echartsLib: EChartsAdapterOptions["echarts"],
  groupName: string,
): void {
  echartsLib.connect(groupName);
}

function makeEChartsAdapter(
  kind: EChartsKind,
  adapterOptions: EChartsAdapterOptions,
): VisualizationAdapter<EChartsTarget> {
  // One ECharts instance per container element, keyed weakly to avoid leaks.
  const instances = new WeakMap<HTMLElement, echarts.ECharts>();

  return {
    type: kind,
    capabilities: CAPABILITIES,

    init(target: EChartsTarget): void {
      if (kind === "html") {
        return;
      }

      // Idempotent — safe to call multiple times on the same element.
      if (instances.has(target.el)) {
        return;
      }
      const chart = adapterOptions.echarts.init(target.el, target.theme);
      // Assign crosshair sync group if specified on the target.
      if (target.group) {
        (chart as unknown as { group: string }).group = target.group;
      }
      instances.set(target.el, chart);
    },

    render(request: VisualizationRenderRequest, target: EChartsTarget): void {
      if (kind === "html") {
        const opts =
          (request.options as Record<string, unknown> | undefined) ?? {};
        const sanitizedHtml = widgetOptionsToHtmlContent(
          opts,
          adapterOptions.sanitizeHtml,
        );
        target.el.innerHTML = sanitizedHtml;
        return;
      }

      // Auto-init if the host did not call init() explicitly.
      if (!instances.has(target.el)) {
        this.init!(target);
      }

      const chart = instances.get(target.el)!;
      const opts =
        (request.options as Record<string, unknown> | undefined) ?? {};
      let option: Record<string, unknown>;

      if (kind === "timeseries") {
        option = dataFramesToTimeseriesOption(request.frames, opts);
      } else if (kind === "stat") {
        option = dataFramesToStatOption(request.frames, opts);
      } else if (kind === "gauge") {
        option = dataFramesToGaugeOption(request.frames, opts);
      } else if (kind === "bar") {
        option = dataFramesToBarOption(request.frames, opts);
      } else if (kind === "pie") {
        option = dataFramesToPieOption(request.frames, opts);
      } else if (kind === "heatmap") {
        option = dataFramesToHeatmapOption(request.frames, opts);
      } else {
        // text
        option = widgetOptionsToTextOption(opts);
      }

      chart.setOption(option, /* notMerge */ true);
    },

    resize(target: EChartsTarget): void {
      if (kind === "html") {
        return;
      }
      instances.get(target.el)?.resize();
    },

    destroy(target: EChartsTarget): void {
      if (kind === "html") {
        target.el.innerHTML = "";
        return;
      }

      const chart = instances.get(target.el);
      if (chart) {
        chart.dispose();
        instances.delete(target.el);
      }
    },
  };
}
