import type { DDashError } from "./errors";
import type {
  MetricDefinition,
  PersistedDashboard,
  PersistedTimeRange,
} from "./schema";

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
  | "METRIC_VISUALIZATION_MISMATCH"
  | "VARIABLE_NAME_DUPLICATE"
  | "VARIABLE_DATASOURCE_NOT_FOUND"
  | "VARIABLE_INVALID"
  | "VARIABLE_CIRCULAR_DEPENDENCY";

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

  if (dashboard.meta?.tenant !== undefined && !isNonEmptyString(dashboard.meta.tenant)) {
    issues.push({
      code: "REQUIRED_FIELD_MISSING",
      path: "meta.tenant",
      message: "meta.tenant must be a non-empty string.",
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
          message: `visualization '${widget.visualization.type}' is not supported for metric '${metric.id}'.`,
        });
      }
    }

    if (widget.timeRange) {
      validateTimeRange(widget.timeRange, `${pathPrefix}.timeRange`, issues);
    }
  }

  // Validate template variables when present.
  if (Array.isArray(dashboard.variables)) {
    const variableNames = new Set<string>();
    for (let i = 0; i < dashboard.variables.length; i += 1) {
      const variable = dashboard.variables[i];
      const varPath = `variables[${i}]`;

      if (!isNonEmptyString(variable.name)) {
        issues.push({
          code: "VARIABLE_INVALID",
          path: `${varPath}.name`,
          message: "Variable name must be a non-empty string.",
        });
        continue;
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable.name)) {
        issues.push({
          code: "VARIABLE_INVALID",
          path: `${varPath}.name`,
          message: `Variable name '${variable.name}' must start with a letter or underscore and contain only alphanumeric characters or underscores.`,
        });
        continue;
      }

      if (variableNames.has(variable.name)) {
        issues.push({
          code: "VARIABLE_NAME_DUPLICATE",
          path: `${varPath}.name`,
          message: `Duplicate variable name '${variable.name}'.`,
        });
        continue;
      }

      variableNames.add(variable.name);

      if (variable.type === "custom" && !Array.isArray(variable.options)) {
        issues.push({
          code: "VARIABLE_INVALID",
          path: `${varPath}.options`,
          message: `Custom variable '${variable.name}' must have an options array.`,
        });
      }

      if (variable.type === "query") {
        if (!isNonEmptyString(variable.datasource)) {
          issues.push({
            code: "VARIABLE_INVALID",
            path: `${varPath}.datasource`,
            message: `Query variable '${variable.name}' must specify a datasource.`,
          });
        } else if (
          knownDatasourceSet.size > 0 &&
          !knownDatasourceSet.has(variable.datasource)
        ) {
          issues.push({
            code: "VARIABLE_DATASOURCE_NOT_FOUND",
            path: `${varPath}.datasource`,
            message: `datasource '${variable.datasource}' referenced by variable '${variable.name}' is not registered.`,
          });
        }

        if (!isNonEmptyString(variable.query)) {
          issues.push({
            code: "VARIABLE_INVALID",
            path: `${varPath}.query`,
            message: `Query variable '${variable.name}' must specify a query string.`,
          });
        }
      }
    }

    // Detect circular dependencies: a query variable whose query string references
    // another variable that eventually references it back via $varName substitution.
    if (dashboard.variables.length > 1) {
      // Build adjacency map: variable name → set of variable names it depends on.
      const deps = new Map<string, Set<string>>();
      for (const variable of dashboard.variables) {
        if (!variableNames.has(variable.name)) {
          // Skip variables that failed earlier name validation.
          continue;
        }
        const refs = new Set<string>();
        if (variable.type === "query" && isNonEmptyString(variable.query)) {
          const refPattern = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
          let m: RegExpExecArray | null;
          while ((m = refPattern.exec(variable.query)) !== null) {
            const refName = m[1];
            // Only track edges to other known variables, not self-references.
            if (variableNames.has(refName) && refName !== variable.name) {
              refs.add(refName);
            }
          }
        }
        deps.set(variable.name, refs);
      }

      // DFS cycle detection using an explicit path stack.
      // Nodes whose name appears on the active stack path when revisited form a cycle.
      const visited = new Set<string>();
      const stack: string[] = [];
      const stackSet = new Set<string>();
      const cycleNodes = new Set<string>();

      const detectCycle = (name: string): void => {
        if (visited.has(name)) return;
        if (stackSet.has(name)) {
          // Back edge: record all nodes from the cycle entry point to the stack top.
          const cycleStart = stack.indexOf(name);
          for (let ci = cycleStart; ci < stack.length; ci += 1) {
            cycleNodes.add(stack[ci]);
          }
          return;
        }
        stack.push(name);
        stackSet.add(name);
        for (const dep of deps.get(name) ?? []) {
          detectCycle(dep);
        }
        stack.pop();
        stackSet.delete(name);
        visited.add(name);
      };

      for (const name of deps.keys()) {
        detectCycle(name);
      }

      for (const varName of cycleNodes) {
        const idx = dashboard.variables.findIndex((v) => v.name === varName);
        issues.push({
          code: "VARIABLE_CIRCULAR_DEPENDENCY",
          path: `variables[${idx}].query`,
          message: `Variable '${varName}' participates in a circular dependency.`,
        });
      }
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
export function toSchemaValidationError(
  result: ValidationResult,
): DDashError | undefined {
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
