import type { JsonObject } from "./json";

/** Stable machine-readable error codes used in public d-dash contracts. */
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

/** Standard structured error envelope used across runtime and adapters. */
export type DDashError = {
  /** Stable machine-readable error code. */
  code: DDashErrorCode;
  /** Human-readable summary suitable for logs and UIs. */
  message: string;
  /** Optional structured diagnostics for operators and tooling. */
  details?: JsonObject;
  /** Optional retryability hint for callers/orchestrators. */
  retriable?: boolean;
};
