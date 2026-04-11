import type { JsonObject } from "./json";
import type {
  PersistedWidget,
  WidgetQuery,
  WidgetVisualization,
  WidgetDisplay,
} from "./schema";

/** Fully resolved absolute time range used for execution. */
export type ResolvedTimeRange = {
  from: number;
  to: number;
  source: "dashboard" | "widget";
};

/**
 * Resolved template variable values keyed by variable name.
 * Multi-value variables hold a string array; single-value variables hold a string.
 * @experimental
 */
export type ResolvedVariables = Record<string, string | string[]>;

/** Runtime context forwarded through query and render paths. */
export type RuntimeContext = {
  traceId: string;
  featureFlags?: Record<string, boolean>;
  cancellation?: {
    isCancelled: boolean;
  };
  /**
   * Resolved template variable values. When present, `$variableName` occurrences
   * in widget query filter string values are substituted before execution.
   * @experimental
   */
  resolvedVariables?: ResolvedVariables;
};

/** Execution-ready widget request built from persisted and resolved contracts. */
export type ResolvedWidgetExecutionRequest = {
  dashboardId: string;
  widgetId: string;
  datasourceId: string;
  query: WidgetQuery;
  visualization: WidgetVisualization;
  resolvedTimeRange: ResolvedTimeRange;
  options?: JsonObject;
  display?: WidgetDisplay;
  context: RuntimeContext;
};

/** Runtime widget view model with effective time range. */
export type RuntimeWidget = PersistedWidget & {
  effectiveTimeRange: ResolvedTimeRange;
};

/** Time-range resolution error contract. */
export type TimeRangeResolveError = {
  code: "TIME_RANGE_RESOLVE_FAILED";
  message: string;
  details?: JsonObject;
  retriable?: boolean;
};

/** Optional controls for time-range resolution. */
export type TimeResolveOptions = {
  now?: number;
};

class TimeRangeResolveException extends Error implements TimeRangeResolveError {
  readonly code = "TIME_RANGE_RESOLVE_FAILED" as const;
  readonly details?: JsonObject;
  readonly retriable = false;

  constructor(message: string, details?: JsonObject) {
    super(message);
    this.name = "TimeRangeResolveException";
    this.details = details;
  }
}

/**
 * Resolves dashboard-level time range input into absolute epoch millisecond bounds.
 */
export function resolveDashboardTimeRange(
  input:
    | { type: "relative"; value: string }
    | { type: "absolute"; from: number; to: number },
  options: TimeResolveOptions = {},
): ResolvedTimeRange {
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();

  if (input.type === "absolute") {
    if (
      !Number.isFinite(input.from) ||
      !Number.isFinite(input.to) ||
      input.from > input.to
    ) {
      throw new TimeRangeResolveException(
        "Invalid absolute dashboard time range.",
        {
          type: input.type,
        },
      );
    }

    return {
      from: input.from,
      to: input.to,
      source: "dashboard",
    };
  }

  const parsed = parseRelativeRange(input.value, now);
  return {
    from: parsed.from,
    to: parsed.to,
    source: "dashboard",
  };
}

/**
 * Resolves widget-level time range by honoring inherit/relative/absolute modes.
 * When `inherit` (or undefined), the dashboard-resolved range is returned.
 */
export function resolveWidgetTimeRange(
  widgetTimeRange:
    | { type: "inherit" }
    | { type: "relative"; value: string }
    | { type: "absolute"; from: number; to: number }
    | undefined,
  dashboardResolvedTimeRange: ResolvedTimeRange,
  options: TimeResolveOptions = {},
): ResolvedTimeRange {
  if (!widgetTimeRange || widgetTimeRange.type === "inherit") {
    return dashboardResolvedTimeRange;
  }

  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();

  if (widgetTimeRange.type === "absolute") {
    if (
      !Number.isFinite(widgetTimeRange.from) ||
      !Number.isFinite(widgetTimeRange.to) ||
      widgetTimeRange.from > widgetTimeRange.to
    ) {
      throw new TimeRangeResolveException(
        "Invalid absolute widget time range.",
        {
          type: widgetTimeRange.type,
        },
      );
    }

    return {
      from: widgetTimeRange.from,
      to: widgetTimeRange.to,
      source: "widget",
    };
  }

  const parsed = parseRelativeRange(widgetTimeRange.value, now);
  return {
    from: parsed.from,
    to: parsed.to,
    source: "widget",
  };
}

function parseRelativeRange(
  expression: string,
  now: number,
): { from: number; to: number } {
  const trimmed = expression.trim();
  const match = /^now-(\d+)([smhdw])$/i.exec(trimmed);

  if (!match) {
    throw new TimeRangeResolveException(
      "Invalid relative time range expression. Expected format: now-<value><unit>.",
      { expression: trimmed },
    );
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new TimeRangeResolveException(
      "Relative time range amount must be a positive integer.",
      {
        expression: trimmed,
      },
    );
  }

  const unitMs = unitToMs(unit);
  const from = now - amount * unitMs;

  return { from, to: now };
}

function unitToMs(unit: string): number {
  switch (unit) {
    case "s":
      return 1000;
    case "m":
      return 60 * 1000;
    case "h":
      return 60 * 60 * 1000;
    case "d":
      return 24 * 60 * 60 * 1000;
    case "w":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      throw new TimeRangeResolveException(
        "Unsupported relative time range unit.",
        {
          unit,
        },
      );
  }
}
