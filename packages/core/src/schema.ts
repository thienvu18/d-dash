import type { JsonObject, JsonValue } from "./json";

/** Current persisted dashboard schema version. */
export type SchemaVersion = 1;

/** Persisted dashboard or widget time-range authoring model. */
export type PersistedTimeRange =
  | { type: "inherit" }
  | { type: "relative"; value: string }
  | { type: "absolute"; from: number; to: number };

/** Persisted dashboard metadata fields. */
export type DashboardMeta = {
  title: string;
  description?: string;
  tags?: string[];
  folder?: string;
  tenant?: string;
};

/** Persisted layout entry for a dashboard widget tile. */
export type LayoutItem = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Optional presentation metadata for a widget. */
export type WidgetDisplay = {
  title?: string;
  description?: string;
};

/** Widget query payload persisted in dashboard JSON. */
export type WidgetQuery = {
  metric: string;
  filters?: JsonObject;
};

/** Visualization kind identifier used by adapter registry and widgets. */
export type VisualizationKind =
  | "timeseries"
  | "table"
  | "text"
  | "html"
  | "gauge"
  | "bar"
  | "pie"
  | "heatmap"
  | (string & {});

/** Persisted visualization configuration for a widget. */
export type WidgetVisualization = {
  type: VisualizationKind;
};

/** Persisted widget contract authored and stored by host applications. */
export type PersistedWidget = {
  id: string;
  layoutId: string;
  datasource: string;
  query: WidgetQuery;
  visualization: WidgetVisualization;
  display?: WidgetDisplay;
  timeRange?: PersistedTimeRange;
  options?: JsonObject;
};

// ---------------------------------------------------------------------------
// Template variables
// ---------------------------------------------------------------------------

/**
 * A custom (static) template variable with a fixed list of options.
 * @experimental
 */
export type PersistedCustomVariable = {
  type: "custom";
  name: string;
  label?: string;
  options: string[];
  default?: string;
  multi?: boolean;
};

/**
 * A query-backed template variable resolved by a datasource at runtime.
 * @experimental
 */
export type PersistedQueryVariable = {
  type: "query";
  name: string;
  label?: string;
  datasource: string;
  query: string;
  multi?: boolean;
};

/**
 * A free-text input template variable.
 * @experimental
 */
export type PersistedTextboxVariable = {
  type: "textbox";
  name: string;
  label?: string;
  default?: string;
};

/**
 * Union of all persisted variable kinds supported by d-dash.
 * Add persisted dashboard `variables` to enable template variable substitution.
 * @experimental
 */
export type PersistedVariable =
  | PersistedCustomVariable
  | PersistedQueryVariable
  | PersistedTextboxVariable;

/** Top-level persisted dashboard contract. */
export type PersistedDashboard = {
  schemaVersion: SchemaVersion;
  dashboardId: string;
  meta: DashboardMeta;
  timeRange: PersistedTimeRange;
  layout: LayoutItem[];
  widgets: PersistedWidget[];
  /**
   * Optional template variables. Values are resolved at session creation time
   * and substituted into widget query filters using $variableName syntax.
   * @experimental
   */
  variables?: PersistedVariable[];
  extensions?: Record<string, JsonValue>;
};

/** Metric metadata contract used for validation and discovery. */
export type MetricDefinition = {
  id: string;
  name: string;
  unit: string;
  datasource: string;
  supportedVisualizations: VisualizationKind[];
};
