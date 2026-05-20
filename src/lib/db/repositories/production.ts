import { BaseDirectory, remove } from '@tauri-apps/plugin-fs'
import { getDb, now, uuid, runInSerializedTransaction, executeBatch } from '../client'
import { OptimisticConcurrencyConflictError } from '../concurrency'
import { outboxPush, outboxStatementForRow } from '../outbox'
import { coerceBoolean, coerceIsoString } from '../sqlValueCoercion'
import type { Production } from '../types'
import {
  clientInsertStatement,
  getClientById,
  type CreateClientData,
} from './clients'
import { episodeInsertStatement, episodeOutboxCreate } from './episodes'
import {
  DEFAULT_EPISODIC_SHOOTING_BLOC_NAME,
  defaultEpisodicShootingBlocDateRange,
  shootingBlocInsertStatement,
  shootingBlocOutboxCreate,
} from './shootingBlocs'
import { seedDefaultBudgetCategories } from './budget'
import { listAccounts, seedDefaultBudgetAccounts } from './budgetAccounts'
import { createContingencyRule } from './budgetDerived'
import { listDocumentsByProduction } from './document'
import { projectMembershipInsertStatement } from './projectMemberships'

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
    is_episodic: coerceBoolean(r.is_episodic, false),
    created_at: coerceIsoString(r.created_at),
    updated_at: coerceIsoString(r.updated_at),
    deleted_at: r.deleted_at == null ? null : coerceIsoString(r.deleted_at),
    wrapped_at: r.wrapped_at == null ? null : coerceIsoString(r.wrapped_at),
    archived_at: r.archived_at == null ? null : coerceIsoString(r.archived_at),
    created_from_template: (r.created_from_template as string | null) ?? null,
    client_id: (r.client_id as string | null) ?? null,
    delivery_date: (r.delivery_date as string | null) ?? null,
  }
}

function normalizeDeliveryDate(value: string | null | undefined): string | null {
  const t = value?.trim() ?? ''
  return t.length > 0 ? t : null
}

type ResolvedClientForCreate = {
  clientId: string | null
  preamble: Array<{ sql: string; bindValues: unknown[] }>
}

async function resolveClientForCreate(
  options: Pick<CreateProductionOptions, 'clientId' | 'newClient'> | undefined,
  ts: string
): Promise<ResolvedClientForCreate> {
  const clientId = options?.clientId ?? null
  const newClient = options?.newClient
  if (clientId && newClient) {
    throw new Error('Cannot specify both clientId and newClient when creating a production')
  }
  if (newClient) {
    const name = newClient.name.trim()
    if (!name) throw new Error('Client name is required')
    const id = uuid()
    const email = newClient.email?.trim() ? newClient.email.trim() : null
    const phone = newClient.phone?.trim() ? newClient.phone.trim() : null
    return {
      clientId: id,
      preamble: [clientInsertStatement({ id, name, email, phone, ts })],
    }
  }
  if (clientId) {
    const existing = await getClientById(clientId)
    if (!existing) throw new Error('Selected client not found')
    return { clientId, preamble: [] }
  }
  return { clientId: null, preamble: [] }
}

function productionCreateOutboxPayload(
  data: Pick<Production, 'name' | 'notes'>,
  extras: {
    slug: string
    id: string
    ts: string
    is_episodic?: boolean
    client_id?: string | null
    delivery_date?: string | null
  }
): string {
  return JSON.stringify({
    ...data,
    slug: extras.slug,
    id: extras.id,
    created_at: extras.ts,
    updated_at: extras.ts,
    ...(extras.is_episodic !== undefined ? { is_episodic: extras.is_episodic } : {}),
    client_id: extras.client_id ?? null,
    delivery_date: extras.delivery_date ?? null,
  })
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
  /** Optional: grant creator project administrator membership at create time. */
  creatorUserId?: string
  /** Link to an existing instance-scoped client. */
  clientId?: string | null
  /** Create a new client in the same transaction as the production. */
  newClient?: CreateClientData
  /** Target delivery date (ISO YYYY-MM-DD). */
  deliveryDate?: string | null
}

export async function createProduction(
  data: Pick<Production, 'name' | 'notes'>,
  options?: CreateProductionOptions
): Promise<Production> {
  const ts = now()
  const currencyCode = (data as { currency_code?: string }).currency_code ?? 'GBP'
  const skipBudgetSeed = options?.skipBudgetSeed === true
  const rawEpisodic = options?.episodicInitialEpisodeName
  const creatorUserId = options?.creatorUserId
  const episodicName = rawEpisodic !== undefined ? rawEpisodic.trim() : ''
  const asEpisodic = rawEpisodic !== undefined && episodicName.length > 0

  if (rawEpisodic !== undefined && episodicName.length === 0) {
    throw new Error('Episodic production requires a non-empty first episode name')
  }

  const deliveryDate = normalizeDeliveryDate(options?.deliveryDate)
  const resolvedClient = await resolveClientForCreate(options, ts)

  if (asEpisodic) {
    const id = uuid()
    const episodeId = uuid()
    const blocId = uuid()
    const { start_date, end_date } = defaultEpisodicShootingBlocDateRange()
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
      const blocStmt = shootingBlocInsertStatement({
        id: blocId,
        production_id: id,
        name: DEFAULT_EPISODIC_SHOOTING_BLOC_NAME,
        start_date,
        end_date,
        ts,
      })
      await executeBatch(batchDb, [
        { sql: 'BEGIN', bindValues: [] },
        ...resolvedClient.preamble,
        {
          sql: `INSERT INTO ${TABLE} (id, name, slug, currency_code, notes, client_id, delivery_date, is_episodic, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9)`,
          bindValues: [
            id,
            data.name,
            slug,
            currencyCode,
            data.notes ?? null,
            resolvedClient.clientId,
            deliveryDate,
            ts,
            ts,
          ],
        },
        ...(creatorUserId
          ? [
              projectMembershipInsertStatement({
                id: uuid(),
                productionId: id,
                userId: creatorUserId,
                accessLevel: 'administrator',
                ts,
              }),
            ]
          : []),
        epStmt,
        blocStmt,
        outboxStatementForRow({
          entity: TABLE,
          entityId: id,
          operation: 'create',
          payloadJson: productionCreateOutboxPayload(data, {
            slug,
            id,
            ts,
            is_episodic: true,
            client_id: resolvedClient.clientId,
            delivery_date: deliveryDate,
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
        shootingBlocOutboxCreate(blocId, {
          id: blocId,
          production_id: id,
          name: DEFAULT_EPISODIC_SHOOTING_BLOC_NAME,
          start_date,
          end_date,
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
  await withSlugLock(async () => {
    const s = await ensureUniqueSlug(slugify(data.name))
    await runInSerializedTransaction(async () => {
      const batchDb = await getDb()
      await executeBatch(batchDb, [
        { sql: 'BEGIN', bindValues: [] },
        ...resolvedClient.preamble,
        {
          sql: `INSERT INTO ${TABLE} (id, name, slug, currency_code, notes, client_id, delivery_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          bindValues: [
            id,
            data.name,
            s,
            currencyCode,
            data.notes ?? null,
            resolvedClient.clientId,
            deliveryDate,
            ts,
            ts,
          ],
        },
        ...(creatorUserId
          ? [
              projectMembershipInsertStatement({
                id: uuid(),
                productionId: id,
                userId: creatorUserId,
                accessLevel: 'administrator',
                ts,
              }),
            ]
          : []),
        outboxStatementForRow({
          entity: TABLE,
          entityId: id,
          operation: 'create',
          payloadJson: productionCreateOutboxPayload(data, {
            slug: s,
            id,
            ts,
            client_id: resolvedClient.clientId,
            delivery_date: deliveryDate,
          }),
        }),
        { sql: 'COMMIT', bindValues: [] },
      ])
    })
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

export type UpdateProductionData = Partial<Pick<Production, 'name' | 'notes'>> & {
  clientId?: string | null
  newClient?: CreateClientData
  deliveryDate?: string | null
}

export async function updateProduction(
  id: string,
  data: UpdateProductionData,
  options?: { expectedUpdatedAt?: string }
): Promise<Production> {
  const existing = await getProductionById(id)
  if (!existing) throw new Error('Production not found')
  const maybeEpisodic = data as Partial<{ is_episodic: boolean }>
  if (existing.is_episodic && maybeEpisodic.is_episodic === false) {
    throw new Error('Episodic mode cannot be disabled once enabled')
  }

  const name = data.name ?? existing.name
  const notes = data.notes !== undefined ? data.notes : existing.notes
  const deliveryDate =
    data.deliveryDate !== undefined ? normalizeDeliveryDate(data.deliveryDate) : existing.delivery_date

  const ts = now()
  const resolvedClient =
    data.clientId !== undefined || data.newClient !== undefined
      ? await resolveClientForCreate(
          { clientId: data.clientId ?? null, newClient: data.newClient },
          ts
        )
      : { clientId: existing.client_id, preamble: [] as Array<{ sql: string; bindValues: unknown[] }> }

  const clientId = resolvedClient.clientId

  const outboxPayload = {
    name,
    notes,
    client_id: clientId,
    delivery_date: deliveryDate,
  }

  if (resolvedClient.preamble.length > 0) {
    await runInSerializedTransaction(async () => {
      const batchDb = await getDb()
      const statements: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN', bindValues: [] },
        ...resolvedClient.preamble,
        {
          sql: `UPDATE ${TABLE} SET name = $1, notes = $2, client_id = $3, delivery_date = $4, updated_at = $5 WHERE id = $6${
            options?.expectedUpdatedAt ? ' AND updated_at = $7' : ''
          }`,
          bindValues: options?.expectedUpdatedAt
            ? [name, notes, clientId, deliveryDate, ts, id, options.expectedUpdatedAt]
            : [name, notes, clientId, deliveryDate, ts, id],
        },
        outboxStatementForRow({
          entity: TABLE,
          entityId: id,
          operation: 'update',
          payloadJson: JSON.stringify(outboxPayload),
        }),
        { sql: 'COMMIT', bindValues: [] },
      ]
      await executeBatch(batchDb, statements)
    })
    const updated = await getProductionById(id)
    if (!updated) throw new Error('Production not found')
    return updated
  }

  const db = await getDb()
  const bindValues: unknown[] = [name, notes, clientId, deliveryDate, ts, id]
  let sql = `UPDATE ${TABLE} SET name = $1, notes = $2, client_id = $3, delivery_date = $4, updated_at = $5 WHERE id = $6`
  if (options?.expectedUpdatedAt) {
    sql += ' AND updated_at = $7'
    bindValues.push(options.expectedUpdatedAt)
  }
  const result = await db.execute(sql, bindValues)
  if ((result?.rowsAffected ?? 0) === 0 && options?.expectedUpdatedAt) {
    throw new OptimisticConcurrencyConflictError({
      entity: TABLE,
      entityId: id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    })
  }
  await outboxPush(TABLE, id, 'update', JSON.stringify(outboxPayload))
  return (await getProductionById(id))!
}

/**
 * Minimal local production row used when opening a project from the server (same UUID as remote).
 * Does not write to the outbox. Chart of accounts is not seeded — linked mode reads budget from API.
 */
export async function insertShellProductionWithId(args: { id: string; name: string }): Promise<Production> {
  const db = await getDb()
  const ts = now()
  const slug = await withSlugLock(async () => ensureUniqueSlug(slugify(args.name)))
  await db.execute(
    `INSERT INTO ${TABLE} (id, name, slug, currency_code, notes, is_episodic, created_at, updated_at)
     VALUES ($1, $2, $3, 'GBP', NULL, 0, $4, $5)`,
    [args.id, args.name, slug, ts, ts],
  )
  return (await getProductionById(args.id))!
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
