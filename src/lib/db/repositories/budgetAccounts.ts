import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import type { SqlStatement } from '../databaseAdapter'
import { outboxPush, outboxStatementForRows, type OutboxRow } from '../outbox'
import { coerceBoolean } from '../sqlValueCoercion'
import type { BudgetAccount } from '../types'

const TABLE = 'budget_accounts'

function rowToAccount(r: Record<string, unknown>): BudgetAccount {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    code: r.code as string,
    name: r.name as string,
    parent_account_id: r.parent_account_id as string | null,
    sort_order: (r.sort_order as number) ?? 0,
    is_postable: coerceBoolean(r.is_postable, false),
    color_hex: (r.color_hex as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

/** List all accounts for a production, ordered by numeric code ascending then sort_order. */
export async function listAccounts(productionId: string): Promise<BudgetAccount[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY CAST(code AS INTEGER) ASC, sort_order ASC, code ASC`,
    [productionId]
  )
  return rows.map(rowToAccount)
}

/** List only postable (leaf) accounts that are not archived. Used for Add line item and Quick-add spend dropdowns. */
export async function listPostableAccounts(productionId: string): Promise<BudgetAccount[]> {
  const db = await getDb()
  const postablePredicate = db.dialect === 'postgres' ? 'is_postable = TRUE' : 'is_postable = 1'
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL AND archived_at IS NULL AND ${postablePredicate} ORDER BY CAST(code AS INTEGER) ASC, sort_order ASC, code ASC`,
    [productionId]
  )
  return rows.map(rowToAccount)
}

/** Returns account by id (including archived). Excludes only deleted. */
export async function getAccountById(id: string): Promise<BudgetAccount | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToAccount(rows[0]!) : null
}

/**
 * Deleted accounts keep their row, and UNIQUE(production_id, code) still counts them, so creating an account
 * with a deleted account's code revives that row with the new details instead of inserting.
 */
export async function listDeletedAccountIdsByCode(productionId: string): Promise<Map<string, string>> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id, code FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NOT NULL`,
    [productionId]
  )
  return new Map(rows.map((r) => [r.code as string, r.id as string]))
}

/** Binds: name, parent_account_id, sort_order, is_postable, updated_at, id. */
export const reviveAccountSql = `UPDATE ${TABLE} SET name = $1, parent_account_id = $2, sort_order = $3, is_postable = $4, color_hex = NULL, archived_at = NULL, deleted_at = NULL, updated_at = $5 WHERE id = $6`

/**
 * Create a budget account. Enforces: code unique per production; parent must exist and be non-postable if provided.
 * archived_at defaults to NULL.
 */
export async function createAccount(account: {
  production_id: string
  code: string
  name: string
  parent_account_id?: string | null
  sort_order?: number
  is_postable?: boolean
}): Promise<BudgetAccount> {
  const db = await getDb()
  const code = String(account.code).trim()
  const name = String(account.name).trim()
  if (!code) throw new Error('Code is required')
  if (!name) throw new Error('Name is required')

  const existingByCode = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE production_id = $1 AND code = $2 AND deleted_at IS NULL`,
    [account.production_id, code]
  )
  if (existingByCode.length > 0) throw new Error('An account with this code already exists in this production')

  const parentId = account.parent_account_id ?? null
  if (parentId) {
    const parent = await getAccountById(parentId)
    if (!parent) throw new Error('Parent account not found')
    if (parent.production_id !== account.production_id) throw new Error('Parent account must belong to the same production')
    if (parent.is_postable) throw new Error('Postable accounts cannot have children; choose a header account as parent')
  }
  const ts = now()
  const isPostable = account.is_postable ?? true
  const revivedId = (await listDeletedAccountIdsByCode(account.production_id)).get(code)
  if (revivedId) {
    await db.execute(reviveAccountSql, [
      name,
      parentId,
      account.sort_order ?? 0,
      isPostable,
      ts,
      revivedId,
    ])
    await outboxPush(TABLE, revivedId, 'update', JSON.stringify({ ...account, code, name, id: revivedId, deleted_at: null }))
    const revived = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [revivedId])
    return rowToAccount(revived[0]!)
  }
  const id = uuid()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, code, name, parent_account_id, sort_order, is_postable, archived_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)`,
    [id, account.production_id, code, name, parentId, account.sort_order ?? 0, isPostable, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...account, code, name, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToAccount(rows[0]!)
}

export async function updateAccountName(accountId: string, name: string): Promise<BudgetAccount> {
  const trimmed = String(name).trim()
  if (!trimmed) throw new Error('Name is required')
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  if (existing.length === 0) throw new Error('Account not found')
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET name = $1, updated_at = $2 WHERE id = $3`,
    [trimmed, ts, accountId]
  )
  await outboxPush(TABLE, accountId, 'update', JSON.stringify({ name: trimmed }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [accountId])
  return rowToAccount(rows[0]!)
}

export async function updateAccountSortOrder(accountId: string, sort_order: number): Promise<BudgetAccount> {
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  if (existing.length === 0) throw new Error('Account not found')
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET sort_order = $1, updated_at = $2 WHERE id = $3`,
    [sort_order, ts, accountId]
  )
  await outboxPush(TABLE, accountId, 'update', JSON.stringify({ sort_order }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [accountId])
  return rowToAccount(rows[0]!)
}

const COLOR_HEX_REGEX = /^#[0-9A-Fa-f]{6}$/

/** Update custom band colour for an account (rollup only in UI). Null clears override. */
export async function updateAccountColor(accountId: string, colorHex: string | null): Promise<void> {
  if (colorHex != null) {
    if (!COLOR_HEX_REGEX.test(colorHex)) {
      throw new Error('Colour must be a 6-digit hex value (e.g. #9DBBAA)')
    }
  }
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  if (existing.length === 0) throw new Error('Account not found')
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET color_hex = $1, updated_at = $2 WHERE id = $3`,
    [colorHex, ts, accountId]
  )
  await outboxPush(TABLE, accountId, 'update', JSON.stringify({ color_hex: colorHex }))
}

async function countChildren(accountId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT COUNT(*) AS cnt FROM ${TABLE} WHERE parent_account_id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  return Number(rows[0]?.cnt ?? 0)
}

async function isReferencedInDerivedScopes(accountId: string): Promise<boolean> {
  const db = await getDb()
  const [fringe] = await db.select<Record<string, unknown>[]>(
    `SELECT 1 FROM fringe_rule_scopes WHERE account_id = $1 LIMIT 1`,
    [accountId]
  )
  if (fringe) return true
  const [contingency] = await db.select<Record<string, unknown>[]>(
    `SELECT 1 FROM contingency_rule_scopes WHERE account_id = $1 LIMIT 1`,
    [accountId]
  )
  return !!contingency
}

/** Config rows that point at an account. They carry no money, so deleting an account detaches them. */
const ACCOUNT_REFERENCE_TABLES = [
  'fringe_rule_scopes',
  'contingency_rule_scopes',
  'cost_report_group_accounts',
  'production_total_accounts',
] as const

/**
 * Statements (no BEGIN/COMMIT) that detach accounts from rule scopes, cost report groups and production
 * totals, then soft-delete them. Callers must already have checked the accounts have no posted amounts.
 */
export async function accountDeletionStatements(accountIds: string[], ts: string): Promise<SqlStatement[]> {
  if (accountIds.length === 0) return []
  const db = await getDb()
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(', ')
  const statements: SqlStatement[] = []
  const outboxRows: OutboxRow[] = []
  for (const table of ACCOUNT_REFERENCE_TABLES) {
    const refs = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM ${table} WHERE account_id IN (${placeholders})`,
      accountIds
    )
    if (refs.length === 0) continue
    statements.push({ sql: `DELETE FROM ${table} WHERE account_id IN (${placeholders})`, bindValues: accountIds })
    for (const r of refs) outboxRows.push({ entity: table, entityId: r.id as string, operation: 'delete', payloadJson: null })
  }
  const tsBase = accountIds.length + 1
  statements.push({
    sql: `UPDATE ${TABLE} SET deleted_at = $${tsBase}, updated_at = $${tsBase + 1} WHERE id IN (${placeholders})`,
    bindValues: [...accountIds, ts, ts],
  })
  for (const id of accountIds) outboxRows.push({ entity: TABLE, entityId: id, operation: 'delete', payloadJson: null })
  const outbox = outboxStatementForRows(outboxRows)
  if (outbox) statements.push(outbox)
  return statements
}

/** Account ids with budget line items or expenses (posted amounts). */
export async function listPostedAccountIds(productionId: string): Promise<Set<string>> {
  const db = await getDb()
  const posted = new Set<string>()
  for (const table of ['budget_items', 'expenses']) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT DISTINCT account_id FROM ${table} WHERE production_id = $1 AND account_id IS NOT NULL AND deleted_at IS NULL`,
      [productionId]
    )
    for (const r of rows) posted.add(r.account_id as string)
  }
  return posted
}

/** Archive account: prevents new posting; historical totals remain (listAccounts still includes archived). */
export async function archiveAccount(accountId: string): Promise<BudgetAccount> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  if (rows.length === 0) throw new Error('Account not found')
  const acc = rowToAccount(rows[0]!)
  if (acc.archived_at) return acc

  const children = await countChildren(accountId)
  if (children > 0) {
    throw new Error('Cannot archive an account that has child accounts. Move or archive the children first.')
  }
  if (await isReferencedInDerivedScopes(accountId)) {
    throw new Error(
      'Cannot archive: this account is used in derived cost rules (fringes or contingency). Remove it from rule scopes first.'
    )
  }

  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET archived_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, accountId]
  )
  await outboxPush(TABLE, accountId, 'update', JSON.stringify({ archived_at: ts }))
  const out = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [accountId])
  return rowToAccount(out[0]!)
}

export async function unarchiveAccount(accountId: string): Promise<BudgetAccount> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  if (rows.length === 0) throw new Error('Account not found')
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET archived_at = NULL, updated_at = $1 WHERE id = $2`,
    [ts, accountId]
  )
  await outboxPush(TABLE, accountId, 'update', JSON.stringify({ archived_at: null }))
  const out = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [accountId])
  return rowToAccount(out[0]!)
}

/**
 * Hard delete (soft-delete) an account. Only allowed when: no children, no budget_items,
 * no expenses, not in derived rule scopes, not in cost_report_group_accounts.
 */
export async function hardDeleteAccount(accountId: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  if (rows.length === 0) throw new Error('Account not found')

  if ((await countChildren(accountId)) > 0) {
    throw new Error('Cannot delete an account that has child accounts. Archive it instead.')
  }
  const [bi] = await db.select<Record<string, unknown>[]>(
    `SELECT 1 FROM budget_items WHERE account_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [accountId]
  )
  if (bi) {
    throw new Error('Cannot delete: this account has budget line items. Archive it instead.')
  }
  const [ex] = await db.select<Record<string, unknown>[]>(
    `SELECT 1 FROM expenses WHERE account_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [accountId]
  )
  if (ex) {
    throw new Error('Cannot delete: this account has expenses. Archive it instead.')
  }

  // Rule scopes, cost report groups and production totals are detached rather than blocking the delete.
  await runInSerializedTransaction(async () => {
    const statements = await accountDeletionStatements([accountId], now())
    await executeBatch(await getDb(), [
      { sql: 'BEGIN', bindValues: [] },
      ...statements,
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

/** Returns whether the account can be hard-deleted (unused). Use for UI to show or disable the delete action. */
export async function getHardDeleteEligibility(accountId: string): Promise<{ allowed: boolean; reason?: string }> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  if (rows.length === 0) return { allowed: false, reason: 'Account not found' }
  if ((await countChildren(accountId)) > 0) {
    return { allowed: false, reason: 'Has child accounts' }
  }
  const [bi] = await db.select<Record<string, unknown>[]>(
    `SELECT 1 FROM budget_items WHERE account_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [accountId]
  )
  if (bi) return { allowed: false, reason: 'Has budget line items' }
  const [ex] = await db.select<Record<string, unknown>[]>(
    `SELECT 1 FROM expenses WHERE account_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [accountId]
  )
  if (ex) return { allowed: false, reason: 'Has expenses' }
  return { allowed: true }
}

/** Returns set of account ids that are eligible for hard delete (no children, items, expenses, or scope/group refs). */
export async function getHardDeleteEligibleAccountIds(productionId: string): Promise<Set<string>> {
  const accounts = await listAccounts(productionId)
  if (accounts.length === 0) return new Set()
  const ineligible = await listPostedAccountIds(productionId)
  for (const a of accounts) {
    if (a.parent_account_id) ineligible.add(a.parent_account_id)
  }
  return new Set(accounts.map((a) => a.id).filter((id) => !ineligible.has(id)))
}

/**
 * Legacy fallback leaf accounts for backfilling category-based rows to account_id.
 * Idempotent: ensures 1001, 2001, 9001, 9701 exist (under 1000, 2000, 9000, 9700) and returns their ids.
 */
export async function ensureLegacyFallbackAccounts(productionId: string): Promise<{
  atl: string
  btl: string
  post: string
  other: string
}> {
  const accounts = await listAccounts(productionId)
  const byCode = new Map<string, BudgetAccount>()
  for (const a of accounts) byCode.set(a.code, a)

  const fallbacks: { code: string; name: string; parentCode: string }[] = [
    { code: '1001', name: 'ATL Misc (Legacy)', parentCode: '1000' },
    { code: '2001', name: 'BTL Misc (Legacy)', parentCode: '2000' },
    { code: '9001', name: 'Post Misc (Legacy)', parentCode: '9000' },
    { code: '9701', name: 'General Misc (Legacy)', parentCode: '9700' },
  ]

  const result = { atl: '', btl: '', post: '', other: '' }
  for (const f of fallbacks) {
    let acc = byCode.get(f.code)
    if (!acc) {
      const parent = byCode.get(f.parentCode)
      acc = await createAccount({
        production_id: productionId,
        code: f.code,
        name: f.name,
        parent_account_id: parent?.id ?? null,
        sort_order: 0,
        is_postable: true,
      })
      byCode.set(f.code, acc)
    }
    if (f.code === '1001') result.atl = acc.id
    else if (f.code === '2001') result.btl = acc.id
    else if (f.code === '9001') result.post = acc.id
    else result.other = acc.id
  }
  return result
}

/** Seed the default production Chart of Accounts when a production is created. */
export async function seedDefaultBudgetAccounts(productionId: string): Promise<void> {
  const defaults: { code: string; name: string; parent_code: string | null; is_postable: boolean }[] = [
    { code: '1000', name: 'Above The Line', parent_code: null, is_postable: false },
    { code: '1100', name: 'Story & Script', parent_code: '1000', is_postable: false },
    { code: '1111', name: 'Script Purchase', parent_code: '1100', is_postable: true },
    { code: '2000', name: 'Production Staff', parent_code: null, is_postable: false },
    { code: '2100', name: 'Production Office', parent_code: '2000', is_postable: false },
    { code: '2101', name: 'Production Office Labor', parent_code: '2100', is_postable: true },
    { code: '2111', name: 'Production Office Purchases', parent_code: '2100', is_postable: true },
    { code: '2500', name: 'Camera / Sound / Grip / Electric', parent_code: '2000', is_postable: false },
    { code: '2513', name: 'Camera Rentals', parent_code: '2500', is_postable: true },
    { code: '2521', name: 'Camera Crew Labor', parent_code: '2500', is_postable: true },
    { code: '3000', name: 'Art Department', parent_code: null, is_postable: false },
    { code: '3111', name: 'Art Purchases', parent_code: '3000', is_postable: true },
    { code: '5000', name: 'Locations', parent_code: null, is_postable: false },
    { code: '5113', name: 'Location Rentals', parent_code: '5000', is_postable: true },
    { code: '5500', name: 'Transportation', parent_code: null, is_postable: false },
    { code: '5513', name: 'Vehicle Rentals', parent_code: '5500', is_postable: true },
    { code: '9000', name: 'Post Production', parent_code: null, is_postable: false },
    { code: '9101', name: 'Editorial Labor', parent_code: '9000', is_postable: true },
    { code: '9700', name: 'Insurance & General', parent_code: null, is_postable: false },
    { code: '9711', name: 'Insurance', parent_code: '9700', is_postable: true },
  ]
  const byCode = new Map<string, string>()
  for (const d of defaults) {
    const parentId = d.parent_code ? byCode.get(d.parent_code) ?? null : null
    const account = await createAccount({
      production_id: productionId,
      code: d.code,
      name: d.name,
      parent_account_id: parentId,
      sort_order: 0,
      is_postable: d.is_postable,
    })
    byCode.set(d.code, account.id)
  }
}
