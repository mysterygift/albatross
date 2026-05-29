import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'
import { Client, Pool } from 'pg'

import { PostgresDatabaseAdapter } from '@/lib/db/postgresDatabaseAdapter'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { deterministicSchemaName } from '@/test/postgres/schemaAudit'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'

describe('postgres encryption migration parity (ENC8)', () => {
  let connectionError: string | null = null

  beforeAll(async () => {
    const client = new Client(await resolvePostgresTestConfig())
    try {
      await client.connect()
    } catch (error) {
      connectionError = error instanceof Error ? error.message : String(error)
    } finally {
      await client.end().catch(() => undefined)
    }
  })

  it('applies client field encryption and instance-key mirror columns on UAM1 schema', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL encryption migration assertions: ${connectionError}`)
      return
    }

    const schemaName = deterministicSchemaName('pg_enc8_migrations')
    const pool = new Pool(await resolvePostgresTestConfig())
    try {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
      await pool.query(`SET search_path TO ${schemaName}, public`)
      await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')

      const migrations = [
        '0003_uam1_auth_foundation.sql',
        '0006_clients_and_production_delivery.sql',
        '0007_client_field_encryption.sql',
        '0010_user_instance_key_wrapper.sql',
      ]
      for (const file of migrations) {
        const sql = readFileSync(join(process.cwd(), 'postgres/migrations', file), 'utf8')
        await pool.query(sql)
      }

      const db = new PostgresDatabaseAdapter(pool, schemaName)

      const clientColumns = await db.select<Array<{ column_name: string }>>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'clients'
           AND column_name IN ('name_sort_key')`,
        []
      )
      expect(clientColumns.map((c) => c.column_name)).toContain('name_sort_key')

      const mirrorColumns = await db.select<Array<{ column_name: string }>>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name LIKE 'instance_key_wrap_%'`,
        []
      )
      expect(mirrorColumns.length).toBeGreaterThanOrEqual(5)

      const userId = crypto.randomUUID()
      await db.execute(
        `INSERT INTO users (
           id, username, password_hash, role,
           instance_key_wrap_version, instance_key_wrap_salt, instance_key_wrapped,
           instance_key_wrap_created_at
         )
         VALUES ($1, $2, $3, 'admin', 1, $4, $5, CURRENT_TIMESTAMP)`,
        [userId, 'mirror-user', '$argon2id$dummy', 'aa'.repeat(16), 'wrap1:test']
      )

      const clientId = crypto.randomUUID()
      await db.execute(
        `INSERT INTO clients (id, name, name_sort_key, email, phone, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [clientId, 'v1:ciphertext', 'sort-index', 'enc@test.example', null]
      )

      const rows = await db.select<Array<{ name: string }>>('SELECT name FROM clients WHERE id = $1', [
        clientId,
      ])
      expect(rows[0]?.name).toBe('v1:ciphertext')
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      await pool.end()
    }
  })
})
