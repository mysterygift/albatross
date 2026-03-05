import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
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
    is_postable: Boolean(r.is_postable),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

/** List all accounts for a production, ordered by sort_order then code. */
export async function listAccounts(productionId: string): Promise<BudgetAccount[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, code ASC`,
    [productionId]
  )
  return rows.map(rowToAccount)
}

/** List only postable (leaf) accounts for a production. Only these may receive budget items or expenses. */
export async function listPostableAccounts(productionId: string): Promise<BudgetAccount[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND is_postable = 1 AND deleted_at IS NULL ORDER BY code ASC`,
    [productionId]
  )
  return rows.map(rowToAccount)
}

export async function getAccountById(id: string): Promise<BudgetAccount | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToAccount(rows[0]!) : null
}

/**
 * Create a budget account. Enforces: parent_account_id must exist if provided;
 * parent must be non-postable (parent accounts are for rollups only).
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
  const parentId = account.parent_account_id ?? null
  if (parentId) {
    const parent = await getAccountById(parentId)
    if (!parent) throw new Error('Parent account not found')
    if (parent.production_id !== account.production_id) throw new Error('Parent account must belong to the same production')
    if (parent.is_postable) throw new Error('Parent account must be a rollup account (is_postable = false)')
  }
  const id = uuid()
  const ts = now()
  const isPostable = account.is_postable ?? true
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, code, name, parent_account_id, sort_order, is_postable, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      account.production_id,
      account.code,
      account.name,
      parentId,
      account.sort_order ?? 0,
      isPostable ? 1 : 0,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...account, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToAccount(rows[0]!)
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
