import type {
  DatasourceAdapter,
  DatasourceCapabilities,
  DatasourceQueryRequest,
  DatasourceQueryResult,
  DataFrame,
  DataField,
} from "@d-dash/core";
import type { RuntimeContext } from "@d-dash/core";

// ---------------------------------------------------------------------------
// Fetch abstraction — injected so the adapter is testable without a real HTTP stack
// ---------------------------------------------------------------------------

/** Minimal subset of the Fetch API used by this adapter. */
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

// ---------------------------------------------------------------------------
// Request / Response envelope types
// ---------------------------------------------------------------------------

/**
 * The JSON body sent to the REST endpoint for every widget query.
 * Server implementations should accept this shape.
 */
export type RestQueryEnvelope = {
  metric: string;
  from: number;
  to: number;
  filters?: Record<string, unknown>;
  context: { traceId?: string };
};

/**
 * Minimal wire format the REST endpoint must return.
 * Each frame maps to a DataFrame; each key in `fields` maps to a DataField.
 */
export type RestResponseEnvelope = {
  status: "success" | "partial" | "error";
  frames: RestFrame[];
  warnings?: string[];
  error?: { code: string; message: string };
};

export type RestFrame = {
  fields: RestField[];
};

export type RestField = {
  name: string;
  type: "time" | "number" | "string" | "boolean";
  values: (string | number | boolean | null)[];
  labels?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Adapter options
// ---------------------------------------------------------------------------

export type RestDatasourceAdapterOptions = {
  /**
   * Identifier used to register this adapter in the d-dash registry.
   * Typically matches the datasource id stored in widget definitions.
   */
  id: string;

  /**
   * Base URL of the REST endpoint. The adapter POSTs to `${baseUrl}/query`.
   * Example: "https://my-metrics-api.example.com/api/v1"
   */
  baseUrl: string;

  /**
   * Static headers forwarded with every request (e.g. Authorization).
   * Sensitive values should never appear in logs or errors.
   */
  headers?: Record<string, string>;

  /**
   * Timeout in milliseconds before the request is aborted.
   * Defaults to 30 000 ms. Pass 0 to disable.
   */
  timeoutMs?: number;

  /**
   * Inject a fetch implementation for testing.
   * Defaults to the global `fetch` when not provided.
   */
  fetch?: FetchFn;
};

// ---------------------------------------------------------------------------
// DataFrame normalization
// ---------------------------------------------------------------------------

function normalizeFrames(rawFrames: RestFrame[]): DataFrame[] {
  return rawFrames.map((frame) => ({
    fields: frame.fields.map(
      (f): DataField => ({
        name: f.name,
        type: f.type,
        values: f.values,
        ...(f.labels ? { labels: f.labels } : {}),
      }),
    ),
  }));
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

const CAPABILITIES: DatasourceCapabilities = {
  supportsAdHocFilters: true,
};

/**
 * Creates a d-dash DatasourceAdapter that queries a JSON REST endpoint.
 *
 * The adapter POSTs a `RestQueryEnvelope` to `${baseUrl}/query` and expects
 * a `RestResponseEnvelope` in return.
 *
 * Usage:
 * ```ts
 * import { createRestDatasourceAdapter } from "@d-dash/datasource-rest";
 *
 * registry.registerDatasource(
 *   createRestDatasourceAdapter({
 *     id: "metrics",
 *     baseUrl: "https://my-api.example.com/api/v1",
 *     headers: { Authorization: `Bearer ${token}` },
 *   }),
 * );
 * ```
 */
export function createRestDatasourceAdapter(
  options: RestDatasourceAdapterOptions,
): DatasourceAdapter {
  const resolveFetch: FetchFn = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    id: options.id,
    capabilities: CAPABILITIES,

    async query(
      request: DatasourceQueryRequest,
      context: RuntimeContext,
    ): Promise<DatasourceQueryResult> {
      const envelope: RestQueryEnvelope = {
        metric: request.metric,
        from: request.timeRange.from,
        to: request.timeRange.to,
        ...(request.filters ? { filters: request.filters as Record<string, unknown> } : {}),
        context: { traceId: context.traceId },
      };

      // Build abort controller for timeout, if configured.
      let signal: AbortSignal | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs > 0) {
        const controller = new AbortController();
        signal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      }

      let raw: unknown;
      try {
        const response = await resolveFetch(`${options.baseUrl}/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
          body: JSON.stringify(envelope),
          signal,
        });

        if (!response.ok) {
          // Map HTTP error to a structured datasource error — avoid leaking
          // response bodies which may contain sensitive server details.
          return {
            status: "error",
            frames: [],
            error: {
              code: "DATASOURCE_HTTP_ERROR" as const,
              message: `HTTP ${response.status} from datasource '${options.id}'.`,
              retriable: response.status >= 500,
            },
          };
        }

        raw = await response.json();
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        return {
          status: "error",
          frames: [],
          error: {
            code: "DATASOURCE_QUERY_FAILED",
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

      const envelope2 = raw as RestResponseEnvelope;

      if (envelope2.status === "error") {
        return {
          status: "error",
          frames: normalizeFrames(envelope2.frames ?? []),
          warnings: envelope2.warnings,
          error: {
            code: (envelope2.error?.code ?? "DATASOURCE_QUERY_FAILED") as import("@d-dash/core").DDashErrorCode,
            message: envelope2.error?.message ?? "Datasource returned an error.",
            retriable: false,
          },
        };
      }

      if (envelope2.status === "partial") {
        return {
          status: "partial",
          frames: normalizeFrames(envelope2.frames ?? []),
          warnings: envelope2.warnings,
          error: {
            code: (envelope2.error?.code ?? "DATASOURCE_PARTIAL") as import("@d-dash/core").DDashErrorCode,
            message: envelope2.error?.message ?? "Datasource returned a partial result.",
            retriable: false,
          },
        };
      }

      return {
        status: "success",
        frames: normalizeFrames(envelope2.frames ?? []),
        warnings: envelope2.warnings,
      };
    },
  };
}
