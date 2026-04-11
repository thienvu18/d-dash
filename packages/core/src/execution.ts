import type {
  DataFrame,
  DatasourceQueryRequest,
  DatasourceQueryResult,
  VisualizationRenderRequest,
} from "./adapters";
import type { DDashError } from "./errors";
import type { JsonObject } from "./json";
import type { AdapterRegistry } from "./registry";
import {
  resolveWidgetTimeRange,
  type ResolvedTimeRange,
  type ResolvedWidgetExecutionRequest,
  type RuntimeContext,
} from "./runtime.js";
import type { PersistedWidget } from "./schema";

/** Inputs required to build a resolved widget execution request. */
export type BuildWidgetExecutionRequestInput = {
  dashboardId: string;
  widget: PersistedWidget;
  dashboardTimeRange: ResolvedTimeRange;
  context: RuntimeContext;
  now?: number;
};

/** Inputs required to execute a visualization render call. */
export type ExecuteWidgetRenderInput<TTarget = unknown> = {
  request: ResolvedWidgetExecutionRequest;
  frames: DataFrame[];
  target: TTarget;
};

/** Full inputs required for query + render orchestration of a widget. */
export type ExecuteWidgetInput<TTarget = unknown> = {
  registry: AdapterRegistry;
  dashboardId: string;
  widget: PersistedWidget;
  dashboardTimeRange: ResolvedTimeRange;
  context: RuntimeContext;
  target: TTarget;
  now?: number;
};

/** Executes datasource query for a resolved widget request. */
export async function executeWidgetQuery(
  registry: AdapterRegistry,
  request: ResolvedWidgetExecutionRequest,
): Promise<DatasourceQueryResult> {
  const adapter = registry.requireDatasource(request.datasourceId);

  if (
    request.query.filters &&
    adapter.capabilities?.supportsAdHocFilters === false
  ) {
    throw new CapabilityMismatchException(
      "Datasource adapter does not support ad-hoc filters.",
      {
        datasourceId: request.datasourceId,
        widgetId: request.widgetId,
      },
    );
  }

  const queryRequest: DatasourceQueryRequest = {
    metric: request.query.metric,
    timeRange: request.resolvedTimeRange,
    filters: request.query.filters,
  };

  const result = await adapter.query(queryRequest, request.context);
  assertDatasourceQueryResult(result, request.datasourceId, request.widgetId);
  return result;
}

/** Executes visualization render for a resolved widget request and frames. */
export async function executeWidgetRender<TTarget = unknown>(
  registry: AdapterRegistry,
  input: ExecuteWidgetRenderInput<TTarget>,
): Promise<void> {
  const adapter = registry.requireVisualization(
    input.request.visualization.type,
  );
  assertVisualizationCapability(
    input.request.visualization.type,
    adapter.capabilities,
  );

  const renderRequest: VisualizationRenderRequest = {
    kind: input.request.visualization.type,
    frames: input.frames,
    options: input.request.options,
    context: input.request.context,
  };

  await adapter.render(renderRequest, input.target);
}

/** Executes full widget flow: build request, query datasource, and render when data exists. */
export async function executeWidget<TTarget = unknown>(
  input: ExecuteWidgetInput<TTarget>,
): Promise<DatasourceQueryResult> {
  const request = buildWidgetExecutionRequest({
    dashboardId: input.dashboardId,
    widget: input.widget,
    dashboardTimeRange: input.dashboardTimeRange,
    context: input.context,
    now: input.now,
  });

  const result = await executeWidgetQuery(input.registry, request);

  if (result.status === "error") {
    return result;
  }

  await executeWidgetRender(input.registry, {
    request,
    frames: result.frames,
    target: input.target,
  });

  return result;
}

/** Builds a resolved widget execution request from persisted widget and runtime context. */
export function buildWidgetExecutionRequest(
  input: BuildWidgetExecutionRequestInput,
): ResolvedWidgetExecutionRequest {
  const resolvedTimeRange = resolveWidgetTimeRange(
    input.widget.timeRange,
    input.dashboardTimeRange,
    { now: input.now },
  );

  const vars = input.context.resolvedVariables;

  // Substitute $variableName occurrences in filter string values.
  const filters = vars
    ? substituteVariablesInJsonObject(input.widget.query.filters, vars)
    : input.widget.query.filters;

  // Also substitute variables in the metric field so queries like `{ metric: '$host' }` work.
  const metric =
    vars && typeof input.widget.query.metric === "string"
      ? substituteVariableInString(input.widget.query.metric, vars)
      : input.widget.query.metric;

  const options =
    vars && input.widget.options
      ? substituteVariablesInJsonObject(input.widget.options, vars)
      : input.widget.options;

  const display = input.widget.display
    ? {
        ...input.widget.display,
        title:
          vars && typeof input.widget.display.title === "string"
            ? substituteVariableInString(input.widget.display.title, vars)
            : input.widget.display.title,
        description:
          vars && typeof input.widget.display.description === "string"
            ? substituteVariableInString(input.widget.display.description, vars)
            : input.widget.display.description,
      }
    : undefined;

  return {
    dashboardId: input.dashboardId,
    widgetId: input.widget.id,
    datasourceId: input.widget.datasource,
    query: { ...input.widget.query, metric, filters },
    visualization: input.widget.visualization,
    resolvedTimeRange,
    options,
    display,
    context: input.context,
  };
}

/**
 * Substitutes a single `$variableName` reference in a plain string.
 * Multi-value variables use the first value.
 */
export function substituteVariableInString(
  value: string,
  variables: import("./runtime.js").ResolvedVariables,
): string {
  return value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName: string) => {
    const resolved = variables[varName];
    if (resolved === undefined) return `$${varName}`;
    return Array.isArray(resolved) ? resolved[0] : resolved;
  });
}

export function substituteVariablesInJsonObject(
  obj: import("./json").JsonObject | undefined,
  variables: import("./runtime.js").ResolvedVariables,
): import("./json").JsonObject | undefined {
  if (!obj) {
    return obj;
  }

  const result: import("./json").JsonObject = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName: string) => {
        const resolved = variables[varName];
        if (resolved === undefined) {
          return `$${varName}`;
        }
        return Array.isArray(resolved) ? resolved.join(",") : resolved;
      });
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Recursively substitute inner objects
      result[key] = substituteVariablesInJsonObject(value as import("./json").JsonObject, variables) as import("./json").JsonValue;
    } else {
      result[key] = value;
    }
  }
  return result;
}

class DatasourceQueryException extends Error implements DDashError {
  readonly code = "DATASOURCE_QUERY_FAILED" as const;
  readonly details?: JsonObject;
  readonly retriable = true;

  constructor(message: string, details?: JsonObject) {
    super(message);
    this.name = "DatasourceQueryException";
    this.details = details;
  }
}

function assertDatasourceQueryResult(
  result: DatasourceQueryResult,
  datasourceId: string,
  widgetId: string,
): void {
  if (
    result.status !== "success" &&
    result.status !== "partial" &&
    result.status !== "error"
  ) {
    throw new DatasourceQueryException(
      "Datasource returned an invalid status.",
      {
        datasourceId,
        widgetId,
        status: String((result as { status?: unknown }).status),
      },
    );
  }

  if (!Array.isArray(result.frames)) {
    throw new DatasourceQueryException(
      "Datasource result frames must be an array.",
      {
        datasourceId,
        widgetId,
        status: result.status,
      },
    );
  }

  // Validate frame payload at runtime to guard adapters crossing package boundaries.
  for (let i = 0; i < result.frames.length; i += 1) {
    const frame = result.frames[i] as { fields?: unknown };
    if (!Array.isArray(frame.fields)) {
      throw new DatasourceQueryException("DataFrame.fields must be an array.", {
        datasourceId,
        widgetId,
        frameIndex: i,
      });
    }

    for (let j = 0; j < frame.fields.length; j += 1) {
      const field = frame.fields[j] as {
        name?: unknown;
        type?: unknown;
        values?: unknown;
      };

      if (typeof field.name !== "string" || field.name.trim().length === 0) {
        throw new DatasourceQueryException(
          "DataField.name must be a non-empty string.",
          {
            datasourceId,
            widgetId,
            frameIndex: i,
            fieldIndex: j,
          },
        );
      }

      if (
        field.type !== "time" &&
        field.type !== "number" &&
        field.type !== "string" &&
        field.type !== "boolean"
      ) {
        throw new DatasourceQueryException("DataField.type is invalid.", {
          datasourceId,
          widgetId,
          frameIndex: i,
          fieldIndex: j,
          type: String(field.type),
        });
      }

      if (!Array.isArray(field.values)) {
        throw new DatasourceQueryException(
          "DataField.values must be an array.",
          {
            datasourceId,
            widgetId,
            frameIndex: i,
            fieldIndex: j,
          },
        );
      }

      for (let k = 0; k < field.values.length; k += 1) {
        if (!isValidScalarForType(field.values[k], field.type)) {
          throw new DatasourceQueryException(
            "DataField.values contains invalid scalar value.",
            {
              datasourceId,
              widgetId,
              frameIndex: i,
              fieldIndex: j,
              valueIndex: k,
              expectedType: field.type,
            },
          );
        }
      }
    }
  }

  if (
    (result.status === "partial" || result.status === "error") &&
    !isDDashError(result.error)
  ) {
    throw new DatasourceQueryException(
      "Datasource partial/error result must include a structured error.",
      {
        datasourceId,
        widgetId,
        status: result.status,
      },
    );
  }
}

function isValidScalarForType(
  value: unknown,
  type: "time" | "number" | "string" | "boolean",
): boolean {
  if (value === null) {
    return true;
  }

  if (type === "string") {
    return typeof value === "string";
  }

  if (type === "boolean") {
    return typeof value === "boolean";
  }

  if (type === "number" || type === "time") {
    return typeof value === "number" && Number.isFinite(value);
  }

  return false;
}

function isDDashError(value: unknown): value is DDashError {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeError = value as { code?: unknown; message?: unknown };
  return (
    typeof maybeError.code === "string" &&
    typeof maybeError.message === "string"
  );
}

class CapabilityMismatchException extends Error implements DDashError {
  readonly code = "CAPABILITY_MISMATCH" as const;
  readonly details?: JsonObject;
  readonly retriable = false;

  constructor(message: string, details?: JsonObject) {
    super(message);
    this.name = "CapabilityMismatchException";
    this.details = details;
  }
}

function assertVisualizationCapability(
  kind: string,
  capabilities:
    | {
        supportsTimeSeries?: boolean;
        supportsTable?: boolean;
        supportsTextWidget?: boolean;
        supportsHtmlWidget?: boolean;
      }
    | undefined,
): void {
  if (!capabilities) {
    return;
  }

  if (kind === "timeseries" && capabilities.supportsTimeSeries === false) {
    throw new CapabilityMismatchException(
      "Visualization adapter does not support timeseries widgets.",
      { kind },
    );
  }

  if (kind === "table" && capabilities.supportsTable === false) {
    throw new CapabilityMismatchException(
      "Visualization adapter does not support table widgets.",
      { kind },
    );
  }

  if (kind === "text" && capabilities.supportsTextWidget === false) {
    throw new CapabilityMismatchException(
      "Visualization adapter does not support text widgets.",
      { kind },
    );
  }

  if (kind === "html" && capabilities.supportsHtmlWidget === false) {
    throw new CapabilityMismatchException(
      "Visualization adapter does not support html widgets.",
      { kind },
    );
  }
}
