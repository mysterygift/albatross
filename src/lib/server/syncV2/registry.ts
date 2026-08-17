/**
 * Sync v2 collaboration registry.
 *
 * This is deliberately the small `pilot-v1` dependency ring, not a claim of
 * full SQLite/PostgreSQL schema parity. The descriptor is data-only so it can
 * later be generated from the schema inventory and shared with albatross-server.
 */

export type CollaborationSyncClass =
  | 'collaborative'
  | 'asset-backed'
  | 'derived'
  | 'local-only'
  | 'workspace-scoped'

export type CollaborationDependency = {
  readonly table: string
  readonly column: string
  readonly referencedColumn: string
}

export type CollaborationOwnership =
  | {
      readonly kind: 'self'
      readonly column: string
    }
  | {
      readonly kind: 'column'
      readonly column: string
    }
  | {
      readonly kind: 'parent'
      readonly column: string
      readonly parentTable: string
    }

export type CollaborationColumnPolicies = {
  /** Fields that must pass through the sensitive-value wire codec. */
  readonly sensitive: readonly string[]
  /** Fields containing logical asset IDs; bytes use the later asset protocol. */
  readonly assets: readonly string[]
  /** Device-specific fields that must never be replicated. */
  readonly localOnly: readonly string[]
  /** Nullable FKs excluded until their referenced dependency ring is synchronized. */
  readonly deferredForeignKeys: readonly string[]
}

export type CollaborationTableDescriptor = {
  readonly table: string
  readonly syncClass: CollaborationSyncClass
  readonly primaryKey: string
  /** Parent-first snapshot/apply order. Deletes use the reverse order. */
  readonly dependencyOrder: number
  readonly dependencies: readonly CollaborationDependency[]
  readonly ownership: CollaborationOwnership
  readonly columns: CollaborationColumnPolicies
}

export type CollaborationRegistryDescriptor = {
  readonly protocol: 'sync-v2'
  readonly version: string
  readonly scope: 'pilot-v1-partial'
  readonly fullSchemaParity: false
  readonly tables: readonly CollaborationTableDescriptor[]
}

export const COLLABORATION_REGISTRY_DESCRIPTOR = {
  protocol: 'sync-v2',
  version: 'pilot-v1.0.0',
  scope: 'pilot-v1-partial',
  fullSchemaParity: false,
  tables: [
    {
      table: 'productions',
      syncClass: 'collaborative',
      primaryKey: 'id',
      dependencyOrder: 0,
      dependencies: [],
      ownership: { kind: 'self', column: 'id' },
      columns: { sensitive: [], assets: [], localOnly: [], deferredForeignKeys: ['client_id'] },
    },
    {
      table: 'scenes',
      syncClass: 'collaborative',
      primaryKey: 'id',
      dependencyOrder: 1,
      dependencies: [
        { table: 'productions', column: 'production_id', referencedColumn: 'id' },
      ],
      ownership: { kind: 'column', column: 'production_id' },
      columns: { sensitive: [], assets: [], localOnly: [], deferredForeignKeys: ['location_id', 'episode_id'] },
    },
    {
      table: 'shots',
      syncClass: 'collaborative',
      primaryKey: 'id',
      dependencyOrder: 2,
      dependencies: [
        { table: 'scenes', column: 'scene_id', referencedColumn: 'id' },
      ],
      ownership: { kind: 'parent', column: 'scene_id', parentTable: 'scenes' },
      columns: { sensitive: [], assets: [], localOnly: [], deferredForeignKeys: [] },
    },
  ],
} as const satisfies CollaborationRegistryDescriptor

export type PilotCollaborationTable =
  (typeof COLLABORATION_REGISTRY_DESCRIPTOR.tables)[number]['table']

const TABLES_BY_NAME = new Map<string, CollaborationTableDescriptor>(
  COLLABORATION_REGISTRY_DESCRIPTOR.tables.map((table) => [table.table, table]),
)

export function getCollaborationTable(
  table: string,
): CollaborationTableDescriptor | undefined {
  return TABLES_BY_NAME.get(table)
}

export function getSnapshotTableOrder(): readonly PilotCollaborationTable[] {
  return [...COLLABORATION_REGISTRY_DESCRIPTOR.tables]
    .sort((left, right) => left.dependencyOrder - right.dependencyOrder)
    .map((table) => table.table)
}

export function getDeleteTableOrder(): readonly PilotCollaborationTable[] {
  return [...getSnapshotTableOrder()].reverse()
}

export function getSensitiveColumns(table: string): readonly string[] {
  return getCollaborationTable(table)?.columns.sensitive ?? []
}

export function getAssetColumns(table: string): readonly string[] {
  return getCollaborationTable(table)?.columns.assets ?? []
}

export function getLocalOnlyColumns(table: string): readonly string[] {
  return getCollaborationTable(table)?.columns.localOnly ?? []
}

export function getDeferredForeignKeyColumns(table: string): readonly string[] {
  return getCollaborationTable(table)?.columns.deferredForeignKeys ?? []
}

/**
 * Produces a pilot-safe wire row. Deferred nullable FKs are omitted until their
 * dependency rings join the registry; omission means "preserve local value",
 * rather than authoritatively clearing the column on the originating replica.
 */
export function preparePilotRowForReplication(
  table: string,
  row: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const descriptor = getCollaborationTable(table)
  if (!descriptor) throw new Error(`Table is not in the active collaboration registry: ${table}`)
  const prepared = { ...row }
  for (const column of descriptor.columns.localOnly) delete prepared[column]
  for (const column of descriptor.columns.deferredForeignKeys) delete prepared[column]
  return prepared
}

/**
 * Restores fields that are intentionally absent from the pilot wire image.
 * Existing replicas retain their local FK values; a new replica leaves those
 * columns absent so SQLite applies the schema default (normally NULL).
 */
export function mergePilotInboundRow(
  table: string,
  incoming: Readonly<Record<string, unknown>>,
  existing?: Readonly<Record<string, unknown>> | null,
): Record<string, unknown> {
  const descriptor = getCollaborationTable(table)
  if (!descriptor) throw new Error(`Table is not in the active collaboration registry: ${table}`)
  const merged = { ...incoming }
  for (const column of [
    ...descriptor.columns.localOnly,
    ...descriptor.columns.deferredForeignKeys,
  ]) {
    if (existing && Object.prototype.hasOwnProperty.call(existing, column)) {
      merged[column] = existing[column]
    } else {
      delete merged[column]
    }
  }
  return merged
}

/** Stable JSON encoding used as the cross-runtime registry hash input. */
export function canonicalizeRegistry(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Registry numbers must be finite')
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeRegistry(entry)).join(',')}]`
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const fields = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeRegistry(record[key])}`)
    return `{${fields.join(',')}}`
  }

  throw new TypeError(`Unsupported registry value: ${typeof value}`)
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Computes the protocol compatibility hash without a runtime dependency. */
export async function computeCollaborationRegistryHash(
  descriptor: CollaborationRegistryDescriptor = COLLABORATION_REGISTRY_DESCRIPTOR,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeRegistry(descriptor))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${toHex(digest)}`
}

/**
 * Pinned hash for synchronous discovery metadata. A focused test requires this
 * to change whenever the canonical descriptor changes.
 */
export const COLLABORATION_REGISTRY_HASH =
  'sha256:2946370bb4db4eb1853676f3a899e8d500974e18f00005e95d012e51399cec2b'
