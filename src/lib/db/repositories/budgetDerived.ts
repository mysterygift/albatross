import { getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { ContingencyRule, FringeRule } from '../types'
import { resolveBudgetRevisionId } from './budgetRevisions'

const FRINGE_TABLE = 'fringe_rules'
const FRINGE_SCOPES_TABLE = 'fringe_rule_scopes'
const CONTINGENCY_TABLE = 'contingency_rules'
const CONTINGENCY_SCOPES_TABLE = 'contingency_rule_scopes'

const MIN_RATE = 0
const MAX_RATE = 1

function rowToFringeRule(r: Record<string, unknown>): FringeRule {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    name: r.name as string,
    rate: r.rate as number,
    base_kind: (r.base_kind as FringeRule['base_kind']) ?? 'budget',
    scope_mode: (r.scope_mode as string) ?? 'include_subtrees',
    is_enabled: Boolean(r.is_enabled),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToContingencyRule(r: Record<string, unknown>): ContingencyRule {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    name: r.name as string,
    rate: r.rate as number,
    base_kind: (r.base_kind as ContingencyRule['base_kind']) ?? 'budget',
    scope_mode: (r.scope_mode as string) ?? 'include_subtrees',
    is_enabled: Boolean(r.is_enabled),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export type FringeRuleWithScopes = FringeRule & { scope_account_ids: string[] }
export type ContingencyRuleWithScopes = ContingencyRule & { scope_account_ids: string[] }

function validateRate(rate: number): void {
  if (typeof rate !== 'number' || Number.isNaN(rate) || rate <= MIN_RATE || rate > MAX_RATE) {
    throw new Error(
      'Rate must be a number greater than 0 and at most 1 (100%). Stored as decimal (e.g. 0.18 = 18%).'
    )
  }
}

// ─── Fringe rules ───────────────────────────────────────────────────────────

export async function listFringeRules(
  productionId: string,
  revisionId?: string | null
): Promise<FringeRuleWithScopes[]> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const rules = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${FRINGE_TABLE} WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL ORDER BY name`,
    [productionId, budgetRevisionId]
  )
  if (rules.length === 0) return []
  const ruleIds = rules.map((r) => r.id as string)
  const placeholders = ruleIds.map((_, i) => `$${i + 1}`).join(', ')
  const scopes = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${FRINGE_SCOPES_TABLE} WHERE rule_id IN (${placeholders})`,
    ruleIds
  )
  const scopesByRule = new Map<string, string[]>()
  for (const s of scopes) {
    const ruleId = s.rule_id as string
    const accId = s.account_id as string
    if (!scopesByRule.has(ruleId)) scopesByRule.set(ruleId, [])
    scopesByRule.get(ruleId)!.push(accId)
  }
  return rules.map((r) => ({
    ...rowToFringeRule(r),
    scope_account_ids: scopesByRule.get(r.id as string) ?? [],
  }))
}

export async function createFringeRule(
  data: Pick<FringeRule, 'production_id' | 'name' | 'rate' | 'base_kind' | 'scope_mode'> & {
    revision_id?: string | null
    scope_account_ids: string[]
  }
): Promise<FringeRuleWithScopes> {
  validateRate(data.rate)
  if (data.scope_account_ids.length === 0) throw new Error('At least one scope account is required')
  const id = uuid()
  const ts = now()
  const budgetRevisionId = await resolveBudgetRevisionId({
    productionId: data.production_id,
    revisionId: data.revision_id,
  })
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await db.execute(
      `INSERT INTO ${FRINGE_TABLE} (id, production_id, budget_revision_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9)`,
      [id, data.production_id, budgetRevisionId, data.name, data.rate, data.base_kind ?? 'budget', data.scope_mode ?? 'include_subtrees', ts, ts]
    )
    for (const accountId of data.scope_account_ids) {
      const scopeId = uuid()
      await db.execute(
        `INSERT INTO ${FRINGE_SCOPES_TABLE} (id, rule_id, account_id, include_children) VALUES ($1, $2, $3, 1)`,
        [scopeId, id, accountId]
      )
      await outboxPush(FRINGE_SCOPES_TABLE, scopeId, 'create', JSON.stringify({ rule_id: id, account_id: accountId }))
    }
    await outboxPush(FRINGE_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  })
  const list = await listFringeRules(data.production_id)
  return list.find((r) => r.id === id)!
}

export async function updateFringeRule(
  ruleId: string,
  data: Partial<Pick<FringeRule, 'name' | 'rate' | 'base_kind' | 'scope_mode'>> & {
    scope_account_ids?: string[]
  }
): Promise<FringeRuleWithScopes> {
  if (data.rate != null) validateRate(data.rate)
  const db = await getDb()
  const ts = now()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${FRINGE_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [ruleId]
  )
  if (existing.length === 0) throw new Error('Fringe rule not found')
  const prodId = existing[0]!.production_id as string

  if (data.scope_account_ids !== undefined) {
    if (data.scope_account_ids.length === 0) throw new Error('At least one scope account is required')
    await runInSerializedTransaction(async () => {
      const db2 = await getDb()
      await db2.execute(`DELETE FROM ${FRINGE_SCOPES_TABLE} WHERE rule_id = $1`, [ruleId])
      for (const accountId of data.scope_account_ids!) {
        const scopeId = uuid()
        await db2.execute(
          `INSERT INTO ${FRINGE_SCOPES_TABLE} (id, rule_id, account_id, include_children) VALUES ($1, $2, $3, 1)`,
          [scopeId, ruleId, accountId]
        )
        await outboxPush(FRINGE_SCOPES_TABLE, scopeId, 'create', JSON.stringify({ rule_id: ruleId, account_id: accountId }))
      }
    })
  }

  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['name', 'rate', 'base_kind', 'scope_mode'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length > 0) {
    cols.push(`updated_at = $${i + 1}`)
    vals.push(ts, ruleId)
    await db.execute(`UPDATE ${FRINGE_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 2}`, vals)
    await outboxPush(FRINGE_TABLE, ruleId, 'update', JSON.stringify({ name: data.name, rate: data.rate, base_kind: data.base_kind, scope_mode: data.scope_mode }))
  }

  const list = await listFringeRules(prodId)
  return list.find((r) => r.id === ruleId)!
}

export async function deleteFringeRule(ruleId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${FRINGE_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, ruleId]
  )
  await outboxPush(FRINGE_TABLE, ruleId, 'delete', null)
}

export async function setFringeRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${FRINGE_TABLE} SET is_enabled = $1, updated_at = $2 WHERE id = $3`,
    [enabled ? 1 : 0, ts, ruleId]
  )
  await outboxPush(FRINGE_TABLE, ruleId, 'update', JSON.stringify({ is_enabled: enabled }))
}

// ─── Contingency rules ───────────────────────────────────────────────────────

export async function listContingencyRules(
  productionId: string,
  revisionId?: string | null
): Promise<ContingencyRuleWithScopes[]> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const rules = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${CONTINGENCY_TABLE} WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL ORDER BY name`,
    [productionId, budgetRevisionId]
  )
  if (rules.length === 0) return []
  const ruleIds = rules.map((r) => r.id as string)
  const placeholders = ruleIds.map((_, i) => `$${i + 1}`).join(', ')
  const scopes = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${CONTINGENCY_SCOPES_TABLE} WHERE rule_id IN (${placeholders})`,
    ruleIds
  )
  const scopesByRule = new Map<string, string[]>()
  for (const s of scopes) {
    const ruleId = s.rule_id as string
    const accId = s.account_id as string
    if (!scopesByRule.has(ruleId)) scopesByRule.set(ruleId, [])
    scopesByRule.get(ruleId)!.push(accId)
  }
  return rules.map((r) => ({
    ...rowToContingencyRule(r),
    scope_account_ids: scopesByRule.get(r.id as string) ?? [],
  }))
}

export async function createContingencyRule(
  data: Pick<ContingencyRule, 'production_id' | 'name' | 'rate' | 'base_kind' | 'scope_mode'> & {
    revision_id?: string | null
    scope_account_ids: string[]
  }
): Promise<ContingencyRuleWithScopes> {
  validateRate(data.rate)
  if (data.scope_account_ids.length === 0) throw new Error('At least one scope account is required')
  const id = uuid()
  const ts = now()
  const budgetRevisionId = await resolveBudgetRevisionId({
    productionId: data.production_id,
    revisionId: data.revision_id,
  })
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await db.execute(
      `INSERT INTO ${CONTINGENCY_TABLE} (id, production_id, budget_revision_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9)`,
      [id, data.production_id, budgetRevisionId, data.name, data.rate, data.base_kind ?? 'budget', data.scope_mode ?? 'include_subtrees', ts, ts]
    )
    for (const accountId of data.scope_account_ids) {
      const scopeId = uuid()
      await db.execute(
        `INSERT INTO ${CONTINGENCY_SCOPES_TABLE} (id, rule_id, account_id, include_children) VALUES ($1, $2, $3, 1)`,
        [scopeId, id, accountId]
      )
      await outboxPush(CONTINGENCY_SCOPES_TABLE, scopeId, 'create', JSON.stringify({ rule_id: id, account_id: accountId }))
    }
    await outboxPush(CONTINGENCY_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  })
  const list = await listContingencyRules(data.production_id)
  return list.find((r) => r.id === id)!
}

export async function updateContingencyRule(
  ruleId: string,
  data: Partial<Pick<ContingencyRule, 'name' | 'rate' | 'base_kind' | 'scope_mode'>> & {
    scope_account_ids?: string[]
  }
): Promise<ContingencyRuleWithScopes> {
  if (data.rate != null) validateRate(data.rate)
  const db = await getDb()
  const ts = now()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${CONTINGENCY_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [ruleId]
  )
  if (existing.length === 0) throw new Error('Contingency rule not found')
  const prodId = existing[0]!.production_id as string

  if (data.scope_account_ids !== undefined) {
    if (data.scope_account_ids.length === 0) throw new Error('At least one scope account is required')
    await runInSerializedTransaction(async () => {
      const db2 = await getDb()
      await db2.execute(`DELETE FROM ${CONTINGENCY_SCOPES_TABLE} WHERE rule_id = $1`, [ruleId])
      for (const accountId of data.scope_account_ids!) {
        const scopeId = uuid()
        await db2.execute(
          `INSERT INTO ${CONTINGENCY_SCOPES_TABLE} (id, rule_id, account_id, include_children) VALUES ($1, $2, $3, 1)`,
          [scopeId, ruleId, accountId]
        )
        await outboxPush(CONTINGENCY_SCOPES_TABLE, scopeId, 'create', JSON.stringify({ rule_id: ruleId, account_id: accountId }))
      }
    })
  }

  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['name', 'rate', 'base_kind', 'scope_mode'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length > 0) {
    cols.push(`updated_at = $${i + 1}`)
    vals.push(ts, ruleId)
    await db.execute(`UPDATE ${CONTINGENCY_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 2}`, vals)
    await outboxPush(CONTINGENCY_TABLE, ruleId, 'update', JSON.stringify(data))
  }

  const list = await listContingencyRules(prodId)
  return list.find((r) => r.id === ruleId)!
}

export async function deleteContingencyRule(ruleId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${CONTINGENCY_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, ruleId]
  )
  await outboxPush(CONTINGENCY_TABLE, ruleId, 'delete', null)
}

export async function setContingencyRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${CONTINGENCY_TABLE} SET is_enabled = $1, updated_at = $2 WHERE id = $3`,
    [enabled ? 1 : 0, ts, ruleId]
  )
  await outboxPush(CONTINGENCY_TABLE, ruleId, 'update', JSON.stringify({ is_enabled: enabled }))
}
