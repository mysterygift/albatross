import { BaseDirectory, remove } from '@tauri-apps/plugin-fs'
import { getDb, now, uuid, runInSerializedTransaction, executeBatch } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { Production } from '../types'
import { episodeInsertStatement, episodeOutboxCreate } from './episodes'
import { seedDefaultBudgetCategories } from './budget'
import { listAccounts, seedDefaultBudgetAccounts } from './budgetAccounts'
import { createContingencyRule } from './budgetDerived'
import { listDocumentsByProduction } from './document'

const ATTACHMENTS_PREFIX = 'attachments/'

const TABLE = 'productions'

/** Slugify name: lowercase, letters/numbers/hyphens only. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'production'
}

function rowToProduction(r: Record<string, unknown>): Production {
  const isEpisodicCol = r.is_episodic
  const is_episodic =
    isEpisodicCol === undefined || isEpisodicCol === null ? false : Number(isEpisodicCol) === 1
  return {
    id: r.id as string,
    name: r.name as string,
    slug: (r.slug as string) ?? `prod-${r.id as string}`,
    currency_code: (r.currency_code as string) ?? 'GBP',
    notes: r.notes as string | null,
    is_episodic,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
    wrapped_at: (r.wrapped_at as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    created_from_template: (r.created_from_template as string | null) ?? null,
  }
}

export type ListProductionsOptions = { includeArchived?: boolean }

/**
 * List productions (non-deleted). Default: active only (archived_at IS NULL).
 * Use includeArchived: true to include archived productions in the list (e.g. Projects view toggle).
 */
export async function listProductions(options?: ListProductionsOptions): Promise<Production[]> {
  const db = await getDb()
  const includeArchived = options?.includeArchived === true
  const where =
    includeArchived
      ? 'deleted_at IS NULL'
      : 'deleted_at IS NULL AND archived_at IS NULL'
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE ${where} ORDER BY archived_at IS NOT NULL, name`
  )
  return rows.map(rowToProduction)
}

/** Archive a production (reversible). Sets archived_at and updated_at. */
export async function archiveProduction(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET archived_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ archived_at: ts }))
}

/** Unarchive a production. Clears archived_at and updates updated_at. */
export async function unarchiveProduction(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET archived_at = NULL, updated_at = $1 WHERE id = $2`,
    [ts, id]
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ archived_at: null }))
}

/**
 * Complete and archive a production (Wrap Production workflow).
 * Sets wrapped_at and archived_at to now; validates production exists and is not deleted.
 * Atomic: single transaction with outbox.
 */
export async function completeAndArchiveProduction(id: string): Promise<void> {
  const existing = await getProductionById(id)
  if (!existing) {
    throw new Error('Production not found or deleted')
  }
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `UPDATE ${TABLE} SET wrapped_at = $1, archived_at = $1, updated_at = $1 WHERE id = $2`,
        bindValues: [ts, id],
      },
      outboxStatementForRow({
        entity: TABLE,
        entityId: id,
        operation: 'update',
        payloadJson: JSON.stringify({ wrapped_at: ts, archived_at: ts }),
      }),
      { sql: 'COMMIT', bindValues: [] },
    ]
    await executeBatch(db, statements)
  })
}

export async function getProductionById(id: string): Promise<Production | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToProduction(rows[0]!) : null
}

export async function getProductionBySlug(slug: string): Promise<Production | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE slug = $1 AND deleted_at IS NULL`,
    [slug]
  )
  return rows.length ? rowToProduction(rows[0]!) : null
}

/**
 * Find an existing user-created demo-template production (created_from_template = 'demo').
 * Used for override confirmation before creating another demo-style project.
 * Does not include the singleton DEMO_SLUG production (that one is never created via template flow).
 */
export async function findExistingDemoTemplateProduction(): Promise<Production | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE created_from_template = 'demo' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    []
  )
  return rows.length ? rowToProduction(rows[0]!) : null
}

/** Set the created_from_template marker (e.g. 'demo' for Demo template). Used after creating a production from a template. */
export async function setProductionCreatedFromTemplate(id: string, value: 'demo' | null): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET created_from_template = $1, updated_at = $2 WHERE id = $3`,
    [value, ts, id]
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ created_from_template: value }))
}

/** Ensure slug is unique; if taken, append -2, -3, etc. */
export async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  const db = await getDb()
  let slug = baseSlug
  let n = 2
  while (true) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM ${TABLE} WHERE slug = $1 AND deleted_at IS NULL`,
      [slug]
    )
    if (rows.length === 0) return slug
    slug = `${baseSlug}-${n}`
    n += 1
  }
}

/** Serialize slug allocation + production INSERT so concurrent create/duplicate don't get the same slug. */
let slugLock: Promise<void> = Promise.resolve()
export async function withSlugLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = slugLock
  let resolve: () => void
  slugLock = new Promise<void>((r) => {
    resolve = r
  })
  try {
    await prev
    return await fn()
  } finally {
    resolve!()
  }
}

/**
 * Allocate a unique slug and INSERT the production row inside a transaction.
 * Caller must run the rest of duplicateProduction and then COMMIT.
 * Used so slug allocation and INSERT are atomic with other create/duplicate operations.
 */
export async function reserveSlugAndInsertProduction(
  db: Awaited<ReturnType<typeof getDb>>,
  params: { id: string; name: string; baseSlug: string; currencyCode: string; notes: string | null; ts: string }
): Promise<string> {
  return withSlugLock(async () => {
    const slug = await ensureUniqueSlug(params.baseSlug)
    await db.execute('BEGIN TRANSACTION')
    await db.execute(
      `INSERT INTO ${TABLE} (id, name, slug, currency_code, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [params.id, params.name, slug, params.currencyCode, params.notes, params.ts, params.ts]
    )
    return slug
  })
}

export type CreateProductionOptions = {
  /** When true, skip default budget categories, accounts, and contingency. Used by Default template which seeds its own chart. */
  skipBudgetSeed?: boolean
  /**
   * When non-empty after trim, inserts production with `is_episodic = 1` and first episode in one transaction.
   */
  episodicInitialEpisodeName?: string
}

export async function createProduction(
  data: Pick<Production, 'name' | 'notes'>,
  options?: CreateProductionOptions
): Promise<Production> {
  const db = await getDb()
  const ts = now()
  const currencyCode = (data as { currency_code?: string }).currency_code ?? 'GBP'
  const skipBudgetSeed = options?.skipBudgetSeed === true
  const rawEpisodic = options?.episodicInitialEpisodeName
  const episodicName = rawEpisodic !== undefined ? rawEpisodic.trim() : ''
  const asEpisodic = rawEpisodic !== undefined && episodicName.length > 0

  if (rawEpisodic !== undefined && episodicName.length === 0) {
    throw new Error('Episodic production requires a non-empty first episode name')
  }

  if (asEpisodic) {
    const id = uuid()
    const episodeId = uuid()
    const slug = await withSlugLock(async () => ensureUniqueSlug(slugify(data.name)))
    await runInSerializedTransaction(async () => {
      const batchDb = await getDb()
      const epStmt = episodeInsertStatement({
        id: episodeId,
        production_id: id,
        name: episodicName,
        sort_order: 0,
        ts,
      })
      await executeBatch(batchDb, [
        { sql: 'BEGIN', bindValues: [] },
        {
          sql: `INSERT INTO ${TABLE} (id, name, slug, currency_code, notes, is_episodic, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
          bindValues: [id, data.name, slug, currencyCode, data.notes ?? null, ts, ts],
        },
        epStmt,
        outboxStatementForRow({
          entity: TABLE,
          entityId: id,
          operation: 'create',
          payloadJson: JSON.stringify({
            ...data,
            slug,
            id,
            is_episodic: 1,
            created_at: ts,
            updated_at: ts,
          }),
        }),
        episodeOutboxCreate(episodeId, {
          id: episodeId,
          production_id: id,
          name: episodicName,
          sort_order: 0,
          created_at: ts,
          updated_at: ts,
        }),
        { sql: 'COMMIT', bindValues: [] },
      ])
    })
    if (!skipBudgetSeed) {
      await seedDefaultBudgetCategories(id)
      await seedDefaultBudgetAccounts(id)
      try {
        const accounts = await listAccounts(id)
        const rootIds = accounts.filter((a) => a.parent_account_id == null).map((a) => a.id)
        if (rootIds.length > 0) {
          await createContingencyRule({
            production_id: id,
            name: 'Contingency',
            rate: 0.1,
            base_kind: 'budget',
            scope_mode: 'include_subtrees',
            scope_account_ids: rootIds,
          })
        }
      } catch {
        // Non-fatal: user can add rules manually.
      }
    }
    return (await getProductionById(id))!
  }

  const id = uuid()
  const { slug } = await withSlugLock(async () => {
    const s = await ensureUniqueSlug(slugify(data.name))
    await db.execute(
      `INSERT INTO ${TABLE} (id, name, slug, currency_code, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, data.name, s, currencyCode, data.notes ?? null, ts, ts]
    )
    return { slug: s }
  })
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, slug, id, created_at: ts, updated_at: ts }))
  if (!skipBudgetSeed) {
    await seedDefaultBudgetCategories(id)
    await seedDefaultBudgetAccounts(id)
    try {
      const accounts = await listAccounts(id)
      const rootIds = accounts.filter((a) => a.parent_account_id == null).map((a) => a.id)
      if (rootIds.length > 0) {
        await createContingencyRule({
          production_id: id,
          name: 'Contingency',
          rate: 0.1,
          base_kind: 'budget',
          scope_mode: 'include_subtrees',
          scope_account_ids: rootIds,
        })
      }
    } catch {
      // Non-fatal: user can add rules manually.
    }
  }
  return (await getProductionById(id))!
}

export async function updateProduction(
  id: string,
  data: Partial<Pick<Production, 'name' | 'notes'>>
): Promise<Production> {
  const existing = await getProductionById(id)
  if (!existing) throw new Error('Production not found')
  const maybeEpisodic = data as Partial<{ is_episodic: boolean }>
  if (existing.is_episodic && maybeEpisodic.is_episodic === false) {
    throw new Error('Episodic mode cannot be disabled once enabled')
  }
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET name = $1, notes = $2, updated_at = $3 WHERE id = $4`,
    [data.name ?? existing.name, data.notes ?? null, ts, id]
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  return (await getProductionById(id))!
}

/** Soft-delete: set deleted_at so the row is hidden from normal queries. */
export async function deleteProduction(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}

/**
 * Hard-delete: remove the production row. With FK ON DELETE CASCADE enabled, all child rows
 * (scenes, shoot_days, people, documents, etc.) are removed by the database.
 * Use only for demo reset or explicit "Delete Production Permanently". Caller is responsible
 * for deleting attachment files from disk (query documents by production_id before calling).
 */
export async function hardDeleteProduction(id: string): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id])
}

/** Duplicate a production and all related data + attachment files. New slug is unique. No outbox writes. */
export { duplicateProduction } from '../duplicateProduction'

/**
 * Permanently delete a production: collect attachment paths, hard-delete the production
 * (cascades remove all child rows), then delete attachment files from disk.
 * Use for "Delete Production Permanently" in the UI.
 */
export async function permanentlyDeleteProduction(id: string): Promise<void> {
  const docs = await listDocumentsByProduction(id)
  const paths = docs
    .map((d) => d.file_path)
    .filter((p): p is string => !!p && p.startsWith(ATTACHMENTS_PREFIX))
  await hardDeleteProduction(id)
  for (const p of paths) {
    try {
      await remove(p, { baseDir: BaseDirectory.AppData })
    } catch {
      // ignore missing files
    }
  }
}
