import type {
  DataField,
  DataFrame,
  DatasourceAdapter,
  DatasourceCapabilities,
  DatasourceQueryRequest,
  DatasourceQueryResult,
  RuntimeContext,
  DDashErrorCode,
} from "@d-dash/core";

export type FetchFn = (url: string, init?: FetchRequestInit) => Promise<FetchResponse>;

export type FetchRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

export type FetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
};

export type VictoriaMetricsDatasourceAdapterOptions = {
  id: string;
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Default `step` for range queries when caller does not provide one via filters.step. */
  defaultStep?: string;
  fetch?: FetchFn;
};

type VmRangeResult = {
  metric?: Record<string, string>;
  values: [number | string, number | string][];
};

type VmInstantResult = {
  metric?: Record<string, string>;
  value: [number | string, number | string];
};

type VmSuccessEnvelope = {
  status: "success";
  data?: {
    resultType?: "matrix" | "vector" | string;
    result?: Array<VmRangeResult | VmInstantResult>;
  };
  errorType?: string;
  error?: string;
};

const CAPABILITIES: DatasourceCapabilities = {
  supportsAdHocFilters: true,
};

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function shouldUseInstantQuery(filters?: Record<string, unknown>): boolean {
  const mode = filters?.mode;
  return mode === "instant";
}

function resolveStep(
  filters: Record<string, unknown> | undefined,
  defaultStep: string,
): string {
  const step = filters?.step;
  if (typeof step === "string" && step.trim() !== "") {
    return step;
  }
  return defaultStep;
}

function metricToFieldName(metric: Record<string, string> | undefined): string {
  if (!metric || Object.keys(metric).length === 0) {
    return "value";
  }

  const name = metric.__name__;
  if (typeof name === "string" && name.trim() !== "") {
    return name;
  }

  return "value";
}

function normalizeRangeResult(result: VmRangeResult): DataFrame {
  const timeValues: number[] = [];
  const metricValues: number[] = [];

  for (const pair of result.values ?? []) {
    timeValues.push(toNumber(pair[0]) * 1000);
    metricValues.push(toNumber(pair[1]));
  }

  const timeField: DataField = {
    name: "time",
    type: "time",
    values: timeValues,
  };

  const valueField: DataField = {
    name: metricToFieldName(result.metric),
    type: "number",
    values: metricValues,
    labels: result.metric,
  };

  return { fields: [timeField, valueField] };
}

function normalizeInstantResult(result: VmInstantResult): DataFrame {
  const timestamp = toNumber(result.value?.[0] ?? 0) * 1000;
  const value = toNumber(result.value?.[1] ?? 0);

  return {
    fields: [
      {
        name: "time",
        type: "time",
        values: [timestamp],
      },
      {
        name: metricToFieldName(result.metric),
        type: "number",
        values: [value],
        labels: result.metric,
      },
    ],
  };
}

function buildFramesFromVmEnvelope(envelope: VmSuccessEnvelope): DataFrame[] {
  const resultType = envelope.data?.resultType;
  const results = envelope.data?.result ?? [];

  if (resultType === "vector") {
    return results.map((entry) => normalizeInstantResult(entry as VmInstantResult));
  }

  return results.map((entry) => normalizeRangeResult(entry as VmRangeResult));
}

export function createVictoriaMetricsDatasourceAdapter(
  options: VictoriaMetricsDatasourceAdapterOptions,
): DatasourceAdapter {
  const fetchImpl: FetchFn = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? 30_000;
  const defaultStep = options.defaultStep ?? "60s";

  return {
    id: options.id,
    capabilities: CAPABILITIES,

    async query(request: DatasourceQueryRequest, context: RuntimeContext): Promise<DatasourceQueryResult> {
      const filters = (request.filters as Record<string, unknown> | undefined) ?? undefined;
      const instant = shouldUseInstantQuery(filters);
      const endpoint = instant ? "/api/v1/query" : "/api/v1/query_range";

      const payload: Record<string, unknown> = {
        query: request.metric,
      };

      if (instant) {
        payload.time = Math.floor(request.timeRange.to / 1000);
      } else {
        payload.start = Math.floor(request.timeRange.from / 1000);
        payload.end = Math.floor(request.timeRange.to / 1000);
        payload.step = resolveStep(filters, defaultStep);
      }

      if (context.traceId) {
        payload.traceId = context.traceId;
      }

      let signal: AbortSignal | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs > 0) {
        const controller = new AbortController();
        signal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      }

      try {
        const response = await fetchImpl(`${options.baseUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
          body: JSON.stringify(payload),
          signal,
        });

        if (!response.ok) {
          return {
            status: "error",
            frames: [],
            error: {
              code: "DATASOURCE_HTTP_ERROR",
              message: `HTTP ${response.status} from datasource '${options.id}'.`,
              retriable: response.status >= 500,
            },
          };
        }

        const raw = (await response.json()) as VmSuccessEnvelope;

        if (raw.status !== "success") {
          return {
            status: "error",
            frames: [],
            error: {
              code: "DATASOURCE_QUERY_FAILED",
              message: raw.error ?? "VictoriaMetrics query failed.",
              retriable: false,
            },
          };
        }

        const frames = buildFramesFromVmEnvelope(raw);

        return {
          status: "success",
          frames,
        };
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";

        return {
          status: "error",
          frames: [],
          error: {
            code: "DATASOURCE_QUERY_FAILED" as DDashErrorCode,
            message: isAbort
              ? `Request to datasource '${options.id}' timed out.`
              : `Network error querying datasource '${options.id}'.`,
            retriable: !isAbort,
          },
        };
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    },
  };
}
