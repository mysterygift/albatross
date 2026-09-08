import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

import { SyncV2Client, SyncV2RequestError } from './client'
import { getSyncProjectState, loadMutationBatchForPush, type SyncProjectState } from './localStore'
import type { ChangeBatch, SyncCursor } from './types'

export type SyncTrigger =
  | 'startup'
  | 'reconnect'
  | 'local_enqueue'
  | 'head_changed'
  | 'manual'
  | 'visibility'
  | 'periodic'

export type SyncCycleResult = {
  status: 'caught_up' | 'paused' | 'needs_rebootstrap' | 'offline' | 'conflicts' | 'error'
  pulledBatches: number
  pushedBatches: number
  appliedTables: readonly string[]
}

export type SyncV2InboundApplier = (input: {
  productionId: string
  batch: ChangeBatch
  observedHead: SyncCursor
}) => Promise<void>

export type SyncV2CoordinatorOptions = {
  db: DatabaseAdapter
  productionId: string
  clientId: string
  client: SyncV2Client
  applyBatch: SyncV2InboundApplier
  onTablesApplied?: (productionId: string, tables: readonly string[]) => void | Promise<void>
  pullLimit?: number
  pollIntervalMs?: number
  now?: () => Date
  random?: () => number
}

type PendingBatch = { id: string; attempt_count: number }

const ACTIVE_MODES = new Set<SyncProjectState['mode']>(['collaborative', 'offline', 'conflicts'])

function emptyResult(status: SyncCycleResult['status']): SyncCycleResult {
  return { status, pulledBatches: 0, pushedBatches: 0, appliedTables: [] }
}

function retryDelayMs(attempt: number, random: () => number): number {
  const exponential = Math.min(60_000, 1_000 * (2 ** Math.min(Math.max(attempt - 1, 0), 6)))
  return Math.round(exponential * (0.75 + random() * 0.5))
}

async function updateProjectState(
  db: Pick<DatabaseAdapter, 'execute'>,
  productionId: string,
  values: {
    mode?: SyncProjectState['mode']
    headCursor?: number
    lastSyncStartedAt?: string
    lastSyncedAt?: string
    rebootstrapReason?: string | null
  },
): Promise<void> {
  const assignments: string[] = []
  const bindValues: unknown[] = []
  const add = (column: string, value: unknown) => {
    bindValues.push(value)
    assignments.push(`${column} = $${bindValues.length}`)
  }
  if (values.mode !== undefined) add('mode', values.mode)
  if (values.headCursor !== undefined) add('head_cursor', values.headCursor)
  if (values.lastSyncStartedAt !== undefined) add('last_sync_started_at', values.lastSyncStartedAt)
  if (values.lastSyncedAt !== undefined) add('last_synced_at', values.lastSyncedAt)
  if (values.rebootstrapReason !== undefined) add('rebootstrap_reason', values.rebootstrapReason)
  if (assignments.length === 0) return
  add('updated_at', values.lastSyncedAt ?? values.lastSyncStartedAt ?? new Date().toISOString())
  bindValues.push(productionId)
  await db.execute(
    `UPDATE sync_project_state SET ${assignments.join(', ')} WHERE production_id = $${bindValues.length}`,
    bindValues,
  )
}

async function listReadyBatches(
  db: Pick<DatabaseAdapter, 'select'>,
  productionId: string,
  timestamp: string,
): Promise<PendingBatch[]> {
  return db.select<PendingBatch[]>(
    `SELECT id, attempt_count
     FROM sync_mutation_batches
     WHERE production_id = $1
       AND state = 'pending'
       AND (next_attempt_at IS NULL OR next_attempt_at <= $2)
     ORDER BY local_sequence ASC`,
    [productionId, timestamp],
  )
}

async function markBatchInFlight(
  db: Pick<DatabaseAdapter, 'execute'>,
  batchId: string,
  timestamp: string,
): Promise<void> {
  await db.execute(
    `UPDATE sync_mutation_batches
     SET state = 'in_flight', attempt_count = attempt_count + 1,
         next_attempt_at = NULL, last_error_code = NULL, last_error_message = NULL, updated_at = $2
     WHERE id = $1`,
    [batchId, timestamp],
  )
}

async function markBatchAccepted(
  db: Pick<DatabaseAdapter, 'execute'>,
  batchId: string,
  cursor: number,
  timestamp: string,
): Promise<void> {
  await db.execute(
    `UPDATE sync_mutation_batches
     SET state = 'accepted', accepted_cursor = $2, next_attempt_at = NULL,
         last_error_code = NULL, last_error_message = NULL, updated_at = $3
     WHERE id = $1`,
    [batchId, cursor, timestamp],
  )
}

async function markBatchFailure(
  db: Pick<DatabaseAdapter, 'execute'>,
  input: {
    batchId: string
    state: 'pending' | 'blocked' | 'failed'
    code: string
    message: string
    nextAttemptAt: string | null
    timestamp: string
  },
): Promise<void> {
  await db.execute(
    `UPDATE sync_mutation_batches
     SET state = $2, next_attempt_at = $3, last_error_code = $4,
         last_error_message = $5, updated_at = $6
     WHERE id = $1`,
    [input.batchId, input.state, input.nextAttemptAt, input.code, input.message, input.timestamp],
  )
}

function requireRunnableState(state: SyncProjectState | null): asserts state is SyncProjectState & {
  server_project_id: string
  epoch: string
} {
  if (!state) throw new Error('No sync project state exists')
  if (!state.server_project_id) throw new Error('Sync project has no server project id')
  if (!state.epoch) throw new Error('Sync project has no server epoch')
}

/**
 * Coordinates one production. Domain reads remain SQLite-only: the only network
 * effects here are sync-v2 pull, push, and acknowledgement calls.
 */
export class SyncV2ProjectCoordinator {
  private readonly options: Required<Pick<SyncV2CoordinatorOptions, 'pullLimit' | 'pollIntervalMs' | 'now' | 'random'>>
    & Omit<SyncV2CoordinatorOptions, 'pullLimit' | 'pollIntervalMs' | 'now' | 'random'>
  private interval: ReturnType<typeof setInterval> | null = null
  private activeRun: Promise<SyncCycleResult> | null = null
  private rerunRequested = false
  private stopped = true

  constructor(options: SyncV2CoordinatorOptions) {
    this.options = {
      ...options,
      pullLimit: options.pullLimit ?? 100,
      pollIntervalMs: options.pollIntervalMs ?? 30_000,
      now: options.now ?? (() => new Date()),
      random: options.random ?? Math.random,
    }
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    void this.trigger('startup')
    this.interval = setInterval(() => void this.trigger('periodic'), this.options.pollIntervalMs)
  }

  stop(): void {
    this.stopped = true
    this.rerunRequested = false
    if (this.interval) clearInterval(this.interval)
    this.interval = null
  }

  trigger(_reason: SyncTrigger = 'manual'): Promise<SyncCycleResult> {
    if (this.stopped && _reason !== 'manual') return Promise.resolve(emptyResult('paused'))
    if (this.activeRun) {
      this.rerunRequested = true
      return this.activeRun
    }
    this.activeRun = this.runRequestedCycles().finally(() => {
      this.activeRun = null
    })
    return this.activeRun
  }

  private async runRequestedCycles(): Promise<SyncCycleResult> {
    let result = emptyResult('paused')
    do {
      this.rerunRequested = false
      result = await this.runOnce()
    } while (this.rerunRequested && !this.stopped)
    return result
  }

  async runOnce(): Promise<SyncCycleResult> {
    const { db, productionId } = this.options
    let state = await getSyncProjectState(db, productionId)
    if (!state || state.mode === 'local_only' || state.mode === 'paused' || state.mode === 'disabling') {
      return emptyResult('paused')
    }
    if (state.mode === 'needs_rebootstrap') return emptyResult('needs_rebootstrap')
    if (!ACTIVE_MODES.has(state.mode)) return emptyResult('paused')

    try {
      requireRunnableState(state)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await updateProjectState(db, productionId, { mode: 'needs_rebootstrap', rebootstrapReason: message })
      return emptyResult('needs_rebootstrap')
    }

    const startedAt = this.options.now().toISOString()
    await updateProjectState(db, productionId, { lastSyncStartedAt: startedAt })
    // A process can stop after the server commits but before the local receipt is
    // updated. Durable mutation IDs make replay safe, so recover abandoned sends.
    await db.execute(
      `UPDATE sync_mutation_batches
       SET state = 'pending', updated_at = $2
       WHERE production_id = $1 AND state = 'in_flight'`,
      [productionId, startedAt],
    )
    const appliedTables = new Set<string>()
    let pulledBatches = 0
    let pushedBatches = 0

    const pullToObservedHead = async (): Promise<void> => {
      state = await getSyncProjectState(db, productionId)
      requireRunnableState(state)
      let after: SyncCursor = { epoch: state.epoch, sequence: state.applied_cursor }
      for (;;) {
        const response = await this.options.client.pull(state.server_project_id, after, this.options.pullLimit)
        if (response.head.epoch !== state.epoch) throw new SyncV2RequestError({
          message: 'Server sync epoch changed', status: null, code: 'epoch_changed', retryable: false,
        })
        if (response.head.sequence < after.sequence) throw new Error('Server head moved behind the applied cursor')
        if (response.hasMore && response.batches.length === 0) throw new Error('Server returned an empty paginated pull')

        let previousSequence = after.sequence
        const responseTables = new Set<string>()
        for (const batch of response.batches) {
          if (batch.cursor.epoch !== state.epoch || batch.cursor.sequence <= previousSequence) {
            throw new Error('Server returned an out-of-order change batch')
          }
          await this.options.applyBatch({ productionId, batch, observedHead: response.head })
          batch.changes.forEach((change) => {
            appliedTables.add(change.table)
            responseTables.add(change.table)
          })
          previousSequence = batch.cursor.sequence
          pulledBatches += 1
        }
        if (responseTables.size > 0) {
          await this.options.onTablesApplied?.(productionId, [...responseTables])
        }
        after = { epoch: state.epoch, sequence: previousSequence }
        if (!response.hasMore) {
          if (after.sequence !== response.head.sequence) {
            throw new Error('Server pull ended before the observed head cursor')
          }
          await updateProjectState(db, productionId, { headCursor: response.head.sequence })
          return
        }
      }
    }

    try {
      await pullToObservedHead()
      const ready = await listReadyBatches(db, productionId, this.options.now().toISOString())
      for (const pending of ready) {
        const attemptAt = this.options.now().toISOString()
        await markBatchInFlight(db, pending.id, attemptAt)
        const mutation = await loadMutationBatchForPush(db, pending.id)
        if (!mutation) throw new Error(`Pending mutation batch disappeared: ${pending.id}`)
        try {
          const accepted = await this.options.client.push(state.server_project_id, mutation)
          await markBatchAccepted(db, pending.id, accepted.committedCursor.sequence, this.options.now().toISOString())
          pushedBatches += 1
          // Always consume the durable feed. Another client may have committed
          // between our pre-push pull and this mutation, so the response batch
          // alone is not necessarily contiguous with the SQLite cursor.
          await pullToObservedHead()
        } catch (error) {
          const requestError = error instanceof SyncV2RequestError ? error : null
          const timestamp = this.options.now()
          const message = error instanceof Error ? error.message : String(error)
          if (requestError?.code === 'conflict') {
            await markBatchFailure(db, {
              batchId: pending.id, state: 'blocked', code: requestError.code, message,
              nextAttemptAt: null, timestamp: timestamp.toISOString(),
            })
            await updateProjectState(db, productionId, { mode: 'conflicts' })
            return { status: 'conflicts', pulledBatches, pushedBatches, appliedTables: [...appliedTables] }
          }
          if (requestError?.code === 'epoch_changed' || requestError?.code === 'cursor_expired') {
            await markBatchFailure(db, {
              batchId: pending.id, state: 'blocked', code: requestError.code, message,
              nextAttemptAt: null, timestamp: timestamp.toISOString(),
            })
            await updateProjectState(db, productionId, {
              mode: 'needs_rebootstrap', rebootstrapReason: requestError.code,
            })
            return { status: 'needs_rebootstrap', pulledBatches, pushedBatches, appliedTables: [...appliedTables] }
          }
          const retryable = requestError?.retryable ?? false
          const nextAttemptAt = retryable
            ? new Date(timestamp.getTime() + retryDelayMs(pending.attempt_count + 1, this.options.random)).toISOString()
            : null
          await markBatchFailure(db, {
            batchId: pending.id,
            state: retryable ? 'pending' : 'failed',
            code: requestError?.code ?? 'client_error',
            message,
            nextAttemptAt,
            timestamp: timestamp.toISOString(),
          })
          await updateProjectState(db, productionId, { mode: retryable ? 'offline' : 'paused' })
          return {
            status: retryable ? 'offline' : 'error', pulledBatches, pushedBatches,
            appliedTables: [...appliedTables],
          }
        }
      }

      await pullToObservedHead()
      state = await getSyncProjectState(db, productionId)
      requireRunnableState(state)
      const acknowledged = await this.options.client.acknowledge(state.server_project_id, {
        clientId: this.options.clientId,
        appliedCursor: { epoch: state.epoch, sequence: state.applied_cursor },
      })
      if (acknowledged.serverHead.epoch !== state.epoch) {
        throw new SyncV2RequestError({
          message: 'Server sync epoch changed while acknowledging',
          status: null,
          code: 'epoch_changed',
          retryable: false,
        })
      }
      const completedAt = this.options.now().toISOString()
      await updateProjectState(db, productionId, {
        mode: 'collaborative',
        headCursor: acknowledged.serverHead.sequence,
        lastSyncedAt: completedAt,
        rebootstrapReason: null,
      })
      const tables = [...appliedTables]
      return { status: 'caught_up', pulledBatches, pushedBatches, appliedTables: tables }
    } catch (error) {
      const requestError = error instanceof SyncV2RequestError ? error : null
      if (requestError?.code === 'epoch_changed' || requestError?.code === 'cursor_expired') {
        await updateProjectState(db, productionId, {
          mode: 'needs_rebootstrap', rebootstrapReason: requestError.code,
        })
        return { status: 'needs_rebootstrap', pulledBatches, pushedBatches, appliedTables: [...appliedTables] }
      }
      if (requestError?.retryable) {
        await updateProjectState(db, productionId, { mode: 'offline' })
        return { status: 'offline', pulledBatches, pushedBatches, appliedTables: [...appliedTables] }
      }
      return { status: 'error', pulledBatches, pushedBatches, appliedTables: [...appliedTables] }
    }
  }
}
