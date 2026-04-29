import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Pool, type PoolConfig } from 'pg'

import { PostgresDatabaseAdapter } from '@/lib/db/postgresDatabaseAdapter'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { deterministicSchemaName } from '@/test/postgres/schemaAudit'
import { resolvePostgresPoolConfig } from '@/test/postgres/pgTestEnv'

async function pgConfigFromEnv(): Promise<PoolConfig> {
  const base = await resolvePostgresPoolConfig()
  const max = Number(process.env.PGPOOL_MAX ?? '8')
  const idleTimeoutMillis = Number(process.env.PGPOOL_IDLE_TIMEOUT_MS ?? '10000')
  const connectionTimeoutMillis = Number(process.env.PGPOOL_ACQUIRE_TIMEOUT_MS ?? '5000')
  return {
    ...base,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  }
}

export type PostgresRepoHarness = {
  adapter: DatabaseAdapter
  postgresAdapter: PostgresDatabaseAdapter
  schemaName: string
  metrics: Array<{
    kind: 'execute' | 'select' | 'transaction'
    sql: string
    durationMs: number
    waitMs: number
    rows?: number
    error?: string
  }>
  getPoolStats: () => { total: number; idle: number; waiting: number }
  close: () => Promise<void>
}

export async function createPostgresRepoHarness(prefix: string): Promise<PostgresRepoHarness> {
  const pool = new Pool(await pgConfigFromEnv())
  const schemaName = deterministicSchemaName(prefix)
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
  await pool.query(`SET search_path TO ${schemaName}, public`)
  const migrationDir = join(process.cwd(), 'postgres', 'migrations')
  const migrationFiles = readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const migrationFile of migrationFiles) {
    const migrationSql = readFileSync(join(migrationDir, migrationFile), 'utf8')
    await pool.query(migrationSql)
  }
  const metrics: PostgresRepoHarness['metrics'] = []
  const adapter = new PostgresDatabaseAdapter(pool, schemaName, {
    slowQueryThresholdMs: Number(process.env.PG_SLOW_QUERY_MS ?? '75'),
    onMetric: (metric) => {
      metrics.push(metric)
    },
  })
  return {
    adapter,
    postgresAdapter: adapter,
    schemaName,
    metrics,
    getPoolStats: () => adapter.getPoolStats(),
    close: async () => {
      await pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      await pool.end()
    },
  }
}
