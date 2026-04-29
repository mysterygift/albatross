import type { QueryResult as SqlPluginQueryResult } from '@tauri-apps/plugin-sql'
import type { Pool, PoolClient, QueryResult as PgQueryResult } from 'pg'

import type { DatabaseAdapter, SqlStatement } from './databaseAdapter'

function toCompatQueryResult(result: PgQueryResult): SqlPluginQueryResult {
  return {
    rowsAffected: result.rowCount ?? 0,
    lastInsertId: 0,
  }
}

function isBeginStatement(sql: string): boolean {
  return /^\s*BEGIN\b/i.test(sql)
}

function isCommitOrRollbackStatement(sql: string): boolean {
  return /^\s*(COMMIT|ROLLBACK)\b/i.test(sql)
}

type PostgresQueryMetric = {
  kind: 'execute' | 'select' | 'transaction'
  sql: string
  durationMs: number
  waitMs: number
  rows?: number
  error?: string
}

export type PostgresDatabaseAdapterOptions = {
  onMetric?: (metric: PostgresQueryMetric) => void
  slowQueryThresholdMs?: number
}

export class PostgresDatabaseAdapter implements DatabaseAdapter {
  readonly dialect = 'postgres' as const
  private readonly pool: Pool
  private readonly schemaName?: string
  private readonly onMetric?: (metric: PostgresQueryMetric) => void
  private readonly slowQueryThresholdMs: number

  constructor(pool: Pool, schemaName?: string, options?: PostgresDatabaseAdapterOptions) {
    this.pool = pool
    this.schemaName = schemaName
    this.onMetric = options?.onMetric
    this.slowQueryThresholdMs = options?.slowQueryThresholdMs ?? 150
  }

  getPoolStats(): { total: number; idle: number; waiting: number } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    }
  }

  private emitMetric(metric: PostgresQueryMetric): void {
    this.onMetric?.(metric)
    if (metric.durationMs >= this.slowQueryThresholdMs) {
      console.warn(
        `[PG slow] ${metric.kind} ${metric.durationMs.toFixed(1)}ms wait=${metric.waitMs.toFixed(1)}ms ${metric.sql.slice(0, 140)}`
      )
    }
  }

  private async withClient<T>(fn: (client: PoolClient, waitMs: number) => Promise<T>): Promise<T> {
    const waitStart = performance.now()
    const client = await this.pool.connect()
    const waitMs = performance.now() - waitStart
    try {
      if (this.schemaName) {
        await client.query(`SET search_path TO ${this.schemaName}, public`)
      }
      return await fn(client, waitMs)
    } finally {
      client.release()
    }
  }

  async execute(query: string, bindValues?: unknown[]): Promise<SqlPluginQueryResult> {
    return this.withClient(async (client, waitMs) => {
      const start = performance.now()
      try {
        const result = await client.query(query, bindValues)
        this.emitMetric({
          kind: 'execute',
          sql: query,
          durationMs: performance.now() - start,
          waitMs,
          rows: result.rowCount ?? 0,
        })
        return toCompatQueryResult(result)
      } catch (error) {
        this.emitMetric({
          kind: 'execute',
          sql: query,
          durationMs: performance.now() - start,
          waitMs,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    return this.withClient(async (client, waitMs) => {
      const start = performance.now()
      try {
        const result = await client.query(query, bindValues)
        this.emitMetric({
          kind: 'select',
          sql: query,
          durationMs: performance.now() - start,
          waitMs,
          rows: result.rowCount ?? result.rows.length,
        })
        return result.rows as T
      } catch (error) {
        this.emitMetric({
          kind: 'select',
          sql: query,
          durationMs: performance.now() - start,
          waitMs,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
  }

  async executeBatch(statements: SqlStatement[]): Promise<void> {
    if (statements.length === 0) return
    await this.withClient(async (client, waitMs) => {
      const txnStart = performance.now()
      await client.query('BEGIN')
      try {
        for (const statement of statements) {
          if (isBeginStatement(statement.sql) || isCommitOrRollbackStatement(statement.sql)) {
            continue
          }
          await client.query(statement.sql, statement.bindValues)
        }
        await client.query('COMMIT')
        this.emitMetric({
          kind: 'transaction',
          sql: 'BEGIN..COMMIT',
          durationMs: performance.now() - txnStart,
          waitMs,
        })
      } catch (error) {
        await client.query('ROLLBACK')
        this.emitMetric({
          kind: 'transaction',
          sql: 'BEGIN..ROLLBACK',
          durationMs: performance.now() - txnStart,
          waitMs,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
  }

  runInSerializedTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}
