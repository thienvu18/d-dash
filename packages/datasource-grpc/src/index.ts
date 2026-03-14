import type {
  DataField,
  DataFrame,
  DatasourceAdapter,
  DatasourceCapabilities,
  DatasourceQueryRequest,
  DatasourceQueryResult,
  DDashErrorCode,
  MetricDefinition,
  RuntimeContext,
  VisualizationKind,
} from "@d-dash/core";

/** Wire-format query envelope forwarded to gRPC datasource backends. */
export type GrpcQueryEnvelope = {
  metric: string;
  from: number;
  to: number;
  filters?: Record<string, unknown>;
  context?: {
    traceId?: string;
  };
};

/** Wire-format field returned by gRPC datasource backends. */
export type GrpcField = {
  name: string;
  type: "time" | "number" | "string" | "boolean";
  values: (string | number | boolean | null)[];
  labels?: Record<string, string>;
};

/** Wire-format frame returned by gRPC datasource backends. */
export type GrpcFrame = {
  fields: GrpcField[];
};

/** Wire-format top-level response envelope returned by gRPC datasource backends. */
export type GrpcResponseEnvelope = {
  status: "success" | "partial" | "error";
  frames: GrpcFrame[];
  warnings?: string[];
  error?: {
    code?: string;
    message?: string;
    retriable?: boolean;
  };
};

/** Wire-format metric definition shape returned by optional discovery APIs. */
export type GrpcMetricWire =
  | string
  | {
      id?: string;
      name?: string;
      unit?: string;
      supportedVisualizations?: VisualizationKind[];
    };

/** Transport client contract injected into the gRPC datasource adapter. */
export type GrpcDatasourceClient = {
  /** Execute a datasource query over gRPC and return normalized wire envelope. */
  query(request: GrpcQueryEnvelope, context: RuntimeContext): Promise<GrpcResponseEnvelope>;
  /** Optionally discover supported metrics from backend metadata services. */
  getMetrics?(): Promise<GrpcMetricWire[]>;
};

/** Configuration options for creating the gRPC datasource adapter. */
export type GrpcDatasourceAdapterOptions = {
  id: string;
  client: GrpcDatasourceClient;
};

const DEFAULT_VISUALIZATIONS: VisualizationKind[] = ["timeseries", "stat", "table", "text", "html"];

function normalizeFrames(rawFrames: GrpcFrame[]): DataFrame[] {
  return rawFrames.map((frame) => ({
    fields: frame.fields.map(
      (field): DataField => ({
        name: field.name,
        type: field.type,
        values: field.values,
        ...(field.labels ? { labels: field.labels } : {}),
      }),
    ),
  }));
}

function toMetricDefinition(metric: GrpcMetricWire, datasourceId: string): MetricDefinition {
  if (typeof metric === "string") {
    return {
      id: metric,
      name: metric,
      unit: "",
      datasource: datasourceId,
      supportedVisualizations: DEFAULT_VISUALIZATIONS,
    };
  }

  const id = metric.id ?? metric.name ?? "";
  return {
    id,
    name: metric.name ?? id,
    unit: metric.unit ?? "",
    datasource: datasourceId,
    supportedVisualizations: metric.supportedVisualizations ?? DEFAULT_VISUALIZATIONS,
  };
}

function isRetriableGrpcCode(code: string | undefined): boolean {
  if (!code) {
    return false;
  }

  return (
    code === "UNAVAILABLE" ||
    code === "DEADLINE_EXCEEDED" ||
    code === "RESOURCE_EXHAUSTED" ||
    code === "ABORTED" ||
    code === "INTERNAL"
  );
}

function mapTransportError(error: unknown, datasourceId: string) {
  const maybe = error as { code?: unknown; message?: unknown; name?: unknown };
  const code = typeof maybe.code === "string" ? maybe.code : undefined;
  const message = typeof maybe.message === "string" ? maybe.message : undefined;

  return {
    status: "error" as const,
    frames: [],
    error: {
      code: "DATASOURCE_QUERY_FAILED" as DDashErrorCode,
      message: message ?? `gRPC transport error querying datasource '${datasourceId}'.`,
      retriable: isRetriableGrpcCode(code),
      details: code ? { grpcCode: code } : undefined,
    },
  };
}

const BASE_CAPABILITIES: DatasourceCapabilities = {
  supportsAdHocFilters: true,
};

/** Creates a d-dash datasource adapter backed by an injected gRPC client. */
export function createGrpcDatasourceAdapter(
  options: GrpcDatasourceAdapterOptions,
): DatasourceAdapter {
  const capabilities: DatasourceCapabilities = {
    ...BASE_CAPABILITIES,
    ...(options.client.getMetrics ? { supportsMetadataDiscovery: true } : {}),
  };

  return {
    id: options.id,
    capabilities,

    async getMetrics(): Promise<MetricDefinition[]> {
      if (!options.client.getMetrics) {
        return [];
      }

      try {
        const raw = await options.client.getMetrics();
        const metrics: MetricDefinition[] = [];

        for (const item of raw) {
          const metric = toMetricDefinition(item, options.id);
          if (metric.id.trim().length === 0) {
            continue;
          }
          metrics.push(metric);
        }

        return metrics;
      } catch {
        return [];
      }
    },

    async query(
      request: DatasourceQueryRequest,
      context: RuntimeContext,
    ): Promise<DatasourceQueryResult> {
      const envelope: GrpcQueryEnvelope = {
        metric: request.metric,
        from: request.timeRange.from,
        to: request.timeRange.to,
        ...(request.filters ? { filters: request.filters as Record<string, unknown> } : {}),
        context: {
          traceId: context.traceId,
        },
      };

      let response: GrpcResponseEnvelope;
      try {
        response = await options.client.query(envelope, context);
      } catch (error) {
        return mapTransportError(error, options.id);
      }

      const frames = normalizeFrames(response.frames ?? []);

      if (response.status === "error") {
        return {
          status: "error",
          frames,
          warnings: response.warnings,
          error: {
            code: (response.error?.code ?? "DATASOURCE_QUERY_FAILED") as DDashErrorCode,
            message: response.error?.message ?? "Datasource returned a gRPC error response.",
            retriable:
              typeof response.error?.retriable === "boolean"
                ? response.error.retriable
                : isRetriableGrpcCode(response.error?.code),
          },
        };
      }

      if (response.status === "partial") {
        return {
          status: "partial",
          frames,
          warnings: response.warnings,
          error: {
            code: (response.error?.code ?? "DATASOURCE_PARTIAL") as DDashErrorCode,
            message: response.error?.message ?? "Datasource returned a partial gRPC response.",
            retriable:
              typeof response.error?.retriable === "boolean"
                ? response.error.retriable
                : isRetriableGrpcCode(response.error?.code),
          },
        };
      }

      return {
        status: "success",
        frames,
        warnings: response.warnings,
      };
    },
  };
}
