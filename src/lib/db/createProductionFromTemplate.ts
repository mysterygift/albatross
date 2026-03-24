/**
 * Template-aware production creation orchestration.
 * Routes creation and optional seeding based on the selected project template.
 */

import { uuid } from './client'
import type { Production } from './types'
import { createProduction, setProductionCreatedFromTemplate } from './repositories/production'
import { listAccounts } from './repositories/budgetAccounts'
import { createContingencyRule } from './repositories/budgetDerived'
import { applyTaskTemplateToProduction } from './repositories/taskTemplates'
import { seedChartOfAccountsAndTotalsOnly } from './seed/demoBudgetSeed'
import { seedDemoStyleContentIntoProduction } from './seed/demoProductionSeed'
import { ensureStarterTaskTemplate } from './seed/defaultTaskTemplateSeed'

export type ProductionTemplate = 'blank' | 'demo' | 'default'

export type CreateProductionFromTemplateParams = {
  name: string
  notes: string | null
  template: ProductionTemplate
  /** When true, production is created as episodic with `initialEpisodeName` (irreversible). */
  isEpisodic?: boolean
  initialEpisodeName?: string | null
}

function createOptionsFromEpisodicParams(
  base: { skipBudgetSeed?: boolean },
  params: CreateProductionFromTemplateParams
): { skipBudgetSeed?: boolean; episodicInitialEpisodeName?: string } {
  if (!params.isEpisodic) return base
  const n = (params.initialEpisodeName ?? '').trim()
  if (!n) {
    throw new Error('Episodic production requires a first episode name')
  }
  return { ...base, episodicInitialEpisodeName: n }
}

/**
 * Creates a production from the given template. Blank creates a minimal production
 * via the standard path. Demo and Default create a production then run template-specific
 * seeding.
 */
export async function createProductionFromTemplate(
  params: CreateProductionFromTemplateParams
): Promise<Production> {
  const { name, notes, template } = params

  switch (template) {
    case 'blank':
      return createProduction({ name, notes }, createOptionsFromEpisodicParams({}, params))

    case 'demo': {
      const production = await createProduction(
        { name, notes },
        createOptionsFromEpisodicParams({ skipBudgetSeed: true }, params)
      )
      await seedDemoProductionContent(production.id)
      await setProductionCreatedFromTemplate(production.id, 'demo')
      return production
    }

    case 'default': {
      const production = await createProduction(
        { name, notes },
        createOptionsFromEpisodicParams({ skipBudgetSeed: true }, params)
      )
      await seedDefaultProductionContent(production.id)
      return production
    }

    default: {
      const _exhaust: never = template
      return _exhaust
    }
  }
}

/** Demo template: seed demo-style content into the new production (no collision with DEMO_SLUG). */
async function seedDemoProductionContent(productionId: string): Promise<void> {
  await seedDemoStyleContentIntoProduction(productionId)
}

/** Starter deliverable names for the Default template (light set, no demo clutter). */
const DEFAULT_STARTER_DELIVERABLES = [
  'Picture Master',
  'Textless Master',
  'Stereo Mix',
  '5.1 Surround Mix',
  'Closed Captions',
  'QC Report',
] as const

/**
 * Default template seeding: chart of accounts (demo structure), contingency,
 * starter task template application, and a small starter deliverables set.
 */
async function seedDefaultProductionContent(productionId: string): Promise<void> {
  const { getDb, now, runInSerializedTransaction, executeBatch } = await import('./client')
  const ts = now()

  // 1) Chart of accounts + production totals (same structure as demo; no items/expenses)
  await seedChartOfAccountsAndTotalsOnly(productionId, ts, uuid)

  // 2) Contingency rule scoped to root accounts
  try {
    const accounts = await listAccounts(productionId)
    const rootIds = accounts.filter((a) => a.parent_account_id == null).map((a) => a.id)
    if (rootIds.length > 0) {
      await createContingencyRule({
        production_id: productionId,
        name: 'Contingency',
        rate: 0.1,
        base_kind: 'budget',
        scope_mode: 'include_subtrees',
        scope_account_ids: rootIds,
      })
    }
  } catch {
    // Non-fatal
  }

  // 3) Starter tasks via task-template architecture (Pre-Production, Principal Photography, Post-Production)
  const taskTemplateId = await ensureStarterTaskTemplate()
  await applyTaskTemplateToProduction({
    productionId,
    taskTemplateId,
    anchorDate: null,
  })

  // 4) Small starter deliverables set (light fields only)
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]
    const DEL_TABLE = 'deliverables'
    for (const name of DEFAULT_STARTER_DELIVERABLES) {
      statements.push({
        sql: `INSERT INTO ${DEL_TABLE} (id, production_id, episode_id, name, due_date, status, recipient, delivery_method, delivered_by, delivered_at, approval_status, created_at, updated_at) VALUES ($1, $2, NULL, $3, NULL, 'not_started', NULL, NULL, NULL, NULL, NULL, $4, $5)`,
        bindValues: [uuid(), productionId, name, ts, ts],
      })
    }
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
