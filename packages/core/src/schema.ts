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
  | "stat"
  | "table"
  | "text"
  | "html"
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

/** Top-level persisted dashboard contract. */
export type PersistedDashboard = {
  schemaVersion: SchemaVersion;
  dashboardId: string;
  meta: DashboardMeta;
  timeRange: PersistedTimeRange;
  layout: LayoutItem[];
  widgets: PersistedWidget[];
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
