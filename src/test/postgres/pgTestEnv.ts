import type { PoolConfig } from 'pg'
import { Client } from 'pg'

type ResolvedPgConfig = {
  host: string
  port: number
  database: string
  user: string
  password?: string
}

let cachedConfig: ResolvedPgConfig | null = null

function unique(values: Array<string | undefined | null>): string[] {
  const out: string[] = []
  for (const v of values) {
    if (!v) continue
    if (!out.includes(v)) out.push(v)
  }
  return out
}

function envPort(): number {
  return Number(process.env.PGPORT ?? '5432')
}

function explicitConfigFromEnv(): ResolvedPgConfig | null {
  if (!process.env.PGUSER && !process.env.PGDATABASE && !process.env.PGPASSWORD) return null
  return {
    host: process.env.PGHOST ?? '127.0.0.1',
    port: envPort(),
    database: process.env.PGDATABASE ?? 'albatross_ci',
    user: process.env.PGUSER ?? process.env.USER ?? process.env.LOGNAME ?? 'postgres',
    password: process.env.PGPASSWORD,
  }
}

export async function resolvePostgresTestConfig(): Promise<ResolvedPgConfig> {
  if (cachedConfig) return cachedConfig

  const explicit = explicitConfigFromEnv()
  const host = process.env.PGHOST ?? '127.0.0.1'
  const port = envPort()
  const userCandidates = explicit
    ? [explicit.user]
    : unique([process.env.USER, process.env.LOGNAME, 'postgres', 'albatross'])
  const databaseCandidates = explicit
    ? [explicit.database]
    : unique(['albatross_ci', 'postgres'])
  const passwordCandidates = explicit ? [explicit.password] : [undefined, '']

  const errors: string[] = []
  for (const user of userCandidates) {
    for (const database of databaseCandidates) {
      for (const password of passwordCandidates) {
        const candidate: ResolvedPgConfig = { host, port, user, database, password }
        const client = new Client(candidate)
        try {
          await client.connect()
          await client.end()
          cachedConfig = candidate
          return candidate
        } catch (error) {
          errors.push(`${user}@${database}: ${error instanceof Error ? error.message : String(error)}`)
          await client.end().catch(() => undefined)
        }
      }
    }
  }

  throw new Error(
    `Unable to connect to local PostgreSQL. Tried users=[${userCandidates.join(', ')}] ` +
      `databases=[${databaseCandidates.join(', ')}] on ${host}:${port}. Last errors: ${errors.slice(-3).join(' | ')}`
  )
}

export async function resolvePostgresPoolConfig(): Promise<PoolConfig> {
  const base = await resolvePostgresTestConfig()
  return {
    host: base.host,
    port: base.port,
    database: base.database,
    user: base.user,
    password: base.password,
  }
}

export function clearResolvedPostgresTestConfigCache(): void {
  cachedConfig = null
}
