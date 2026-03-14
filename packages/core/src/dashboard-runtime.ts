import type { DatasourceQueryResult, GridLayoutChange } from "./adapters";
import type { DDashError } from "./errors";
import { executeWidget as executeWidgetOperation } from "./execution.js";
import type { JsonObject } from "./json";
import type { AdapterRegistry } from "./registry";
import {
  resolveDashboardTimeRange,
  type ResolvedTimeRange,
  type RuntimeContext,
} from "./runtime.js";
import type {
  MetricDefinition,
  PersistedDashboard,
  PersistedWidget,
} from "./schema";
import {
  toSchemaValidationError,
  validatePersistedDashboard,
  type DashboardValidationOptions,
  type ValidationResult,
} from "./validation.js";

/** Discriminated union of observable events emitted during widget execution. */
export type RuntimeEvent =
  | { type: "widget.execute.started"; widgetId: string; dashboardId: string }
  | {
      type: "widget.execute.completed";
      widgetId: string;
      dashboardId: string;
      durationMs: number;
      status: "success" | "partial" | "error";
    }
  | {
      type: "widget.execute.failed";
      widgetId: string;
      dashboardId: string;
      durationMs: number;
      error: unknown;
    };

export type RuntimeEventHandler = (event: RuntimeEvent) => void;

/** Options for creating dashboard runtime orchestration. */
export type DashboardRuntimeOptions = {
  registry: AdapterRegistry;
  now?: () => number;
  /** Optional observer called for each widget execution lifecycle event. */
  onEvent?: RuntimeEventHandler;
};

/** Execution session state derived from a validated dashboard. */
export type DashboardSession = {
  dashboard: PersistedDashboard;
  dashboardTimeRange: ResolvedTimeRange;
  widgets: PersistedWidget[];
};

/** Inputs for executing a single widget in a session. */
export type ExecuteSessionWidgetInput<TTarget = unknown> = {
  session: DashboardSession;
  widgetId: string;
  target: TTarget;
  context: RuntimeContext;
};

/** Inputs for executing all widgets in a session. */
export type ExecuteAllWidgetsInput<TTarget = unknown> = {
  session: DashboardSession;
  targetByWidgetId: Record<string, TTarget>;
  context: RuntimeContext;
};

/** Widget execution result tuple for batch execution APIs. */
export type ExecuteWidgetResult = {
  widgetId: string;
  result: DatasourceQueryResult;
};

/** Preflight result for adapter availability checks. */
export type DashboardPreflightResult = {
  ok: boolean;
  missingDatasources: string[];
  missingVisualizations: string[];
};

/** Inputs for applying persisted dashboard layout through a grid adapter. */
export type ApplyDashboardLayoutInput<TTarget = unknown> = {
  session: DashboardSession;
  gridId: string;
  target: TTarget;
};

/** Inputs for binding grid layout-change events to visualization resize hooks. */
export type BindLayoutResizeInput<
  TGridTarget = unknown,
  TWidgetTarget = unknown,
> = {
  session: DashboardSession;
  gridId: string;
  gridTarget: TGridTarget;
  targetByWidgetId?: Record<string, TWidgetTarget>;
  resolveTargetByWidgetId?: (
    widgetId: string,
  ) => TWidgetTarget | undefined;
};

/** Structured runtime error union thrown by dashboard runtime APIs. */
export type DashboardRuntimeError = DDashError & {
  code:
    | "SCHEMA_INVALID"
    | "RUNTIME_WIDGET_NOT_FOUND"
    | "RUNTIME_TARGET_MISSING";
};

/** Public dashboard runtime API surface. */
export type DashboardRuntime = {
  validateDashboard(
    dashboard: PersistedDashboard,
    options?: Omit<
      DashboardValidationOptions,
      "knownDatasources" | "knownVisualizations"
    >,
  ): ValidationResult;
  validateDashboardWithRegistryMetrics(
    dashboard: PersistedDashboard,
    options?: Omit<
      DashboardValidationOptions,
      "knownDatasources" | "knownVisualizations" | "knownMetrics"
    >,
  ): Promise<ValidationResult>;
  preflightDashboard(dashboard: PersistedDashboard): DashboardPreflightResult;
  applyDashboardLayout<TTarget = unknown>(
    input: ApplyDashboardLayoutInput<TTarget>,
  ): Promise<void>;
  bindLayoutResize<TGridTarget = unknown, TWidgetTarget = unknown>(
    input: BindLayoutResizeInput<TGridTarget, TWidgetTarget>,
  ): Promise<() => void>;
  createSession(dashboard: PersistedDashboard): DashboardSession;
  createSessionWithRegistryMetrics(
    dashboard: PersistedDashboard,
    options?: Omit<
      DashboardValidationOptions,
      "knownDatasources" | "knownVisualizations" | "knownMetrics"
    >,
  ): Promise<DashboardSession>;
  executeWidget<TTarget = unknown>(
    input: ExecuteSessionWidgetInput<TTarget>,
  ): Promise<DatasourceQueryResult>;
  executeAllWidgets<TTarget = unknown>(
    input: ExecuteAllWidgetsInput<TTarget>,
  ): Promise<ExecuteWidgetResult[]>;
  discoverMetrics(datasourceId?: string): Promise<MetricDefinition[]>;
};

/** Creates dashboard runtime orchestrator bound to adapter registry and clock/event hooks. */
export function createDashboardRuntime(
  options: DashboardRuntimeOptions,
): DashboardRuntime {
  const getNow = options.now ?? Date.now;

  return {
    validateDashboard(
      dashboard: PersistedDashboard,
      userOptions: Omit<
        DashboardValidationOptions,
        "knownDatasources" | "knownVisualizations"
      > = {},
    ): ValidationResult {
      return validatePersistedDashboard(dashboard, {
        ...userOptions,
        knownDatasources: options.registry.listDatasourceIds(),
        knownVisualizations: options.registry.listVisualizationKinds(),
      });
    },

    async validateDashboardWithRegistryMetrics(
      dashboard: PersistedDashboard,
      userOptions: Omit<
        DashboardValidationOptions,
        "knownDatasources" | "knownVisualizations" | "knownMetrics"
      > = {},
    ): Promise<ValidationResult> {
      const knownMetrics = await this.discoverMetrics();

      return validatePersistedDashboard(dashboard, {
        ...userOptions,
        knownDatasources: options.registry.listDatasourceIds(),
        knownVisualizations: options.registry.listVisualizationKinds(),
        knownMetrics,
      });
    },

    preflightDashboard(
      dashboard: PersistedDashboard,
    ): DashboardPreflightResult {
      const registeredDatasources = new Set(
        options.registry.listDatasourceIds(),
      );
      const registeredVisualizations = new Set(
        options.registry.listVisualizationKinds(),
      );

      const missingDatasourceSet = new Set<string>();
      const missingVisualizationSet = new Set<string>();

      for (const widget of dashboard.widgets) {
        if (!registeredDatasources.has(widget.datasource)) {
          missingDatasourceSet.add(widget.datasource);
        }

        if (!registeredVisualizations.has(widget.visualization.type)) {
          missingVisualizationSet.add(widget.visualization.type);
        }
      }

      const missingDatasources = Array.from(missingDatasourceSet);
      const missingVisualizations = Array.from(missingVisualizationSet);

      return {
        ok:
          missingDatasources.length === 0 && missingVisualizations.length === 0,
        missingDatasources,
        missingVisualizations,
      };
    },

    async applyDashboardLayout<TTarget = unknown>(
      input: ApplyDashboardLayoutInput<TTarget>,
    ): Promise<void> {
      const adapter = options.registry.requireGrid(input.gridId);

      // Build a widgetId lookup keyed by layoutId so layout items map to widget identifiers.
      const widgetByLayoutId = new Map<string, string>();
      for (const widget of input.session.widgets) {
        widgetByLayoutId.set(widget.layoutId, widget.id);
      }

      const changes: GridLayoutChange[] = [];
      for (const item of input.session.dashboard.layout) {
        const widgetId = widgetByLayoutId.get(item.id);
        if (!widgetId) {
          continue;
        }

        changes.push({
          widgetId,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        });
      }

      await adapter.applyLayout(changes, input.target);
    },

    async bindLayoutResize<TGridTarget = unknown, TWidgetTarget = unknown>(
      input: BindLayoutResizeInput<TGridTarget, TWidgetTarget>,
    ): Promise<() => void> {
      const grid = options.registry.requireGrid(input.gridId);
      if (!grid.subscribeLayoutChanges) {
        return () => {};
      }

      const resolveTargetByWidgetId =
        input.resolveTargetByWidgetId ??
        ((widgetId: string): TWidgetTarget | undefined =>
          input.targetByWidgetId?.[widgetId]);

      const widgetById = new Map<string, PersistedWidget>();
      for (const widget of input.session.widgets) {
        widgetById.set(widget.id, widget);
      }

      const unsubscribe = await grid.subscribeLayoutChanges(
        input.gridTarget,
        (changes) => {
          // Resize each affected widget once per grid event batch.
          const touchedWidgetIds = new Set(changes.map((change) => change.widgetId));

          for (const widgetId of touchedWidgetIds) {
            const widget = widgetById.get(widgetId);
            if (!widget) {
              continue;
            }

            const target = resolveTargetByWidgetId(widget.id);
            if (target === undefined) {
              continue;
            }

            const adapter = options.registry.requireVisualization(
              widget.visualization.type,
            );
            adapter.resize?.(target);
          }
        },
      );

      return unsubscribe;
    },

    createSession(dashboard: PersistedDashboard): DashboardSession {
      const validation = this.validateDashboard(dashboard);
      return buildSessionFromValidatedDashboard(validation, dashboard, getNow);
    },

    async createSessionWithRegistryMetrics(
      dashboard: PersistedDashboard,
      userOptions: Omit<
        DashboardValidationOptions,
        "knownDatasources" | "knownVisualizations" | "knownMetrics"
      > = {},
    ): Promise<DashboardSession> {
      const validation = await this.validateDashboardWithRegistryMetrics(
        dashboard,
        userOptions,
      );
      return buildSessionFromValidatedDashboard(validation, dashboard, getNow);
    },

    async executeWidget<TTarget = unknown>(
      input: ExecuteSessionWidgetInput<TTarget>,
    ): Promise<DatasourceQueryResult> {
      const widget = input.session.widgets.find(
        (candidate) => candidate.id === input.widgetId,
      );
      if (!widget) {
        throw new DashboardRuntimeException(
          "RUNTIME_WIDGET_NOT_FOUND",
          `Widget '${input.widgetId}' not found in session.`,
          { widgetId: input.widgetId },
        );
      }

      const dashboardId = input.session.dashboard.dashboardId;
      const widgetId = input.widgetId;
      const emit = options.onEvent;

      emit?.({ type: "widget.execute.started", widgetId, dashboardId });

      const startMs = Date.now();
      try {
        const result = await executeWidgetOperation({
          registry: options.registry,
          dashboardId,
          widget,
          dashboardTimeRange: input.session.dashboardTimeRange,
          context: input.context,
          target: input.target,
        });

        emit?.({
          type: "widget.execute.completed",
          widgetId,
          dashboardId,
          durationMs: Date.now() - startMs,
          status: result.status,
        });

        return result;
      } catch (error) {
        emit?.({
          type: "widget.execute.failed",
          widgetId,
          dashboardId,
          durationMs: Date.now() - startMs,
          error,
        });
        throw error;
      }
    },

    async executeAllWidgets<TTarget = unknown>(
      input: ExecuteAllWidgetsInput<TTarget>,
    ): Promise<ExecuteWidgetResult[]> {
      const results: ExecuteWidgetResult[] = [];

      for (const widget of input.session.widgets) {
        const target = input.targetByWidgetId[widget.id];
        if (target === undefined) {
          throw new DashboardRuntimeException(
            "RUNTIME_TARGET_MISSING",
            `Missing render target for widget '${widget.id}'.`,
            { widgetId: widget.id },
          );
        }

        const result = await this.executeWidget({
          session: input.session,
          widgetId: widget.id,
          target,
          context: input.context,
        });

        results.push({
          widgetId: widget.id,
          result,
        });
      }

      return results;
    },

    async discoverMetrics(datasourceId?: string): Promise<MetricDefinition[]> {
      if (datasourceId) {
        const adapter = options.registry.requireDatasource(datasourceId);
        if (!adapter.getMetrics) {
          return [];
        }

        const metrics = await adapter.getMetrics();
        return dedupeMetrics(metrics);
      }

      const allMetrics: MetricDefinition[] = [];
      const datasourceIds = options.registry.listDatasourceIds();

      for (const id of datasourceIds) {
        const adapter = options.registry.requireDatasource(id);
        if (!adapter.getMetrics) {
          continue;
        }

        const metrics = await adapter.getMetrics();
        for (const metric of metrics) {
          allMetrics.push(metric);
        }
      }

      return dedupeMetrics(allMetrics);
    },
  };
}

function buildSessionFromValidatedDashboard(
  validation: ValidationResult,
  dashboard: PersistedDashboard,
  getNow: () => number,
): DashboardSession {
  const schemaError = toSchemaValidationError(validation);
  if (schemaError) {
    throw new DashboardRuntimeException("SCHEMA_INVALID", schemaError.message, {
      issues: validation.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message,
      })),
    });
  }

  if (dashboard.timeRange.type === "inherit") {
    throw new DashboardRuntimeException(
      "SCHEMA_INVALID",
      "Dashboard timeRange cannot use inherit.",
      {
        path: "timeRange",
        type: "inherit",
      },
    );
  }

  return {
    dashboard,
    dashboardTimeRange: resolveDashboardTimeRange(dashboard.timeRange, {
      now: getNow(),
    }),
    widgets: dashboard.widgets,
  };
}

class DashboardRuntimeException extends Error implements DashboardRuntimeError {
  readonly code: DashboardRuntimeError["code"];
  readonly details?: JsonObject;
  readonly retriable = false;

  constructor(
    code: DashboardRuntimeError["code"],
    message: string,
    details?: JsonObject,
  ) {
    super(message);
    this.name = "DashboardRuntimeException";
    this.code = code;
    this.details = details;
  }
}

function dedupeMetrics(metrics: MetricDefinition[]): MetricDefinition[] {
  const seen = new Set<string>();
  const deduped: MetricDefinition[] = [];

  for (const metric of metrics) {
    const key = `${metric.datasource}::${metric.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(metric);
  }

  return deduped;
}
