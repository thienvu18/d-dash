import type { JsonObject, JsonValue } from "./json";

export type SchemaVersion = 1;

export type PersistedTimeRange =
  | { type: "inherit" }
  | { type: "relative"; value: string }
  | { type: "absolute"; from: number; to: number };

export type DashboardMeta = {
  title: string;
  description?: string;
  tags?: string[];
  folder?: string;
};

export type LayoutItem = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WidgetDisplay = {
  title?: string;
  description?: string;
};

export type WidgetQuery = {
  metric: string;
  filters?: JsonObject;
};

export type VisualizationKind =
  | "timeseries"
  | "stat"
  | "table"
  | "text"
  | "html"
  | (string & {});

export type WidgetVisualization = {
  type: VisualizationKind;
};

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

export type PersistedDashboard = {
  schemaVersion: SchemaVersion;
  dashboardId: string;
  meta: DashboardMeta;
  timeRange: PersistedTimeRange;
  layout: LayoutItem[];
  widgets: PersistedWidget[];
  extensions?: Record<string, JsonValue>;
};

export type MetricDefinition = {
  id: string;
  name: string;
  unit: string;
  datasource: string;
  supportedVisualizations: VisualizationKind[];
};
