import type { DDashError } from "./errors";
import type { MetricDefinition, PersistedDashboard, PersistedTimeRange } from "./schema";

/** Stable validation issue codes produced by dashboard schema validation. */
export type ValidationIssueCode =
  | "SCHEMA_UNSUPPORTED_VERSION"
  | "REQUIRED_FIELD_MISSING"
  | "INVALID_TIME_RANGE"
  | "DUPLICATE_LAYOUT_ID"
  | "DUPLICATE_WIDGET_ID"
  | "LAYOUT_REF_NOT_FOUND"
  | "DATASOURCE_NOT_FOUND"
  | "VISUALIZATION_NOT_FOUND"
  | "METRIC_NOT_FOUND"
  | "METRIC_VISUALIZATION_MISMATCH";

/** Single dashboard validation issue entry. */
export type ValidationIssue = {
  code: ValidationIssueCode;
  path: string;
  message: string;
};

/** Aggregated result returned by dashboard validation. */
export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

/** Optional registry and policy inputs for dashboard validation. */
export type DashboardValidationOptions = {
  knownDatasources?: readonly string[];
  knownVisualizations?: readonly string[];
  knownMetrics?: readonly MetricDefinition[];
  allowUnknownMetrics?: boolean;
};

/**
 * Validates persisted dashboard contracts and optional runtime-registered references.
 * Returns a deterministic list of issues without throwing.
 */
export function validatePersistedDashboard(
  dashboard: PersistedDashboard,
  options: DashboardValidationOptions = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (dashboard.schemaVersion !== 1) {
    issues.push({
      code: "SCHEMA_UNSUPPORTED_VERSION",
      path: "schemaVersion",
      message: "Unsupported schema version. Supported versions: [1].",
    });
  }

  if (!isNonEmptyString(dashboard.dashboardId)) {
    issues.push({
      code: "REQUIRED_FIELD_MISSING",
      path: "dashboardId",
      message: "dashboardId must be a non-empty string.",
    });
  }

  if (!isNonEmptyString(dashboard.meta?.title)) {
    issues.push({
      code: "REQUIRED_FIELD_MISSING",
      path: "meta.title",
      message: "meta.title is required.",
    });
  }

  validateTimeRange(dashboard.timeRange, "timeRange", issues);

  const layoutIds = new Set<string>();
  for (let i = 0; i < dashboard.layout.length; i += 1) {
    const layout = dashboard.layout[i];
    if (!isNonEmptyString(layout.id)) {
      issues.push({
        code: "REQUIRED_FIELD_MISSING",
        path: `layout[${i}].id`,
        message: "layout item id is required.",
      });
      continue;
    }

    if (layoutIds.has(layout.id)) {
      issues.push({
        code: "DUPLICATE_LAYOUT_ID",
        path: `layout[${i}].id`,
        message: `Duplicate layout id '${layout.id}'.`,
      });
      continue;
    }

    layoutIds.add(layout.id);
  }

  const knownDatasourceSet = new Set(options.knownDatasources ?? []);
  const knownVisualizationSet = new Set(options.knownVisualizations ?? []);
  const knownMetricMap = new Map(
    (options.knownMetrics ?? []).map((metric) => [metric.id, metric]),
  );

  const widgetIds = new Set<string>();

  for (let i = 0; i < dashboard.widgets.length; i += 1) {
    const widget = dashboard.widgets[i];
    const pathPrefix = `widgets[${i}]`;

    if (!isNonEmptyString(widget.id)) {
      issues.push({
        code: "REQUIRED_FIELD_MISSING",
        path: `${pathPrefix}.id`,
        message: "widget id is required.",
      });
    } else if (widgetIds.has(widget.id)) {
      issues.push({
        code: "DUPLICATE_WIDGET_ID",
        path: `${pathPrefix}.id`,
        message: `Duplicate widget id '${widget.id}'.`,
      });
    } else {
      widgetIds.add(widget.id);
    }

    if (!layoutIds.has(widget.layoutId)) {
      issues.push({
        code: "LAYOUT_REF_NOT_FOUND",
        path: `${pathPrefix}.layoutId`,
        message: `layoutId '${widget.layoutId}' was not found in layout.`,
      });
    }

    if (!isNonEmptyString(widget.datasource)) {
      issues.push({
        code: "REQUIRED_FIELD_MISSING",
        path: `${pathPrefix}.datasource`,
        message: "widget datasource is required.",
      });
    } else if (
      knownDatasourceSet.size > 0 &&
      !knownDatasourceSet.has(widget.datasource)
    ) {
      issues.push({
        code: "DATASOURCE_NOT_FOUND",
        path: `${pathPrefix}.datasource`,
        message: `datasource '${widget.datasource}' is not registered.`,
      });
    }

    if (!isNonEmptyString(widget.visualization?.type)) {
      issues.push({
        code: "REQUIRED_FIELD_MISSING",
        path: `${pathPrefix}.visualization.type`,
        message: "widget visualization.type is required.",
      });
    } else if (
      knownVisualizationSet.size > 0 &&
      !knownVisualizationSet.has(widget.visualization.type)
    ) {
      issues.push({
        code: "VISUALIZATION_NOT_FOUND",
        path: `${pathPrefix}.visualization.type`,
        message: `visualization '${widget.visualization.type}' is not registered.`,
      });
    }

    if (!isNonEmptyString(widget.query?.metric)) {
      issues.push({
        code: "REQUIRED_FIELD_MISSING",
        path: `${pathPrefix}.query.metric`,
        message: "widget query.metric is required.",
      });
    } else {
      const metric = knownMetricMap.get(widget.query.metric);
      if (!metric && !options.allowUnknownMetrics && knownMetricMap.size > 0) {
        issues.push({
          code: "METRIC_NOT_FOUND",
          path: `${pathPrefix}.query.metric`,
          message: `metric '${widget.query.metric}' is not defined.`,
        });
      }

      if (
        metric &&
        isNonEmptyString(widget.visualization?.type) &&
        !metric.supportedVisualizations.includes(widget.visualization.type)
      ) {
        issues.push({
          code: "METRIC_VISUALIZATION_MISMATCH",
          path: `${pathPrefix}.visualization.type`,
          message:
            `visualization '${widget.visualization.type}' is not supported for metric '${metric.id}'.`,
        });
      }
    }

    if (widget.timeRange) {
      validateTimeRange(widget.timeRange, `${pathPrefix}.timeRange`, issues);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

/**
 * Converts validation issues into a standardized `SCHEMA_INVALID` structured error.
 * Returns `undefined` when validation passed.
 */
export function toSchemaValidationError(result: ValidationResult): DDashError | undefined {
  if (result.ok) {
    return undefined;
  }

  return {
    code: "SCHEMA_INVALID",
    message: "Persisted dashboard schema validation failed.",
    retriable: false,
    details: {
      issueCount: result.issues.length,
      issues: result.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message,
      })),
    },
  };
}

function validateTimeRange(
  timeRange: PersistedTimeRange,
  path: string,
  issues: ValidationIssue[],
): void {
  if (timeRange.type === "inherit") {
    return;
  }

  if (timeRange.type === "relative") {
    if (!isNonEmptyString(timeRange.value)) {
      issues.push({
        code: "INVALID_TIME_RANGE",
        path: `${path}.value`,
        message: "relative time range requires a non-empty value.",
      });
    }
    return;
  }

  if (timeRange.type === "absolute") {
    if (!Number.isFinite(timeRange.from) || !Number.isFinite(timeRange.to)) {
      issues.push({
        code: "INVALID_TIME_RANGE",
        path,
        message: "absolute time range requires finite from/to timestamps.",
      });
      return;
    }

    if (timeRange.from > timeRange.to) {
      issues.push({
        code: "INVALID_TIME_RANGE",
        path,
        message: "absolute time range requires from <= to.",
      });
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
