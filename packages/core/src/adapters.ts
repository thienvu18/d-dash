import type { DDashError } from "./errors";
import type { JsonObject } from "./json";
import type { MetricDefinition, VisualizationKind } from "./schema";
import type { ResolvedTimeRange, RuntimeContext } from "./runtime";

/** Scalar value types supported in DataField arrays. */
export type ScalarValue = string | number | boolean | null;

/** Supported DataField value type tags. */
export type DataFieldType = "time" | "number" | "string" | "boolean";

/** Single typed field within a DataFrame payload. */
export type DataField = {
  name: string;
  type: DataFieldType;
  values: ScalarValue[];
  labels?: Record<string, string>;
};

/** Normalized table-like data payload exchanged across runtime and adapters. */
export type DataFrame = {
  fields: DataField[];
};

/** Request envelope passed to datasource adapters for widget queries. */
export type DatasourceQueryRequest = {
  metric: string;
  timeRange: ResolvedTimeRange;
  filters?: JsonObject;
};

/** Successful datasource query result envelope. */
export type DatasourceQuerySuccess = {
  status: "success";
  frames: DataFrame[];
  warnings?: string[];
};

/** Partially successful datasource query result envelope. */
export type DatasourceQueryPartial = {
  status: "partial";
  frames: DataFrame[];
  warnings?: string[];
  error: DDashError;
};

/** Failed datasource query result envelope. */
export type DatasourceQueryError = {
  status: "error";
  frames: DataFrame[];
  warnings?: string[];
  error: DDashError;
};

/** Union of all datasource query result envelope variants. */
export type DatasourceQueryResult =
  | DatasourceQuerySuccess
  | DatasourceQueryPartial
  | DatasourceQueryError;

/** Capability flags declared by datasource adapters. */
export type DatasourceCapabilities = {
  supportsStreaming?: boolean;
  supportsAdHocFilters?: boolean;
  supportsMetadataDiscovery?: boolean;
};

/** Datasource adapter public contract implemented by plugins. */
export interface DatasourceAdapter {
  readonly id: string;
  readonly capabilities?: DatasourceCapabilities;
  /** Optional metadata discovery API for known metrics. */
  getMetrics?(): Promise<MetricDefinition[]>;
  /** Execute a datasource query and return normalized result envelopes. */
  query(
    request: DatasourceQueryRequest,
    context: RuntimeContext,
  ): Promise<DatasourceQueryResult>;
}

/** Capability flags declared by visualization adapters. */
export type VisualizationCapabilities = {
  supportsTimeSeries?: boolean;
  supportsTable?: boolean;
  supportsTextWidget?: boolean;
  supportsHtmlWidget?: boolean;
  supportsTheming?: boolean;
  supportsResize?: boolean;
  /** @experimental */
  supportsGauge?: boolean;
  /** @experimental */
  supportsBar?: boolean;
  /** @experimental */
  supportsPie?: boolean;
  /** @experimental */
  supportsHeatmap?: boolean;
};

/** Render request envelope passed to visualization adapters. */
export type VisualizationRenderRequest = {
  kind: VisualizationKind;
  frames: DataFrame[];
  options?: JsonObject;
  context: RuntimeContext;
};

/** Visualization adapter public contract implemented by plugins. */
export interface VisualizationAdapter<TTarget = unknown> {
  readonly type: VisualizationKind;
  readonly capabilities?: VisualizationCapabilities;
  /** Optional setup phase invoked before first render. */
  init?(target: TTarget): Promise<void> | void;
  /** Required render method for widget output. */
  render(
    request: VisualizationRenderRequest,
    target: TTarget,
  ): Promise<void> | void;
  /** Optional resize hook invoked by host/grid lifecycle. */
  resize?(target: TTarget): Promise<void> | void;
  /** Optional cleanup hook invoked during teardown. */
  destroy?(target: TTarget): Promise<void> | void;
}

/** Capability flags declared by grid adapters. */
export type GridCapabilities = {
  supportsDrag?: boolean;
  supportsResize?: boolean;
  supportsResponsiveBreakpoints?: boolean;
};

/** Layout mutation payload forwarded to grid adapters. */
export type GridLayoutChange = {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Callback invoked when grid layout changes are emitted by a grid adapter. */
export type GridLayoutChangeHandler = (changes: GridLayoutChange[]) => void;

/** Grid adapter public contract implemented by plugins. */
export interface GridAdapter<TTarget = unknown> {
  readonly id: string;
  readonly capabilities?: GridCapabilities;
  /** Initialize grid runtime for the provided host target. */
  init(target: TTarget): Promise<void> | void;
  /**
   * Optional subscription API for host/runtime orchestration.
   * Returns an unsubscribe function.
   */
  subscribeLayoutChanges?(
    target: TTarget,
    handler: GridLayoutChangeHandler,
  ): (() => void) | Promise<() => void>;
  /** Apply normalized layout changes for widgets. */
  applyLayout(
    changes: GridLayoutChange[],
    target: TTarget,
  ): Promise<void> | void;
  /** Release all grid resources and listeners. */
  destroy(target: TTarget): Promise<void> | void;
}
