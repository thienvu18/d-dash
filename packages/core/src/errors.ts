import type { JsonObject } from "./json";

export type DDashErrorCode =
  | "SCHEMA_INVALID"
  | "SCHEMA_UNSUPPORTED_VERSION"
  | "RUNTIME_WIDGET_NOT_FOUND"
  | "RUNTIME_TARGET_MISSING"
  | "REGISTRY_DUPLICATE_ADAPTER"
  | "REGISTRY_ADAPTER_NOT_FOUND"
  | "TIME_RANGE_RESOLVE_FAILED"
  | "CAPABILITY_MISMATCH"
  | "DATASOURCE_HTTP_ERROR"
  | "DATASOURCE_PARTIAL"
  | "DATASOURCE_QUERY_FAILED"
  | "VISUALIZATION_RENDER_FAILED"
  | "GRID_LAYOUT_FAILED";

export type DDashError = {
  code: DDashErrorCode;
  message: string;
  details?: JsonObject;
  retriable?: boolean;
};
