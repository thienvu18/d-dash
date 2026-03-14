import type { DDashError } from "./errors";
import type { JsonObject } from "./json";
import type {
  MetricDefinition,
  VisualizationKind,
} from "./schema";
import type { ResolvedTimeRange, RuntimeContext } from "./runtime";

export type ScalarValue = string | number | boolean | null;

export type DataFieldType = "time" | "number" | "string" | "boolean";

export type DataField = {
  name: string;
  type: DataFieldType;
  values: ScalarValue[];
  labels?: Record<string, string>;
};

export type DataFrame = {
  fields: DataField[];
};

export type DatasourceQueryRequest = {
  metric: string;
  timeRange: ResolvedTimeRange;
  filters?: JsonObject;
};

export type DatasourceQuerySuccess = {
  status: "success";
  frames: DataFrame[];
  warnings?: string[];
};

export type DatasourceQueryPartial = {
  status: "partial";
  frames: DataFrame[];
  warnings?: string[];
  error: DDashError;
};

export type DatasourceQueryError = {
  status: "error";
  frames: DataFrame[];
  warnings?: string[];
  error: DDashError;
};

export type DatasourceQueryResult =
  | DatasourceQuerySuccess
  | DatasourceQueryPartial
  | DatasourceQueryError;

export type DatasourceCapabilities = {
  supportsStreaming?: boolean;
  supportsAdHocFilters?: boolean;
  supportsMetadataDiscovery?: boolean;
};

export interface DatasourceAdapter {
  readonly id: string;
  readonly capabilities?: DatasourceCapabilities;
  getMetrics?(): Promise<MetricDefinition[]>;
  query(
    request: DatasourceQueryRequest,
    context: RuntimeContext,
  ): Promise<DatasourceQueryResult>;
}

export type VisualizationCapabilities = {
  supportsTimeSeries?: boolean;
  supportsStat?: boolean;
  supportsTable?: boolean;
  supportsTextWidget?: boolean;
  supportsHtmlWidget?: boolean;
  supportsTheming?: boolean;
  supportsResize?: boolean;
};

export type VisualizationRenderRequest = {
  kind: VisualizationKind;
  frames: DataFrame[];
  options?: JsonObject;
  context: RuntimeContext;
};

export interface VisualizationAdapter<TTarget = unknown> {
  readonly type: VisualizationKind;
  readonly capabilities?: VisualizationCapabilities;
  init?(target: TTarget): Promise<void> | void;
  render(request: VisualizationRenderRequest, target: TTarget): Promise<void> | void;
  resize?(target: TTarget): Promise<void> | void;
  destroy?(target: TTarget): Promise<void> | void;
}

export type GridCapabilities = {
  supportsDrag?: boolean;
  supportsResize?: boolean;
  supportsResponsiveBreakpoints?: boolean;
};

export type GridLayoutChange = {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export interface GridAdapter<TTarget = unknown> {
  readonly id: string;
  readonly capabilities?: GridCapabilities;
  init(target: TTarget): Promise<void> | void;
  applyLayout(changes: GridLayoutChange[], target: TTarget): Promise<void> | void;
  destroy(target: TTarget): Promise<void> | void;
}
