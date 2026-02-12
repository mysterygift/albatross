import { BaseDirectory, remove } from '@tauri-apps/plugin-fs'
import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Production } from '../types'
import { seedDefaultBudgetCategories } from './budget'
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
  return {
    id: r.id as string,
    name: r.name as string,
    slug: (r.slug as string) ?? `prod-${r.id as string}`,
    currency_code: (r.currency_code as string) ?? 'GBP',
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listProductions(): Promise<Production[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE deleted_at IS NULL ORDER BY name`
  )
  return rows.map(rowToProduction)
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
async function withSlugLock<T>(fn: () => Promise<T>): Promise<T> {
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

export async function createProduction(
  data: Pick<Production, 'name' | 'notes'>
): Promise<Production> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const currencyCode = (data as { currency_code?: string }).currency_code ?? 'GBP'
  const { slug } = await withSlugLock(async () => {
    const s = await ensureUniqueSlug(slugify(data.name))
    await db.execute(
      `INSERT INTO ${TABLE} (id, name, slug, currency_code, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, data.name, s, currencyCode, data.notes ?? null, ts, ts]
    )
    return { slug: s }
  })
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, slug, id, created_at: ts, updated_at: ts }))
  await seedDefaultBudgetCategories(id)
  return (await getProductionById(id))!
}

export async function updateProduction(
  id: string,
  data: Partial<Pick<Production, 'name' | 'notes'>>
): Promise<Production> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET name = $1, notes = $2, updated_at = $3 WHERE id = $4`,
    [data.name ?? (await getProductionById(id))!.name, data.notes ?? null, ts, id]
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
