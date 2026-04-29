import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'

import { setDbAdapterForTests } from '@/lib/db/client'
import {
  ensureSettingsDefaults,
  getSetting,
  setSetting,
} from '@/lib/db/repositories/settings'
import { createProduction } from '@/lib/db/repositories/production'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import {
  getLiveBudgetRevisionForProduction,
  getOrCreateLiveBudgetRevisionIdForProduction,
} from '@/lib/db/repositories/budgetRevisions'
import { createExpense, listExpensesByProduction } from '@/lib/db/repositories/budget'
import { createPostgresRepoHarness } from '@/test/postgres/postgresRepositoryHarness'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'

describe('postgres repository compatibility', () => {
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

  afterEach(() => {
    setDbAdapterForTests(null)
  })

  it('settings defaults insert missing rows without overwriting existing keys', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL repository compatibility assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_repo_settings')
    setDbAdapterForTests(harness.adapter)
    try {
      await setSetting('display_currency', 'USD')
      await ensureSettingsDefaults()
      expect(await getSetting('display_currency')).toBe('USD')
      expect(await getSetting('enable_currency_conversion_api')).toBe('true')
      expect(await getSetting('enable_api_call_tracking')).toBe('false')
    } finally {
      await harness.close()
    }
  })

  it('supports productions + episodes relational inserts and boolean mapping', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL repository compatibility assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_repo_production')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction(
        { name: 'Server Series', notes: null },
        { skipBudgetSeed: true, episodicInitialEpisodeName: 'Episode One' }
      )
      expect(production.is_episodic).toBe(true)
      const episodes = await listEpisodesByProduction(production.id)
      expect(episodes).toHaveLength(1)
      expect(episodes[0]!.production_id).toBe(production.id)
    } finally {
      await harness.close()
    }
  })

  it('handles boolean revision state and numeric budget values', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL repository compatibility assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_repo_budget')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Budget Show', notes: null }, { skipBudgetSeed: true })
      const revisionId = await getOrCreateLiveBudgetRevisionIdForProduction(production.id)
      expect(typeof revisionId).toBe('string')
      const revision = await getLiveBudgetRevisionForProduction(production.id)
      expect(revision?.is_live).toBe(true)

      await createExpense({
        production_id: production.id,
        amount: 1234.56,
        date: '2026-01-02',
        notes: 'postgres numeric mapper',
      })
      const expenses = await listExpensesByProduction(production.id)
      expect(expenses[0]!.amount).toBeCloseTo(1234.56, 2)
      expect(typeof expenses[0]!.amount).toBe('number')
    } finally {
      await harness.close()
    }
  })
})
