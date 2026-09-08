import type { DatabaseAdapter, SqlStatement } from '@/lib/db/databaseAdapter'

import { applyPulledBatchTransaction, type AppliedRowState } from './localStore'
import { mergePilotInboundRow, type PilotCollaborationTable } from './registry'
import type { ChangeBatch, JsonObject, SyncCursor } from './types'

const PILOT_COLUMNS: Record<PilotCollaborationTable, ReadonlySet<string>> = {
  productions: new Set([
    'id', 'name', 'notes', 'created_at', 'updated_at', 'deleted_at', 'currency_code',
    'wrapped_at', 'slug', 'archived_at', 'is_episodic', 'delivery_date', 'created_from_template',
  ]),
  scenes: new Set([
    'id', 'production_id', 'scene_number', 'description', 'title', 'int_ext',
    'day_night', 'page_eighths', 'duration_minutes', 'created_at', 'updated_at', 'deleted_at',
  ]),
  shots: new Set([
    'id', 'scene_id', 'shot_number', 'subject', 'shot_size', 'support', 'lens',
    'duration_seconds', 'camera_movement', 'notes', 'estimated_shoot_minutes',
    'shot_description', 'created_at', 'updated_at', 'deleted_at',
  ]),
}

function pilotTable(value: string): PilotCollaborationTable {
  if (value === 'productions' || value === 'scenes' || value === 'shots') return value
  throw new Error(`Table is not in the pilot collaboration registry: ${value}`)
}

function validateWireRow(table: PilotCollaborationTable, rowId: string, row: JsonObject): void {
  if (row.id !== rowId) throw new Error(`Pulled ${table} row id does not match its change record`)
  for (const column of Object.keys(row)) {
    if (!PILOT_COLUMNS[table].has(column)) {
      throw new Error(`Pulled ${table} row contains an unsupported column: ${column}`)
    }
  }
}

function upsertStatement(
  table: PilotCollaborationTable,
  row: Readonly<Record<string, unknown>>,
): SqlStatement {
  const columns = Object.keys(row)
  if (columns.length === 0) throw new Error(`Pulled ${table} row is empty`)
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
  const conflict = updates.length > 0 ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING'
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')})
          VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
          ON CONFLICT (id) ${conflict}`,
    bindValues: columns.map((column) => row[column]),
  }
}

async function existingRow(
  db: Pick<DatabaseAdapter, 'select'>,
  table: PilotCollaborationTable,
  rowId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${table} WHERE id = $1`,
    [rowId],
  )
  return rows[0] ?? null
}

async function assertChangeOwnership(
  db: Pick<DatabaseAdapter, 'select'>,
  productionId: string,
  table: PilotCollaborationTable,
  rowId: string,
  row: JsonObject | null,
  incomingSceneIds: ReadonlySet<string>,
): Promise<void> {
  if (table === 'productions') {
    if (rowId !== productionId) throw new Error('Pulled production does not match the local production')
    return
  }
  if (table === 'scenes') {
    if (row && row.production_id !== productionId) {
      throw new Error('Pulled scene does not belong to the local production')
    }
    const existing = await db.select<Array<{ production_id: string }>>(
      'SELECT production_id FROM scenes WHERE id = $1',
      [rowId],
    )
    if (!row && existing[0] && existing[0].production_id !== productionId) {
      throw new Error('Pulled scene delete targets another local production')
    }
    return
  }

  const sceneId = typeof row?.scene_id === 'string' ? row.scene_id : null
  if (sceneId && incomingSceneIds.has(sceneId)) return
  const owner = await db.select<Array<{ production_id: string }>>(
    `SELECT scenes.production_id
     FROM shots
     INNER JOIN scenes ON scenes.id = shots.scene_id
     WHERE shots.id = $1`,
    [rowId],
  )
  if (!row) {
    if (owner[0] && owner[0].production_id !== productionId) {
      throw new Error('Pulled shot delete targets another local production')
    }
    return
  }
  const sceneOwner = await db.select<Array<{ production_id: string }>>(
    'SELECT production_id FROM scenes WHERE id = $1',
    [sceneId],
  )
  if (sceneOwner[0]?.production_id !== productionId) {
    throw new Error('Pulled shot scene does not belong to the local production')
  }
}

/** Applies one complete server transaction to the SQLite pilot graph without repository/outbox capture. */
export async function applyPilotChangeBatch(
  db: DatabaseAdapter,
  input: { productionId: string; batch: ChangeBatch; observedHead: SyncCursor },
): Promise<void> {
  if (input.batch.cursor.epoch !== input.observedHead.epoch) {
    throw new Error('Pulled batch and observed head use different epochs')
  }
  if (input.batch.cursor.sequence > input.observedHead.sequence) {
    throw new Error('Pulled batch is ahead of the observed server head')
  }
  const incomingSceneIds = new Set(
    input.batch.changes
      .filter((change) => change.operation === 'upsert' && change.table === 'scenes')
      .map((change) => change.rowId),
  )

  await db.runInSerializedTransaction(async () => {
    const statements: SqlStatement[] = []
    const rows: AppliedRowState[] = []
    for (const change of input.batch.changes) {
      const table = pilotTable(change.table)
      if (table === 'productions' && change.operation === 'delete') {
        throw new Error('Production deletion requires the collaboration detach workflow')
      }
      const wireRow = change.operation === 'upsert' ? change.row : null
      if (wireRow) validateWireRow(table, change.rowId, wireRow)
      await assertChangeOwnership(
        db,
        input.productionId,
        table,
        change.rowId,
        wireRow,
        incomingSceneIds,
      )
      if (wireRow) {
        const existing = await existingRow(db, table, change.rowId)
        statements.push(upsertStatement(table, mergePilotInboundRow(table, wireRow, existing)))
      } else {
        statements.push({ sql: `DELETE FROM ${table} WHERE id = $1`, bindValues: [change.rowId] })
      }
      rows.push({
        table,
        entityId: change.rowId,
        serverVersion: change.rowVersion,
        cursor: input.batch.cursor.sequence,
        tombstone: change.operation === 'delete',
      })
    }

    await applyPulledBatchTransaction(db, {
      productionId: input.productionId,
      epoch: input.batch.cursor.epoch,
      appliedCursor: input.batch.cursor.sequence,
      headCursor: input.observedHead.sequence,
      domainStatements: statements,
      rows,
      appliedAt: input.batch.committedAt,
    })
  })
}
