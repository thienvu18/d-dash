import type {
  DataFrame,
  VisualizationAdapter,
  VisualizationCapabilities,
  VisualizationRenderRequest,
} from "@d-dash/core";

// ---------------------------------------------------------------------------
// ECharts structural types
// Using structural interfaces keeps the adapter decoupled from echarts' exact
// import path and makes unit testing DOM-free.
// ---------------------------------------------------------------------------

/** Minimal subset of an ECharts instance used by this adapter. */
export type EChartsInstance = {
  setOption(option: Record<string, unknown>, notMerge?: boolean): void;
  resize(): void;
  dispose(): void;
};

/** Minimal factory shape matching echarts.init(). */
export type EChartsFactory = {
  init(el: HTMLElement, theme?: string): EChartsInstance;
};

// ---------------------------------------------------------------------------
// Target and adapter options
// ---------------------------------------------------------------------------

/** Target passed to every adapter method; the host app owns the element. */
export type EChartsTarget = {
  el: HTMLElement;
  /** Optional ECharts theme name, e.g. "dark". */
  theme?: string;
};

export type EChartsAdapterOptions = {
  /** The echarts object (or compatible factory). Injected for testability. */
  echarts: EChartsFactory;
};

// ---------------------------------------------------------------------------
// DataFrame → ECharts option converters
// ---------------------------------------------------------------------------

/**
 * Converts DataFrames to an ECharts line-chart option for `timeseries` widgets.
 * Expects frames with a "time" field and one or more numeric fields.
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

    const xAxisData = timeField.values.map((v) => (typeof v === "number" ? new Date(v).toISOString() : v));

    for (const field of valueFields) {
      const data = field.values.map((v, i) => [xAxisData[i], v]);
      series.push({
        name: field.name,
        type: "line",
        data,
        smooth: true,
        ...((options["seriesOverrides"] as Record<string, unknown> | undefined)?.[field.name] ?? {}),
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
        ...((options["gaugeOverrides"] as Record<string, unknown> | undefined) ?? {}),
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
  const subtext = typeof options["subtext"] === "string" ? options["subtext"] : undefined;

  return {
    title: {
      text,
      subtext,
      left: "center",
      top: "center",
      textStyle: { fontSize: 16, ...((options["textStyle"] as Record<string, unknown> | undefined) ?? {}) },
    },
    xAxis: { show: false },
    yAxis: { show: false },
    series: [],
    ...options,
  };
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

const CAPABILITIES: VisualizationCapabilities = {
  supportsTimeSeries: true,
  supportsStat: true,
  supportsTextWidget: true,
  supportsResize: true,
};

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
  ];
}

function makeEChartsAdapter(
  kind: "timeseries" | "stat" | "text",
  adapterOptions: EChartsAdapterOptions,
): VisualizationAdapter<EChartsTarget> {
  // One ECharts instance per container element, keyed weakly to avoid leaks.
  const instances = new WeakMap<HTMLElement, EChartsInstance>();

  return {
    type: kind,
    capabilities: CAPABILITIES,

    init(target: EChartsTarget): void {
      // Idempotent — safe to call multiple times on the same element.
      if (instances.has(target.el)) {
        return;
      }
      const chart = adapterOptions.echarts.init(target.el, target.theme);
      instances.set(target.el, chart);
    },

    render(request: VisualizationRenderRequest, target: EChartsTarget): void {
      // Auto-init if the host did not call init() explicitly.
      if (!instances.has(target.el)) {
        this.init!(target);
      }

      const chart = instances.get(target.el)!;
      const opts = (request.options as Record<string, unknown> | undefined) ?? {};
      let option: Record<string, unknown>;

      if (kind === "timeseries") {
        option = dataFramesToTimeseriesOption(request.frames, opts);
      } else if (kind === "stat") {
        option = dataFramesToStatOption(request.frames, opts);
      } else {
        // text
        option = widgetOptionsToTextOption(opts);
      }

      chart.setOption(option, /* notMerge */ true);
    },

    resize(target: EChartsTarget): void {
      instances.get(target.el)?.resize();
    },

    destroy(target: EChartsTarget): void {
      const chart = instances.get(target.el);
      if (chart) {
        chart.dispose();
        instances.delete(target.el);
      }
    },
  };
}
