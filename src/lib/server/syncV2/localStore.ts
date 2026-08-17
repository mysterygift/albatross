import type { DatabaseAdapter, SqlStatement } from '@/lib/db/databaseAdapter'
import { now, uuid } from '@/lib/db/client'

import { getCollaborationTable, getDeferredForeignKeyColumns } from './registry'
import { parsePushMutationRequest } from './codecs'
import { encodeSyncCursor } from './cursor'
import type {
  JsonObject,
  MutationOperation,
  PushMutationRequest,
  SyncCursor,
  SyncV2ProtocolVersion,
} from './types'

export type SyncProjectMode =
  | 'local_only'
  | 'enabling'
  | 'collaborative'
  | 'offline'
  | 'paused'
  | 'conflicts'
  | 'disabling'
  | 'needs_rebootstrap'

export type SyncProjectState = {
  production_id: string
  connection_id: string | null
  server_project_id: string | null
  mode: SyncProjectMode
  epoch: string | null
  applied_cursor: number
  head_cursor: number
  protocol_version: string | null
  schema_version: number | null
  registry_hash: string | null
  credential_ref: string | null
  rebootstrap_reason: string | null
  last_sync_started_at: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type LocalMutationOperation = MutationOperation & {
  /** Optional local post-image retained for reconciliation; never sent as wire input. */
  localResult?: Record<string, unknown> | null
}

export type EnqueueMutationInput = {
  productionId: string
  clientId: string
  operationName: string
  baseCursor: SyncCursor
  protocolVersion: SyncV2ProtocolVersion
  schemaVersion: number
  registryHash: string
  operations: readonly LocalMutationOperation[]
  domainStatements: readonly SqlStatement[]
  batchId?: string
  createdAt?: string
}

export type AppliedRowState = {
  table: string
  entityId: string
  serverVersion: number
  cursor: number
  tombstone: boolean
  rowHash?: string | null
}

export type ApplyPulledBatchInput = {
  productionId: string
  epoch: string
  appliedCursor: number
  headCursor: number
  domainStatements: readonly SqlStatement[]
  rows: readonly AppliedRowState[]
  appliedAt?: string
}

export async function ensureSyncClientIdentity(
  db: Pick<DatabaseAdapter, 'execute'>,
  input: { clientId: string; deviceLabel: string; updatedAt?: string },
): Promise<void> {
  if (!input.clientId.trim()) throw new Error('Sync client id is required')
  if (!input.deviceLabel.trim()) throw new Error('Sync device label is required')
  const updatedAt = input.updatedAt ?? now()
  await db.execute(
    `INSERT INTO sync_client_identity (id, device_label, created_at, updated_at)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (id) DO UPDATE SET device_label = excluded.device_label, updated_at = excluded.updated_at`,
    [input.clientId, input.deviceLabel, updatedAt],
  )
}

function assertJsonValue(value: unknown, path: string, seen: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`)
    return
  }
  if (typeof value !== 'object') throw new Error(`${path} contains a non-JSON value`)
  if (seen.has(value)) throw new Error(`${path} contains a circular reference`)
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`, seen))
  } else {
    Object.entries(value).forEach(([key, entry]) => assertJsonValue(entry, `${path}.${key}`, seen))
  }
  seen.delete(value)
}

function json(value: Record<string, unknown> | null | undefined, label = 'JSON payload'): string | null {
  if (value == null) return null
  assertJsonValue(value, label, new Set())
  return JSON.stringify(value)
}

function assertRegisteredTable(table: string): void {
  if (!getCollaborationTable(table)) {
    throw new Error(`Table is not in the active collaboration registry: ${table}`)
  }
}

function assertNoDeferredForeignKeys(operation: LocalMutationOperation): void {
  const payloads = operation.operation === 'create'
    ? [operation.fullRow]
    : operation.operation === 'patch'
      ? [operation.baseValues, operation.patch]
      : [operation.baseValues]
  for (const column of getDeferredForeignKeyColumns(operation.table)) {
    for (const payload of payloads) {
      if (payload[column] != null) {
        throw new Error(`Pilot sync defers foreign key ${operation.table}.${column}`)
      }
    }
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

async function executeAtomicBatch(db: DatabaseAdapter, statements: readonly SqlStatement[]): Promise<void> {
  if (db.executeTransaction) {
    await db.executeTransaction([...statements])
    return
  }
  try {
    await db.executeBatch([
      { sql: 'BEGIN', bindValues: [] },
      ...statements,
      { sql: 'COMMIT', bindValues: [] },
    ])
  } catch (error) {
    try {
      await db.execute('ROLLBACK')
    } catch {
      // The driver may already have rolled back; preserve the original failure.
    }
    throw error
  }
}

export function buildMutationJournalStatements(input: Omit<EnqueueMutationInput, 'domainStatements'>): {
  batchId: string
  statements: SqlStatement[]
} {
  if (!input.operationName.trim()) throw new Error('A sync mutation batch requires an operation name')

  const batchId = input.batchId ?? uuid()
  const createdAt = input.createdAt ?? now()
  const wireOperations = input.operations.map((operation) => {
    const { localResult: _localResult, ...wireOperation } = operation
    return wireOperation
  })
  const validatedRequest = parsePushMutationRequest({
    protocolVersion: input.protocolVersion,
    schemaVersion: input.schemaVersion,
    registryHash: input.registryHash,
    mutationId: batchId,
    clientId: input.clientId,
    baseCursor: encodeSyncCursor(input.baseCursor),
    operations: wireOperations,
  })
  const statements: SqlStatement[] = [
    {
      sql: `INSERT INTO sync_mutation_batches
        (id, production_id, client_id, local_sequence, operation_name, base_epoch, base_cursor,
         protocol_version, schema_version, registry_hash, state, attempt_count, created_at, updated_at)
        SELECT $1, $2, $3, COALESCE(MAX(local_sequence), -1) + 1, $4, $5, $6, $7, $8, $9, 'pending', 0, $10, $10
        FROM sync_mutation_batches
        WHERE production_id = $2`,
      bindValues: [
        batchId,
        input.productionId,
        validatedRequest.clientId,
        input.operationName,
        validatedRequest.baseCursor.epoch,
        validatedRequest.baseCursor.sequence,
        validatedRequest.protocolVersion,
        validatedRequest.schemaVersion,
        validatedRequest.registryHash,
        createdAt,
      ],
    },
  ]

  validatedRequest.operations.forEach((operation, operationIndex) => {
    assertRegisteredTable(operation.table)
    assertNoDeferredForeignKeys(operation)
    if (!operation.rowId) throw new Error('A sync mutation operation requires a row id')
    if (operation.operation !== 'create') {
      assertPositiveInteger(operation.baseVersion, 'baseVersion')
    }
    statements.push({
      sql: `INSERT INTO sync_mutations
        (batch_id, operation_index, entity_table, entity_id, operation, base_server_version,
         base_values_json, patch_json, full_row_json, local_result_json, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      bindValues: [
        batchId,
        operationIndex,
        operation.table,
        operation.rowId,
        operation.operation,
        operation.baseVersion,
        json(operation.operation === 'create' ? null : operation.baseValues, 'baseValues'),
        json(operation.operation === 'patch' ? operation.patch : null, 'patch'),
        json(operation.operation === 'create' ? operation.fullRow : null, 'fullRow'),
        json(input.operations[operationIndex]?.localResult, 'localResult'),
        createdAt,
      ],
    })
  })

  return { batchId, statements }
}

/**
 * Commits a domain operation and its durable logical mutation batch together.
 * Callers must pass every domain write in `domainStatements`; writing first and
 * journalling afterwards would violate the sync-v2 crash-consistency contract.
 */
export async function executeSyncMutationTransaction(
  db: DatabaseAdapter,
  input: EnqueueMutationInput,
): Promise<string> {
  const journal = buildMutationJournalStatements(input)
  await db.runInSerializedTransaction(async () => {
    await executeAtomicBatch(db, [
      ...input.domainStatements,
      ...journal.statements,
    ])
  })
  return journal.batchId
}

export async function getSyncProjectState(
  db: Pick<DatabaseAdapter, 'select'>,
  productionId: string,
): Promise<SyncProjectState | null> {
  const rows = await db.select<SyncProjectState[]>(
    'SELECT * FROM sync_project_state WHERE production_id = $1',
    [productionId],
  )
  return rows[0] ?? null
}

type PersistedMutationBatch = {
  id: string
  client_id: string
  base_epoch: string
  base_cursor: number
  protocol_version: SyncV2ProtocolVersion
  schema_version: number
  registry_hash: string
}

type PersistedMutationOperation = {
  entity_table: string
  entity_id: string
  operation: MutationOperation['operation']
  base_server_version: number | null
  base_values_json: string | null
  patch_json: string | null
  full_row_json: string | null
}

function parseJsonObject(value: string | null, label: string): JsonObject {
  if (value == null) throw new Error(`Persisted sync mutation is missing ${label}`)
  const parsed = JSON.parse(value) as unknown
  if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`Persisted sync mutation has invalid ${label}`)
  }
  return parsed as JsonObject
}

/** Reconstructs the exact immutable wire request captured when the local transaction committed. */
export async function loadMutationBatchForPush(
  db: Pick<DatabaseAdapter, 'select'>,
  batchId: string,
): Promise<PushMutationRequest | null> {
  const batches = await db.select<PersistedMutationBatch[]>(
    `SELECT id, client_id, base_epoch, base_cursor, protocol_version, schema_version, registry_hash
     FROM sync_mutation_batches WHERE id = $1`,
    [batchId],
  )
  const batch = batches[0]
  if (!batch) return null
  const persistedOperations = await db.select<PersistedMutationOperation[]>(
    `SELECT entity_table, entity_id, operation, base_server_version,
            base_values_json, patch_json, full_row_json
     FROM sync_mutations WHERE batch_id = $1 ORDER BY operation_index ASC`,
    [batchId],
  )
  const operations: MutationOperation[] = persistedOperations.map((operation) => {
    if (operation.operation === 'create') {
      return {
        table: operation.entity_table,
        rowId: operation.entity_id,
        operation: 'create',
        baseVersion: null,
        fullRow: parseJsonObject(operation.full_row_json, 'fullRow'),
      }
    }
    if (operation.base_server_version == null) {
      throw new Error('Persisted sync mutation is missing baseVersion')
    }
    if (operation.operation === 'patch') {
      return {
        table: operation.entity_table,
        rowId: operation.entity_id,
        operation: 'patch',
        baseVersion: operation.base_server_version,
        baseValues: parseJsonObject(operation.base_values_json, 'baseValues'),
        patch: parseJsonObject(operation.patch_json, 'patch'),
      }
    }
    return {
      table: operation.entity_table,
      rowId: operation.entity_id,
      operation: 'delete',
      baseVersion: operation.base_server_version,
      baseValues: parseJsonObject(operation.base_values_json, 'baseValues'),
    }
  })
  return parsePushMutationRequest({
    protocolVersion: batch.protocol_version,
    schemaVersion: batch.schema_version,
    registryHash: batch.registry_hash,
    mutationId: batch.id,
    clientId: batch.client_id,
    baseCursor: encodeSyncCursor({ epoch: batch.base_epoch, sequence: batch.base_cursor }),
    operations,
  })
}

export async function upsertSyncProjectState(
  db: Pick<DatabaseAdapter, 'execute'>,
  input: {
    productionId: string
    connectionId: string | null
    serverProjectId: string | null
    mode: SyncProjectMode
    epoch: string | null
    appliedCursor: number
    headCursor: number
    protocolVersion: string | null
    schemaVersion: number | null
    registryHash: string | null
    credentialRef: string | null
    rebootstrapReason?: string | null
    updatedAt?: string
  },
): Promise<void> {
  assertNonNegativeInteger(input.appliedCursor, 'appliedCursor')
  assertNonNegativeInteger(input.headCursor, 'headCursor')
  if (input.headCursor < input.appliedCursor) throw new Error('headCursor cannot precede appliedCursor')
  const updatedAt = input.updatedAt ?? now()
  await db.execute(
    `INSERT INTO sync_project_state
      (production_id, connection_id, server_project_id, mode, epoch, applied_cursor, head_cursor,
       protocol_version, schema_version, registry_hash, credential_ref, rebootstrap_reason, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
     ON CONFLICT (production_id) DO UPDATE SET
       connection_id = excluded.connection_id,
       server_project_id = excluded.server_project_id,
       mode = excluded.mode,
       epoch = excluded.epoch,
       applied_cursor = excluded.applied_cursor,
       head_cursor = excluded.head_cursor,
       protocol_version = excluded.protocol_version,
       schema_version = excluded.schema_version,
       registry_hash = excluded.registry_hash,
       credential_ref = excluded.credential_ref,
       rebootstrap_reason = excluded.rebootstrap_reason,
       updated_at = excluded.updated_at`,
    [
      input.productionId,
      input.connectionId,
      input.serverProjectId,
      input.mode,
      input.epoch,
      input.appliedCursor,
      input.headCursor,
      input.protocolVersion,
      input.schemaVersion,
      input.registryHash,
      input.credentialRef,
      input.rebootstrapReason ?? null,
      updatedAt,
    ],
  )
}

function buildAppliedRowStateStatements(
  productionId: string,
  rows: readonly AppliedRowState[],
  appliedAt: string,
): SqlStatement[] {
  return rows.map((row) => {
    assertRegisteredTable(row.table)
    assertPositiveInteger(row.serverVersion, 'serverVersion')
    assertNonNegativeInteger(row.cursor, 'cursor')
    return {
      sql: `INSERT INTO sync_row_state
        (production_id, entity_table, entity_id, server_version, applied_cursor, is_tombstone, row_hash, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (production_id, entity_table, entity_id) DO UPDATE SET
         server_version = excluded.server_version,
         applied_cursor = excluded.applied_cursor,
         is_tombstone = excluded.is_tombstone,
         row_hash = excluded.row_hash,
         updated_at = excluded.updated_at`,
      bindValues: [
        productionId,
        row.table,
        row.entityId,
        row.serverVersion,
        row.cursor,
        row.tombstone ? 1 : 0,
        row.rowHash ?? null,
        appliedAt,
      ],
    }
  })
}

/** Applies domain rows, authoritative row metadata, and the pull cursor atomically. */
export async function applyPulledBatchTransaction(
  db: DatabaseAdapter,
  input: ApplyPulledBatchInput,
): Promise<void> {
  assertNonNegativeInteger(input.appliedCursor, 'appliedCursor')
  assertNonNegativeInteger(input.headCursor, 'headCursor')
  if (input.headCursor < input.appliedCursor) throw new Error('headCursor cannot precede appliedCursor')

  await db.runInSerializedTransaction(async () => {
    const state = await getSyncProjectState(db, input.productionId)
    if (!state) throw new Error(`No sync state exists for production ${input.productionId}`)
    if (state.epoch !== input.epoch) throw new Error('Sync epoch changed; re-bootstrap is required')
    if (input.appliedCursor < state.applied_cursor) throw new Error('Pulled cursor cannot move backwards')
    for (const row of input.rows) {
      if (row.cursor !== input.appliedCursor) {
        throw new Error('Every pulled row must use the applied batch cursor')
      }
    }

    const appliedAt = input.appliedAt ?? now()
    await executeAtomicBatch(db, [
      {
        // Missing state, an epoch change, or a stale concurrent applier writes
        // -1 and deliberately violates sync_apply_guard's CHECK constraint.
        sql: `INSERT INTO sync_apply_guard (production_id, guarded_cursor, updated_at)
              VALUES (
                $3,
                COALESCE((
                  SELECT CASE WHEN epoch = $1 AND applied_cursor <= $2 THEN $2 ELSE -1 END
                  FROM sync_project_state
                  WHERE production_id = $3
                ), -1),
                $4
              )
              ON CONFLICT (production_id) DO UPDATE SET
                guarded_cursor = excluded.guarded_cursor,
                updated_at = excluded.updated_at`,
        bindValues: [input.epoch, input.appliedCursor, input.productionId, appliedAt],
      },
      ...input.domainStatements,
      ...buildAppliedRowStateStatements(input.productionId, input.rows, appliedAt),
      {
        sql: `UPDATE sync_project_state
              SET applied_cursor = MAX(applied_cursor, $1), head_cursor = MAX(head_cursor, $2), last_synced_at = $3, updated_at = $3
              WHERE production_id = $4 AND epoch = $5`,
        bindValues: [input.appliedCursor, input.headCursor, appliedAt, input.productionId, input.epoch],
      },
    ])
  })
}
