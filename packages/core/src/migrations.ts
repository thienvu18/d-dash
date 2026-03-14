import type { PersistedDashboard, SchemaVersion } from "./schema";

/** Generic persisted dashboard shape that allows unsupported schema versions. */
export type VersionedPersistedDashboard = Omit<PersistedDashboard, "schemaVersion"> & {
  schemaVersion: number;
};

/** Result returned by schema migration utilities. */
export type MigrationResult = {
  dashboard: PersistedDashboard;
  fromVersion: number;
  toVersion: SchemaVersion;
  migrated: boolean;
};

/** Current latest supported schema version for persisted dashboards. */
export const LATEST_SCHEMA_VERSION: SchemaVersion = 1;

class SchemaMigrationException extends Error {
  readonly code = "SCHEMA_UNSUPPORTED_VERSION" as const;

  constructor(version: number) {
    super(`Unsupported schema version '${version}'. Supported versions: [${LATEST_SCHEMA_VERSION}].`);
    this.name = "SchemaMigrationException";
  }
}

/**
 * Migrates a versioned persisted dashboard to the latest schema version.
 *
 * Currently only schemaVersion=1 is supported and is treated as a no-op.
 */
export function migratePersistedDashboard(
  dashboard: VersionedPersistedDashboard,
): MigrationResult {
  if (dashboard.schemaVersion !== LATEST_SCHEMA_VERSION) {
    throw new SchemaMigrationException(dashboard.schemaVersion);
  }

  return {
    dashboard: dashboard as PersistedDashboard,
    fromVersion: dashboard.schemaVersion,
    toVersion: LATEST_SCHEMA_VERSION,
    migrated: false,
  };
}
