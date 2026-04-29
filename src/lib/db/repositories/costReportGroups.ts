import { getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { CostReportGroup } from '../types'
import { resolveBudgetRevisionId } from './budgetRevisions'

const GROUPS_TABLE = 'cost_report_groups'
const MAPPINGS_TABLE = 'cost_report_group_accounts'

const CODE_MAX_LENGTH = 10

function rowToGroup(r: Record<string, unknown>): CostReportGroup {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    code: r.code as string | null,
    name: r.name as string,
    sort_order: (r.sort_order as number) ?? 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function normalizeCode(code: string | null | undefined): string | null {
  if (code == null || String(code).trim() === '') return null
  const trimmed = String(code).trim().toUpperCase()
  return trimmed.length > CODE_MAX_LENGTH ? trimmed.slice(0, CODE_MAX_LENGTH) : trimmed
}

function validateName(name: string): string {
  const trimmed = String(name).trim()
  if (!trimmed) throw new Error('Name is required')
  return trimmed
}

export type CostReportGroupWithCount = CostReportGroup & { accountCount: number }

export type CostReportGroupWithAccountIds = CostReportGroup & { account_ids: string[] }

export async function listCostReportGroups(
  productionId: string,
  revisionId?: string | null
): Promise<CostReportGroupWithCount[]> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${GROUPS_TABLE} WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC`,
    [productionId, budgetRevisionId]
  )
  if (rows.length === 0) return []
  const groupIds = rows.map((r) => r.id as string)
  const placeholders = groupIds.map((_, i) => `$${i + 1}`).join(', ')
  const counts = await db.select<Record<string, unknown>[]>(
    `SELECT group_id, COUNT(*) AS cnt FROM ${MAPPINGS_TABLE} WHERE group_id IN (${placeholders}) GROUP BY group_id`,
    groupIds
  )
  const countByGroup = new Map<string, number>()
  for (const c of counts) {
    countByGroup.set(c.group_id as string, Number(c.cnt ?? 0))
  }
  return rows.map((r) => ({
    ...rowToGroup(r),
    accountCount: countByGroup.get(r.id as string) ?? 0,
  }))
}

export async function listGroupAccountIds(groupId: string): Promise<string[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT account_id FROM ${MAPPINGS_TABLE} WHERE group_id = $1`,
    [groupId]
  )
  return rows.map((r) => r.account_id as string)
}

/** List cost report groups with account ids in one call (for Cost Report tab). */
export async function listCostReportGroupsWithAccountIds(
  productionId: string,
  revisionId?: string | null
): Promise<CostReportGroupWithAccountIds[]> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${GROUPS_TABLE} WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC`,
    [productionId, budgetRevisionId]
  )
  if (rows.length === 0) return []
  const groups = rows.map(rowToGroup)
  const groupIds = groups.map((g) => g.id)
  const placeholders = groupIds.map((_, i) => `$${i + 1}`).join(', ')
  const mappingRows = await db.select<Record<string, unknown>[]>(
    `SELECT group_id, account_id FROM ${MAPPINGS_TABLE} WHERE group_id IN (${placeholders})`,
    groupIds
  )
  const accountIdsByGroup = new Map<string, string[]>()
  for (const g of groups) accountIdsByGroup.set(g.id, [])
  for (const m of mappingRows) {
    const gid = m.group_id as string
    const aid = m.account_id as string
    const arr = accountIdsByGroup.get(gid)
    if (arr) arr.push(aid)
  }
  return groups.map((g) => ({ ...g, account_ids: accountIdsByGroup.get(g.id) ?? [] }))
}

async function checkUniqueNameAndCode(
  db: Awaited<ReturnType<typeof getDb>>,
  productionId: string,
  name: string,
  code: string | null,
  excludeGroupId?: string
): Promise<void> {
  const byName = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${GROUPS_TABLE} WHERE production_id = $1 AND name = $2 AND deleted_at IS NULL`,
    [productionId, name]
  )
  if (byName.length > 0 && byName[0]!.id !== excludeGroupId) {
    throw new Error('A group with this name already exists')
  }
  if (code != null) {
    const byCode = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM ${GROUPS_TABLE} WHERE production_id = $1 AND code = $2 AND deleted_at IS NULL`,
      [productionId, code]
    )
    if (byCode.length > 0 && byCode[0]!.id !== excludeGroupId) {
      throw new Error('A group with this code already exists')
    }
  }
}

export async function createCostReportGroup(data: {
  production_id: string
  revision_id?: string | null
  name: string
  code?: string | null
  sort_order?: number
  accountIds?: string[]
}): Promise<CostReportGroup> {
  const name = validateName(data.name)
  const code = normalizeCode(data.code)
  const sortOrder = data.sort_order ?? 0
  const accountIds = data.accountIds ?? []
  const id = uuid()
  const ts = now()
  const budgetRevisionId = await resolveBudgetRevisionId({
    productionId: data.production_id,
    revisionId: data.revision_id,
  })

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await checkUniqueNameAndCode(db, data.production_id, name, code)
    await db.execute(
      `INSERT INTO ${GROUPS_TABLE} (id, production_id, budget_revision_id, code, name, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, data.production_id, budgetRevisionId, code, name, sortOrder, ts, ts]
    )
    for (const accountId of accountIds) {
      await db.execute(
        `INSERT INTO ${MAPPINGS_TABLE} (id, group_id, account_id) VALUES ($1, $2, $3)`,
        [uuid(), id, accountId]
      )
    }
    await outboxPush(GROUPS_TABLE, id, 'create', JSON.stringify({ ...data, id, name, code }))
  })

  const list = await getDb().then((db) =>
    db.select<Record<string, unknown>[]>(`SELECT * FROM ${GROUPS_TABLE} WHERE id = $1`, [id])
  )
  return rowToGroup(list[0]!)
}

export async function updateCostReportGroup(
  groupId: string,
  data: Partial<Pick<CostReportGroup, 'name' | 'code' | 'sort_order'>>
): Promise<CostReportGroup> {
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${GROUPS_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [groupId]
  )
  if (existing.length === 0) throw new Error('Cost report group not found')
  const productionId = existing[0]!.production_id as string
  const currentName = existing[0]!.name as string
  const currentCode = existing[0]!.code as string | null
  const name = data.name !== undefined ? validateName(data.name) : currentName
  const code = data.code !== undefined ? normalizeCode(data.code) : currentCode
  if (data.name !== undefined || data.code !== undefined) {
    await checkUniqueNameAndCode(db, productionId, name, code, groupId)
  }

  const updates: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (data.name !== undefined) {
    updates.push(`name = $${i++}`)
    vals.push(name)
  }
  if (data.code !== undefined) {
    updates.push(`code = $${i++}`)
    vals.push(code)
  }
  if (data.sort_order !== undefined) {
    updates.push(`sort_order = $${i++}`)
    vals.push(data.sort_order)
  }
  if (updates.length > 0) {
    const ts = now()
    updates.push(`updated_at = $${i++}`)
    vals.push(ts, groupId)
    await db.execute(
      `UPDATE ${GROUPS_TABLE} SET ${updates.join(', ')} WHERE id = $${i}`,
      vals
    )
    await outboxPush(GROUPS_TABLE, groupId, 'update', JSON.stringify(data))
  }

  const list = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${GROUPS_TABLE} WHERE id = $1`, [groupId])
  return rowToGroup(list[0]!)
}

export async function setGroupAccountIds(groupId: string, accountIds: string[]): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await db.execute(`DELETE FROM ${MAPPINGS_TABLE} WHERE group_id = $1`, [groupId])
    for (const accountId of accountIds) {
      await db.execute(
        `INSERT INTO ${MAPPINGS_TABLE} (id, group_id, account_id) VALUES ($1, $2, $3)`,
        [uuid(), groupId, accountId]
      )
    }
    await outboxPush(MAPPINGS_TABLE, groupId, 'update', JSON.stringify({ accountIds }))
  })
}

export async function deleteCostReportGroup(groupId: string): Promise<void> {
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await db.execute(`DELETE FROM ${MAPPINGS_TABLE} WHERE group_id = $1`, [groupId])
    await db.execute(
      `UPDATE ${GROUPS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
      [ts, ts, groupId]
    )
    await outboxPush(GROUPS_TABLE, groupId, 'delete', null)
  })
}
