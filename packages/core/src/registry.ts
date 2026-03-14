import type {
  DatasourceAdapter,
  GridAdapter,
  VisualizationAdapter,
} from "./adapters";
import type { DDashError } from "./errors";
import type { VisualizationKind } from "./schema";

export type RegistryDuplicatePolicy = "reject" | "replace";

export type RegistryOptions = {
  duplicatePolicy?: RegistryDuplicatePolicy;
};

export interface AdapterRegistry {
  registerDatasource(adapter: DatasourceAdapter): void;
  registerVisualization(adapter: VisualizationAdapter): void;
  registerGrid(adapter: GridAdapter): void;

  listDatasourceIds(): string[];
  listVisualizationKinds(): VisualizationKind[];
  listGridIds(): string[];

  getDatasource(id: string): DatasourceAdapter | undefined;
  getVisualization(kind: VisualizationKind): VisualizationAdapter | undefined;
  getGrid(id: string): GridAdapter | undefined;

  requireDatasource(id: string): DatasourceAdapter;
  requireVisualization(kind: VisualizationKind): VisualizationAdapter;
  requireGrid(id: string): GridAdapter;
}

export type RegistryError = DDashError & {
  code: "REGISTRY_DUPLICATE_ADAPTER" | "REGISTRY_ADAPTER_NOT_FOUND";
};

class RegistryException extends Error implements RegistryError {
  readonly code: RegistryError["code"];
  readonly details?: RegistryError["details"];
  readonly retriable?: RegistryError["retriable"];

  constructor(code: RegistryError["code"], message: string, details?: RegistryError["details"]) {
    super(message);
    this.name = "RegistryException";
    this.code = code;
    this.details = details;
    this.retriable = false;
  }
}

export function createAdapterRegistry(options: RegistryOptions = {}): AdapterRegistry {
  const duplicatePolicy: RegistryDuplicatePolicy = options.duplicatePolicy ?? "reject";

  const datasources = new Map<string, DatasourceAdapter>();
  const visualizations = new Map<VisualizationKind, VisualizationAdapter>();
  const grids = new Map<string, GridAdapter>();

  return {
    registerDatasource(adapter: DatasourceAdapter): void {
      registerWithPolicy(datasources, adapter.id, adapter, duplicatePolicy, "datasource");
    },

    registerVisualization(adapter: VisualizationAdapter): void {
      registerWithPolicy(visualizations, adapter.type, adapter, duplicatePolicy, "visualization");
    },

    registerGrid(adapter: GridAdapter): void {
      registerWithPolicy(grids, adapter.id, adapter, duplicatePolicy, "grid");
    },

    listDatasourceIds(): string[] {
      return Array.from(datasources.keys());
    },

    listVisualizationKinds(): VisualizationKind[] {
      return Array.from(visualizations.keys());
    },

    listGridIds(): string[] {
      return Array.from(grids.keys());
    },

    getDatasource(id: string): DatasourceAdapter | undefined {
      return datasources.get(id);
    },

    getVisualization(kind: VisualizationKind): VisualizationAdapter | undefined {
      return visualizations.get(kind);
    },

    getGrid(id: string): GridAdapter | undefined {
      return grids.get(id);
    },

    requireDatasource(id: string): DatasourceAdapter {
      const adapter = datasources.get(id);
      if (!adapter) {
        throw notFoundError("datasource", id);
      }
      return adapter;
    },

    requireVisualization(kind: VisualizationKind): VisualizationAdapter {
      const adapter = visualizations.get(kind);
      if (!adapter) {
        throw notFoundError("visualization", kind);
      }
      return adapter;
    },

    requireGrid(id: string): GridAdapter {
      const adapter = grids.get(id);
      if (!adapter) {
        throw notFoundError("grid", id);
      }
      return adapter;
    },
  };
}

function registerWithPolicy<TKey extends string, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  value: TValue,
  policy: RegistryDuplicatePolicy,
  type: "datasource" | "visualization" | "grid",
): void {
  if (map.has(key) && policy === "reject") {
    throw new RegistryException(
      "REGISTRY_DUPLICATE_ADAPTER",
      `Duplicate ${type} adapter registration for '${key}'.`,
      { type, id: key },
    );
  }

  map.set(key, value);
}

function notFoundError(
  type: "datasource" | "visualization" | "grid",
  id: string,
): RegistryException {
  return new RegistryException(
    "REGISTRY_ADAPTER_NOT_FOUND",
    `No registered ${type} adapter found for '${id}'.`,
    { type, id },
  );
}
