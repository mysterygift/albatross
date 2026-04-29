import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'
import { deterministicSchemaName, migrationRerunExpectation } from '@/test/postgres/schemaAudit'

type TestContext = {
  client: Client | null
  schemaName: string
  connectionError: string | null
}

async function applyBaseline(client: Client, schemaName: string): Promise<void> {
  const sql = readFileSync(join(process.cwd(), 'postgres', 'migrations', '0001_baseline.sql'), 'utf8')
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
  await client.query(`SET search_path TO ${schemaName}, public`)
  await client.query(sql)
}

describe('postgres baseline execution', () => {
  const ctx: TestContext = {
    client: null,
    schemaName: '',
    connectionError: null,
  }

  beforeAll(async () => {
    let client: Client | null = null
    try {
      client = new Client(await resolvePostgresTestConfig())
      await client.connect()
    } catch (error) {
      ctx.connectionError = error instanceof Error ? error.message : String(error)
      await client?.end().catch(() => undefined)
      return
    }
    ctx.client = client
    ctx.schemaName = deterministicSchemaName('pg_phase2')
  })

  afterAll(async () => {
    if (ctx.client) {
      if (ctx.schemaName) {
        await ctx.client.query(`DROP SCHEMA IF EXISTS ${ctx.schemaName} CASCADE`)
      }
      await ctx.client.end()
    }
  })

  it('builds from empty schema', async () => {
    if (!ctx.client) {
      console.warn(`Skipping PostgreSQL execution assertions: ${ctx.connectionError ?? 'connection unavailable'}`)
      return
    }
    await applyBaseline(ctx.client, ctx.schemaName)
    const { rows } = await ctx.client.query(
      "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = $1",
      [ctx.schemaName]
    )
    expect(rows[0]?.count).toBeGreaterThan(60)
  })

  it('follows defined rerun behavior', async () => {
    if (!ctx.client) {
      console.warn(`Skipping PostgreSQL rerun assertions: ${ctx.connectionError ?? 'connection unavailable'}`)
      return
    }
    const rerunPolicy = migrationRerunExpectation()
    if (rerunPolicy === 'fail') {
      await expect(applyBaseline(ctx.client, ctx.schemaName)).rejects.toThrow()
      return
    }
    throw new Error(`Unknown rerun policy: ${rerunPolicy}`)
  })
})
