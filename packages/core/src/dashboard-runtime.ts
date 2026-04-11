import type { DatasourceQueryResult, GridLayoutChange } from "./adapters";
import type { DDashError } from "./errors";
import { executeWidget as executeWidgetOperation, substituteVariableInString } from "./execution.js";
import type { JsonObject } from "./json";
import type { AdapterRegistry } from "./registry";
import {
  resolveDashboardTimeRange,
  type ResolvedTimeRange,
  type ResolvedVariables,
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
  /**
   * Resolved template variable values for the session.
   * Populated by `resolveVariables()` or `updateVariables()`.
   * @experimental
   */
  resolvedVariables?: ResolvedVariables;
};

/** Inputs for executing a single widget in a session. */
export type ExecuteSessionWidgetInput<TTarget = unknown> = {
  session: DashboardSession;
  widgetId: string;
  target: TTarget;
  context: RuntimeContext;
};

/** Inputs for executing all widgets in a session. */
export type ExecuteAllWidgetsInput = {
  session: DashboardSession;
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

/** Inputs for the mountDashboard convenience method. */
export type MountDashboardInput<TGridTarget = unknown> = {
  session: DashboardSession;
  gridId: string;
  gridTarget: TGridTarget;
  context: RuntimeContext;
};

/** Result returned by mountDashboard. */
export type MountDashboardResult = {
  /** Widget execution results, one per widget. */
  widgetResults: ExecuteWidgetResult[];
  /** Unbinds the layout-resize subscription set up during mount. */
  unmount: () => void;
};

/**
 * Session handle returned by createBoundSession.
 * All methods are pre-bound to the session — no need to re-pass session on every call.
 */
export type BoundDashboardSession = {
  readonly session: DashboardSession;
  applyLayout<TTarget = unknown>(
    input: Omit<ApplyDashboardLayoutInput<TTarget>, "session">,
  ): Promise<void>;
  bindLayoutResize(): Promise<() => void>;
  executeWidget<TTarget = unknown>(
    input: Omit<ExecuteSessionWidgetInput<TTarget>, "session">,
  ): Promise<DatasourceQueryResult>;
  executeAllWidgets(
    input: Omit<ExecuteAllWidgetsInput, "session">,
  ): Promise<ExecuteWidgetResult[]>;
  registerWidgetTargets<TTarget = unknown>(targets: Record<string, TTarget>): void;
  mount<TGridTarget = unknown>(
    input: Omit<MountDashboardInput<TGridTarget>, "session">,
  ): Promise<MountDashboardResult>;
  /**
   * Updates the resolved variable values for the session and re-executes all widgets.
   * @experimental
   */
  updateVariables(
    variableValues: Record<string, string | string[]>,
    context: RuntimeContext,
  ): Promise<ExecuteWidgetResult[]>;
};

// ---------------------------------------------------------------------------
// Snapshot / session serialization
// ---------------------------------------------------------------------------

/**
 * A read-only snapshot that captures dashboard definition, cached widget data,
 * and resolved variables at a point in time. Use `DashboardRuntime.serializeSession`
 * and `DashboardRuntime.restoreSnapshot` to persist and reload sessions.
 * @experimental
 */
export type SerializedSnapshot = {
  dashboard: PersistedDashboard;
  capturedAt: number;
  widgetData: Record<string, import("./adapters").DataFrame[]>;
  resolvedVariables?: ResolvedVariables;
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
  /**
   * Registers widget render targets in bulk so the runtime can resolve them
   * during layout-resize orchestration without requiring a separate execute call.
   * @experimental
   */
  registerWidgetTargets<TTarget = unknown>(targets: Record<string, TTarget>): void;
  /**
   * Returns a session handle with all methods pre-bound to the given session,
   * eliminating the need to re-pass `session` on every subsequent call.
   * @experimental
   */
  createBoundSession(session: DashboardSession): BoundDashboardSession;
  /**
   * Applies the dashboard layout, executes all widgets, and binds layout-resize
   * orchestration in a single call. Returns widget execution results and an
   * `unmount` function that tears down the resize subscription.
   * @experimental
   */
  mountDashboard<TGridTarget = unknown>(
    input: MountDashboardInput<TGridTarget>,
  ): Promise<MountDashboardResult>;
  validateDashboard(
    dashboard: PersistedDashboard,
    options?: Omit<
      DashboardValidationOptions,
      "knownDatasources" | "knownVisualizations"
    >
  ): ValidationResult;
  validateDashboardWithRegistryMetrics(
    dashboard: PersistedDashboard,
    options?: Omit<
      DashboardValidationOptions,
      "knownDatasources" | "knownVisualizations" | "knownMetrics"
    >
  ): Promise<ValidationResult>;
  preflightDashboard(dashboard: PersistedDashboard): DashboardPreflightResult;
  applyDashboardLayout<TTarget = unknown>(
    input: ApplyDashboardLayoutInput<TTarget>
  ): Promise<void>;
  bindLayoutResize(session: DashboardSession): Promise<() => void>;
  createSession(dashboard: PersistedDashboard): DashboardSession;
  createSessionWithRegistryMetrics(
    dashboard: PersistedDashboard,
    options?: Omit<
      DashboardValidationOptions,
      "knownDatasources" | "knownVisualizations" | "knownMetrics"
    >
  ): Promise<DashboardSession>;
  executeWidget<TTarget = unknown>(
    input: ExecuteSessionWidgetInput<TTarget>
  ): Promise<DatasourceQueryResult>;
  executeAllWidgets(
    input: ExecuteAllWidgetsInput
  ): Promise<ExecuteWidgetResult[]>;
  discoverMetrics(datasourceId?: string): Promise<MetricDefinition[]>;
  /**
   * Resolves query-type template variables via their datasource adapter and
   * returns the full `ResolvedVariables` map merged with any supplied overrides.
   * Custom and textbox variables use their `default` value (or the override).
   *
   * @experimental
   */
  resolveVariables(
    session: DashboardSession,
    overrides?: Record<string, string | string[]>,
  ): Promise<ResolvedVariables>;
  /**
   * Serializes a session and its cached widget data into a portable snapshot object.
   * The snapshot can be persisted as JSON and later restored with `restoreSnapshot`.
   * @experimental
   */
  serializeSession(
    session: DashboardSession,
    widgetData: Record<string, import("./adapters").DataFrame[]>,
  ): SerializedSnapshot;
  /**
   * Reconstructs a `DashboardSession` from a previously serialized snapshot.
   * Widget execution is NOT re-run — use the snapshot `widgetData` to hydrate
   * your visualization adapters directly.
   * @experimental
   */
  restoreSnapshot(snapshot: SerializedSnapshot): DashboardSession;
};

/** Creates dashboard runtime orchestrator bound to adapter registry and clock/event hooks. */
export function createDashboardRuntime(
  options: DashboardRuntimeOptions
): DashboardRuntime {
  const getNow = options.now ?? Date.now;
  // Populated by executeWidget and registerWidgetTargets so that executeAllWidgets
  // and bindLayoutResize can resolve targets without requiring the host to pass them.
  const widgetTargets = new Map<string, unknown>();
  // Keyed by dashboardId. Stores the gridId and grid target set by applyDashboardLayout
  // so that bindLayoutResize needs no extra input — one dashboard maps to one grid.
  const gridEntries = new Map<string, { gridId: string; target: unknown }>();

  return {
    validateDashboard(
      dashboard: PersistedDashboard,
      userOptions: Omit<
        DashboardValidationOptions,
        "knownDatasources" | "knownVisualizations"
      > = {}
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
      > = {}
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
      dashboard: PersistedDashboard
    ): DashboardPreflightResult {
      const registeredDatasources = new Set(
        options.registry.listDatasourceIds()
      );
      const registeredVisualizations = new Set(
        options.registry.listVisualizationKinds()
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
      input: ApplyDashboardLayoutInput<TTarget>
    ): Promise<void> {
      const adapter = options.registry.requireGrid(input.gridId);
      // Store gridId and target keyed by dashboardId — one dashboard maps to one grid.
      gridEntries.set(input.session.dashboard.dashboardId, {
        gridId: input.gridId,
        target: input.target,
      });

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

    async bindLayoutResize(
      session: DashboardSession
    ): Promise<() => void> {
      const dashboardId = session.dashboard.dashboardId;
      const gridEntry = gridEntries.get(dashboardId);
      if (gridEntry === undefined) {
        throw new DashboardRuntimeException(
          "RUNTIME_TARGET_MISSING",
          `No grid registered for dashboard '${dashboardId}'. Call applyDashboardLayout before bindLayoutResize.`,
          { dashboardId },
        );
      }

      const grid = options.registry.requireGrid(gridEntry.gridId);
      if (!grid.subscribeLayoutChanges) {
        return () => {};
      }

      const widgetById = new Map<string, PersistedWidget>();
      for (const widget of session.widgets) {
        widgetById.set(widget.id, widget);
      }

      const unsubscribe = await grid.subscribeLayoutChanges(
        gridEntry.target,
        (changes) => {
          // Resize each affected widget once per grid event batch.
          const touchedWidgetIds = new Set(
            changes.map((change) => change.widgetId)
          );

          for (const widgetId of touchedWidgetIds) {
            const widget = widgetById.get(widgetId);
            if (!widget) {
              continue;
            }

            const target = widgetTargets.get(widget.id);
            if (target === undefined) {
              continue;
            }

            const adapter = options.registry.requireVisualization(
              widget.visualization.type
            );
            adapter.resize?.(target as unknown);
          }
        }
      );

      return unsubscribe;
    },

    registerWidgetTargets<TTarget = unknown>(targets: Record<string, TTarget>): void {
      for (const [widgetId, target] of Object.entries(targets)) {
        widgetTargets.set(widgetId, target as unknown);
      }
    },

    createBoundSession(session: DashboardSession): BoundDashboardSession {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const runtime = this;
      return {
        session,
        applyLayout<TTarget = unknown>(
          input: Omit<ApplyDashboardLayoutInput<TTarget>, "session">,
        ): Promise<void> {
          return runtime.applyDashboardLayout({ ...input, session });
        },
        bindLayoutResize(): Promise<() => void> {
          return runtime.bindLayoutResize(session);
        },
        executeWidget<TTarget = unknown>(
          input: Omit<ExecuteSessionWidgetInput<TTarget>, "session">,
        ): Promise<DatasourceQueryResult> {
          return runtime.executeWidget({ ...input, session });
        },
        executeAllWidgets(
          input: Omit<ExecuteAllWidgetsInput, "session">,
        ): Promise<ExecuteWidgetResult[]> {
          return runtime.executeAllWidgets({ ...input, session });
        },
        registerWidgetTargets<TTarget = unknown>(targets: Record<string, TTarget>): void {
          runtime.registerWidgetTargets(targets);
        },
        mount<TGridTarget = unknown>(
          input: Omit<
            MountDashboardInput<TGridTarget>,
            "session"
          >,
        ): Promise<MountDashboardResult> {
          return runtime.mountDashboard({ ...input, session });
        },
        async updateVariables(
          variableValues: Record<string, string | string[]>,
          context: RuntimeContext,
        ): Promise<ExecuteWidgetResult[]> {
          // Merge override values with the current resolved variables.
          const updated = await runtime.resolveVariables(session, variableValues);
          // Mutate the session's resolvedVariables in place so subsequent calls see the new values.
          session.resolvedVariables = updated;
          return runtime.executeAllWidgets({
            session,
            context: { ...context, resolvedVariables: updated },
          });
        },
      };
    },

    async mountDashboard<TGridTarget = unknown>(
      input: MountDashboardInput<TGridTarget>,
    ): Promise<MountDashboardResult> {
      await this.applyDashboardLayout({
        session: input.session,
        gridId: input.gridId,
        target: input.gridTarget,
      });

      const widgetResults = await this.executeAllWidgets({
        session: input.session,
        context: input.context,
      });

      const unsubscribe = await this.bindLayoutResize(
        input.session,
      );

      return { widgetResults, unmount: unsubscribe };
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
      > = {}
    ): Promise<DashboardSession> {
      const validation = await this.validateDashboardWithRegistryMetrics(
        dashboard,
        userOptions
      );
      return buildSessionFromValidatedDashboard(validation, dashboard, getNow);
    },

    async executeWidget<TTarget = unknown>(
      input: ExecuteSessionWidgetInput<TTarget>
    ): Promise<DatasourceQueryResult> {
      const widget = input.session.widgets.find(
        (candidate) => candidate.id === input.widgetId
      );
      if (!widget) {
        throw new DashboardRuntimeException(
          "RUNTIME_WIDGET_NOT_FOUND",
          `Widget '${input.widgetId}' not found in session.`,
          { widgetId: input.widgetId }
        );
      }

      // Cache the target so bindLayoutResize can resolve it without a host-supplied map.
      widgetTargets.set(input.widgetId, input.target as unknown);

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

    async executeAllWidgets(
      input: ExecuteAllWidgetsInput
    ): Promise<ExecuteWidgetResult[]> {
      const results: ExecuteWidgetResult[] = [];

      for (const widget of input.session.widgets) {
        const target = widgetTargets.get(widget.id);
        if (target === undefined) {
          throw new DashboardRuntimeException(
            "RUNTIME_TARGET_MISSING",
            `Missing render target for widget '${widget.id}'.`,
            { widgetId: widget.id }
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

    async resolveVariables(
      session: DashboardSession,
      overrides: Record<string, string | string[]> = {},
    ): Promise<ResolvedVariables> {
      const resolved: ResolvedVariables = {};

      for (const variable of session.dashboard.variables ?? []) {
        const override = overrides[variable.name];

        if (variable.type === "custom") {
          // Use override if provided, otherwise fall back to default or first option.
          if (override !== undefined) {
            resolved[variable.name] = override;
          } else if (variable.default !== undefined) {
            resolved[variable.name] = variable.default;
          } else if (variable.options.length > 0) {
            resolved[variable.name] = variable.options[0];
          }
        } else if (variable.type === "textbox") {
          resolved[variable.name] =
            override ?? variable.default ?? "";
        } else if (variable.type === "query") {
          if (override !== undefined) {
            resolved[variable.name] = override;
          } else {
            // Execute a lightweight datasource query to resolve variable options.
            const adapter = options.registry.requireDatasource(variable.datasource);
            try {
              const queryMetric = substituteVariableInString(variable.query, resolved);
              const result = await adapter.query(
                {
                  metric: queryMetric,
                  timeRange: session.dashboardTimeRange,
                },
                { traceId: `var-resolve-${variable.name}`, resolvedVariables: resolved },
              );
              // Collect the first string/number field values as the resolved options.
              const values: string[] = [];
              for (const frame of result.frames) {
                for (const field of frame.fields) {
                  if (field.type === "string" || field.type === "number") {
                    for (const v of field.values) {
                      if (v !== null && v !== undefined) {
                        values.push(String(v));
                      }
                    }
                    break; // Use only the first eligible field.
                  }
                }
              }
              resolved[variable.name] = variable.multi ? values : (values[0] ?? "");
            } catch {
              // Gracefully fall back to empty string on resolution failure.
              resolved[variable.name] = variable.multi ? [] : "";
            }
          }
        }
      }

      return { ...resolved, ...overrides };
    },

    serializeSession(
      session: DashboardSession,
      widgetData: Record<string, import("./adapters").DataFrame[]>,
    ): SerializedSnapshot {
      return {
        dashboard: session.dashboard,
        capturedAt: getNow(),
        widgetData,
        resolvedVariables: session.resolvedVariables,
      };
    },

    restoreSnapshot(snapshot: SerializedSnapshot): DashboardSession {
      const validation = this.validateDashboard(snapshot.dashboard);
      const restoredSession = buildSessionFromValidatedDashboard(
        validation,
        snapshot.dashboard,
        getNow,
      );
      return {
        ...restoredSession,
        resolvedVariables: snapshot.resolvedVariables,
      };
    },
  };
}

function buildSessionFromValidatedDashboard(
  validation: ValidationResult,
  dashboard: PersistedDashboard,
  getNow: () => number
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
      }
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
    details?: JsonObject
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
