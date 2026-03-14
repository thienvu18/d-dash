export type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from "./json";

export type { DDashError, DDashErrorCode } from "./errors";

export type {
  DashboardMeta,
  LayoutItem,
  MetricDefinition,
  PersistedDashboard,
  PersistedTimeRange,
  PersistedWidget,
  SchemaVersion,
  VisualizationKind,
  WidgetDisplay,
  WidgetQuery,
  WidgetVisualization,
} from "./schema";

export type {
  MigrationResult,
  VersionedPersistedDashboard,
} from "./migrations";

export {
  LATEST_SCHEMA_VERSION,
  migratePersistedDashboard,
} from "./migrations.js";

export type {
  ResolvedTimeRange,
  ResolvedWidgetExecutionRequest,
  RuntimeContext,
  RuntimeWidget,
  TimeRangeResolveError,
  TimeResolveOptions,
} from "./runtime";

export {
  resolveDashboardTimeRange,
  resolveWidgetTimeRange,
} from "./runtime.js";

export type {
  BuildWidgetExecutionRequestInput,
  ExecuteWidgetInput,
  ExecuteWidgetRenderInput,
} from "./execution";

export {
  buildWidgetExecutionRequest,
  executeWidget,
  executeWidgetQuery,
  executeWidgetRender,
} from "./execution.js";

export type {
  DataField,
  DataFieldType,
  DataFrame,
  DatasourceAdapter,
  DatasourceCapabilities,
  DatasourceQueryError,
  DatasourceQueryPartial,
  DatasourceQueryRequest,
  DatasourceQueryResult,
  DatasourceQuerySuccess,
  GridAdapter,
  GridCapabilities,
  GridLayoutChange,
  ScalarValue,
  VisualizationAdapter,
  VisualizationCapabilities,
  VisualizationRenderRequest,
} from "./adapters";

export type {
  AdapterRegistry,
  RegistryDuplicatePolicy,
  RegistryError,
  RegistryOptions,
} from "./registry";

export { createAdapterRegistry } from "./registry.js";

export type {
  DashboardValidationOptions,
  ValidationIssue,
  ValidationIssueCode,
  ValidationResult,
} from "./validation";

export {
  toSchemaValidationError,
  validatePersistedDashboard,
} from "./validation.js";

export type {
  ApplyDashboardLayoutInput,
  DashboardPreflightResult,
  DashboardRuntimeError,
  DashboardRuntime,
  DashboardRuntimeOptions,
  DashboardSession,
  ExecuteAllWidgetsInput,
  ExecuteSessionWidgetInput,
  ExecuteWidgetResult,
  RuntimeEvent,
  RuntimeEventHandler,
} from "./dashboard-runtime";

export { createDashboardRuntime } from "./dashboard-runtime.js";
