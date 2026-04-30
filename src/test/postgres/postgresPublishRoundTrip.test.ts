import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import initSqlJs, { type Database } from 'sql.js'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { setDbAdapterForTests } from '@/lib/db/client'
import { runEpisodicFullSeed } from '@/lib/db/seed/demoProductionSeed'
import { EPISODIC_DEMO_IDS } from '@/lib/db/seed/constants'
import { getProductionById } from '@/lib/db/repositories/production'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import { listScenesByProduction, listShotsByProduction, listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listCast, listCrew } from '@/lib/db/repositories/person'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listDocumentsByProduction } from '@/lib/db/repositories/document'
import { listStoryboardImagesByProduction, getStoryboardBundleForShotList } from '@/lib/db/repositories/storyboard'
import { listBudgetItemsByProduction, listExpensesByProduction } from '@/lib/db/repositories/budget'
import { listBudgetRevisionsByProduction } from '@/lib/db/repositories/budgetRevisions'
import { listEquipmentByProduction } from '@/lib/db/repositories/equipment'
import { listVendors } from '@/lib/db/repositories/vendors'
import { listVendorInvoicesByProduction } from '@/lib/db/repositories/vendorInvoices'
import { listVendorPurchaseOrdersByProduction } from '@/lib/db/repositories/vendorPurchaseOrders'
import { listTasksByProduction } from '@/lib/db/repositories/tasks'
import { listDeliverablesByProduction } from '@/lib/db/repositories/deliverable'
import { listMusicTracksByProduction, listClearancesByProduction } from '@/lib/db/repositories/music-clearance'
import { exportProductionForPostgresPublish } from '@/lib/publish/exportPublishPackage'
import {
  CURRENT_PUBLISH_FORMAT_VERSION,
  PUBLISH_DATA_ENTRY_PATH,
  PUBLISH_PACKAGE_KIND,
} from '@/lib/publish/constants'
import { importPublishPackageFileToPostgres } from '@/lib/publish/service'
import { buildPublishPackageBytes, parsePublishPackageBytes } from '@/lib/publish/packageCodec'
import { PUBLISH_TABLE_ORDER } from '@/lib/publish/tableOrder'
import { createPostgresRepoHarness } from '@/test/postgres/postgresRepositoryHarness'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'

const fsCtx = { appDataRoot: '' }

vi.mock('@tauri-apps/plugin-fs', async () => {
  const APP = 1
  const pathMod = await import('node:path')
  const fs = await import('node:fs/promises')
  return {
    BaseDirectory: { AppData: APP },
    readFile: async (p: string, opts?: { baseDir?: number }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      return new Uint8Array(await fs.readFile(full))
    },
    writeFile: async (p: string, data: Uint8Array, opts?: { baseDir?: number }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      await fs.mkdir(pathMod.dirname(full), { recursive: true })
      await fs.writeFile(full, data)
    },
    writeTextFile: async (p: string, text: string, opts?: { baseDir?: number }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      await fs.mkdir(pathMod.dirname(full), { recursive: true })
      await fs.writeFile(full, text, 'utf8')
    },
    mkdir: async (p: string, opts?: { baseDir?: number; recursive?: boolean }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      await fs.mkdir(full, { recursive: opts?.recursive ?? false })
    },
    remove: async (p: string, opts?: { baseDir?: number }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      await fs.rm(full, { force: true, recursive: true })
    },
    copyFile: async (fromPath: string, toPath: string, opts?: { toPathBaseDir?: number }) => {
      const fullTo = opts?.toPathBaseDir === APP ? pathMod.join(fsCtx.appDataRoot, toPath) : toPath
      await fs.mkdir(pathMod.dirname(fullTo), { recursive: true })
      await fs.copyFile(fromPath, fullTo)
    },
  }
})

async function createSqliteAdapter(db: Database): Promise<DatabaseAdapter> {
  const { createSqlJsTauriAdapter } = await import('@/test/apf/sqlJsTauriAdapter')
  const raw = createSqlJsTauriAdapter(db)
  return {
    dialect: 'sqlite',
    execute: async (sql: string, bindValues?: unknown[]) => {
      await raw.execute(sql, bindValues)
      return { rowsAffected: 0, lastInsertId: 0 }
    },
    select: raw.select,
    executeBatch: async (statements) => {
      let open = false
      try {
        for (const s of statements) {
          const upper = s.sql.trim().toUpperCase()
          if (upper.startsWith('BEGIN')) open = true
          await raw.execute(s.sql, s.bindValues)
          if (upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) open = false
        }
      } catch (error) {
        if (open) {
          await raw.execute('ROLLBACK', [])
        }
        throw error
      }
    },
    runInSerializedTransaction: async (fn) => fn(),
  }
}

async function ensureImportUserExists(adapter: DatabaseAdapter, userId: string): Promise<void> {
  await adapter.execute(
    `INSERT INTO users (id, username, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (id) DO NOTHING`,
    [userId, `importer-${userId.slice(0, 8)}`, '$argon2id$v=19$m=4096,t=3,p=1$abc$def']
  )
}

describe('sqlite -> postgres publish package', () => {
  let workDir = ''
  let connectionError: string | null = null
  let sqlDb: Database | null = null

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'albatross-publish-'))
    fsCtx.appDataRoot = join(workDir, 'appdata')
    await mkdir(fsCtx.appDataRoot, { recursive: true })
    const client = new Client(await resolvePostgresTestConfig())
    try {
      await client.connect()
    } catch (error) {
      connectionError = error instanceof Error ? error.message : String(error)
    } finally {
      await client.end().catch(() => undefined)
    }
  })

  beforeEach(async () => {
    const SQL = await initSqlJs({})
    sqlDb = new SQL.Database()
    applyAlbatrossMigrationsSqlJs(sqlDb)
    const sqliteAdapter = await createSqliteAdapter(sqlDb)
    setDbAdapterForTests(sqliteAdapter)
  })

  afterEach(async () => {
    setDbAdapterForTests(null)
    sqlDb?.close()
    sqlDb = null
    await rm(fsCtx.appDataRoot, { recursive: true, force: true })
    await mkdir(fsCtx.appDataRoot, { recursive: true })
  })

  afterAll(async () => {
    setDbAdapterForTests(null)
    await rm(workDir, { recursive: true, force: true })
  })

  it('exports portable package with tables and assets', async () => {
    if (!sqlDb) throw new Error('sql db missing')
    const ts = '2026-01-01T00:00:00.000Z'
    const productionId = 'aaaaaaaa-0000-4000-8000-000000000001'
    await sqlDb.exec(`
      INSERT INTO productions (id, name, slug, currency_code, is_episodic, created_at, updated_at)
      VALUES ('${productionId}', 'Publish Fixture', 'publish-fixture', 'GBP', 1, '${ts}', '${ts}');
      INSERT INTO episodes (id, production_id, name, sort_order, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000002', '${productionId}', 'Episode 1', 0, '${ts}', '${ts}');
      INSERT INTO scenes (id, production_id, scene_number, episode_id, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000003', '${productionId}', '1', 'aaaaaaaa-0000-4000-8000-000000000002', '${ts}', '${ts}');
      INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000003', '1', '${ts}', '${ts}');
      INSERT INTO documents (id, production_id, file_name, file_path, mime_type, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000005', '${productionId}', 'spec.pdf', 'attachments/spec.pdf', 'application/pdf', '${ts}', '${ts}');
      INSERT INTO storyboard_images (id, production_id, scene_id, shot_id, storage_key, original_filename, mime_type, sort_order, source_type, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000006', '${productionId}', 'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000004', 'storyboards/fixture.png', 'fixture.png', 'image/png', 0, 'manual', '${ts}', '${ts}');
    `)
    await mkdir(join(fsCtx.appDataRoot, 'attachments'), { recursive: true })
    await mkdir(join(fsCtx.appDataRoot, 'storyboards'), { recursive: true })
    await writeFile(join(fsCtx.appDataRoot, 'attachments/spec.pdf'), Buffer.from('%PDF publish fixture'))
    await writeFile(join(fsCtx.appDataRoot, 'storyboards/fixture.png'), Buffer.from('PNGDATA'))

    const packagePath = join(workDir, 'fixture.publish.zip')
    const result = await exportProductionForPostgresPublish(productionId, packagePath)
    expect(result.assetCount).toBe(2)
    expect(existsSync(packagePath)).toBe(true)
    const bytes = new Uint8Array(await readFile(packagePath))
    const parsed = parsePublishPackageBytes(bytes)
    expect(parsed.manifest.kind).toBe(PUBLISH_PACKAGE_KIND)
    expect(parsed.manifest.formatVersion).toBe(CURRENT_PUBLISH_FORMAT_VERSION)
    expect(parsed.manifest.data.entryPath).toBe(PUBLISH_DATA_ENTRY_PATH)
    expect(parsed.manifest.source.database).toBe('sqlite')
    expect(parsed.dataFile.tableOrder).toEqual(PUBLISH_TABLE_ORDER as unknown as string[])
    expect(parsed.manifest.production.id).toBe(productionId)
    expect(parsed.manifest.assets.entries).toHaveLength(2)
    expect(parsed.dataFile.tables.storyboard_images).toHaveLength(1)
    expect(parsed.dataFile.tables.budget_revisions).toBeDefined()
    for (const entry of parsed.manifest.assets.entries) {
      const bundled = parsed.fileIndex.get(entry.archivePath)
      expect(bundled).toBeDefined()
      const hash = createHash('sha256').update(bundled!).digest('hex')
      expect(hash).toBe(entry.sha256)
      expect(bundled!.byteLength).toBe(entry.sizeBytes)
    }

    const secondPath = join(workDir, 'fixture-second.publish.zip')
    await exportProductionForPostgresPublish(productionId, secondPath)
    const parsedSecond = parsePublishPackageBytes(new Uint8Array(await readFile(secondPath)))
    expect(parsedSecond.dataFile.tableOrder).toEqual(parsed.dataFile.tableOrder)
    expect(parsedSecond.manifest.data.tableOrder).toEqual(parsed.manifest.data.tableOrder)
    expect(parsedSecond.manifest.assets.entries.map((e) => e.archivePath)).toEqual(
      parsed.manifest.assets.entries.map((e) => e.archivePath)
    )
  })

  it('fails export when a referenced publish asset is missing', async () => {
    if (!sqlDb) throw new Error('sql db missing')
    const ts = '2026-01-01T00:00:00.000Z'
    const productionId = 'aaaaaaaa-0000-4000-8000-000000000011'
    await sqlDb.exec(`
      INSERT INTO productions (id, name, slug, currency_code, is_episodic, created_at, updated_at)
      VALUES ('${productionId}', 'Missing Asset Fixture', 'missing-asset-fixture', 'GBP', 1, '${ts}', '${ts}');
      INSERT INTO episodes (id, production_id, name, sort_order, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000012', '${productionId}', 'Episode 1', 0, '${ts}', '${ts}');
      INSERT INTO scenes (id, production_id, scene_number, episode_id, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000013', '${productionId}', '1', 'aaaaaaaa-0000-4000-8000-000000000012', '${ts}', '${ts}');
      INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000014', 'aaaaaaaa-0000-4000-8000-000000000013', '1', '${ts}', '${ts}');
      INSERT INTO documents (id, production_id, file_name, file_path, mime_type, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000015', '${productionId}', 'missing.pdf', 'attachments/missing.pdf', 'application/pdf', '${ts}', '${ts}');
    `)
    const packagePath = join(workDir, 'missing.publish.zip')
    await expect(exportProductionForPostgresPublish(productionId, packagePath)).rejects.toThrow(
      /Missing referenced publish assets/
    )
  })

  it('imports using explicit UUID/BOOLEAN/NUMERIC/DATE/TIMESTAMPTZ/JSONB conversion rules', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL publish integration assertions: ${connectionError}`)
      return
    }
    if (!sqlDb) throw new Error('sql db missing')
    const ts = '2026-01-03T12:34:56.000Z'
    const productionId = 'aaaaaaaa-0000-4000-8000-000000000201'
    const vendorId = 'aaaaaaaa-0000-4000-8000-000000000202'
    const poId = 'aaaaaaaa-0000-4000-8000-000000000203'
    const invoiceId = 'aaaaaaaa-0000-4000-8000-000000000204'
    const sceneId = 'aaaaaaaa-0000-4000-8000-000000000205'
    const shotId = 'aaaaaaaa-0000-4000-8000-000000000206'
    const importId = 'aaaaaaaa-0000-4000-8000-000000000207'
    const storyboardId = 'aaaaaaaa-0000-4000-8000-000000000208'
    await sqlDb.exec(`
      INSERT INTO productions (id, name, slug, currency_code, is_episodic, created_at, updated_at)
      VALUES ('${productionId}', 'Type Fixture', 'type-fixture', 'GBP', 1, '${ts}', '${ts}');
      INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at)
      VALUES ('${sceneId}', '${productionId}', '1', '${ts}', '${ts}');
      INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at)
      VALUES ('${shotId}', '${sceneId}', '1', '${ts}', '${ts}');
      INSERT INTO vendors (id, production_id, company_name, created_at, updated_at)
      VALUES ('${vendorId}', '${productionId}', 'Type Vendor', '${ts}', '${ts}');
      INSERT INTO vendor_purchase_orders (id, production_id, vendor_id, po_number, issue_date, amount, status, approval, created_at, updated_at)
      VALUES ('${poId}', '${productionId}', '${vendorId}', 'PO-TYPE', '2026-01-05', 1234.56, 'issued', 1, '${ts}', '${ts}');
      INSERT INTO vendor_invoices (id, production_id, vendor_id, po_id, invoice_number, issue_date, due_date, amount, tax, status, created_at, updated_at)
      VALUES ('${invoiceId}', '${productionId}', '${vendorId}', '${poId}', 'INV-TYPE', '2026-01-06', '2026-01-10', 789.01, 12.34, 'approved', '${ts}', '${ts}');
      INSERT INTO storyboard_imports (id, production_id, scene_id, source_filename, source_type, status, metadata_json, created_at, updated_at)
      VALUES ('${importId}', '${productionId}', '${sceneId}', 'athena.pdf', 'athena_pdf_import', 'completed', '{"pages":3,"source":"athena"}', '${ts}', '${ts}');
      INSERT INTO storyboard_images (id, production_id, scene_id, shot_id, storage_key, original_filename, mime_type, sort_order, source_type, source_import_id, created_at, updated_at)
      VALUES ('${storyboardId}', '${productionId}', '${sceneId}', '${shotId}', 'storyboards/type.png', 'type.png', 'image/png', 0, 'athena_pdf_import', '${importId}', '${ts}', '${ts}');
    `)
    await mkdir(join(fsCtx.appDataRoot, 'storyboards'), { recursive: true })
    await writeFile(join(fsCtx.appDataRoot, 'storyboards/type.png'), Buffer.from('PNGDATA'))

    const packagePath = join(workDir, 'types.publish.zip')
    await exportProductionForPostgresPublish(productionId, packagePath)

    const harness = await createPostgresRepoHarness('pg_publish_types')
    try {
      await ensureImportUserExists(harness.adapter, 'user-1')
      await importPublishPackageFileToPostgres({
        packagePath,
        postgresAdapter: harness.adapter,
        serverAssetRoot: join(workDir, 'server-assets-types'),
        importingUserId: 'user-1',
        authenticatedUserId: 'user-1',
      })

      const prodType = await harness.adapter.select<Array<{ t: string; v: boolean }>>(
        `SELECT pg_typeof(is_episodic)::text AS t, is_episodic AS v
         FROM productions WHERE id = $1`,
        [productionId]
      )
      expect(prodType[0]!.t).toBe('boolean')
      expect(prodType[0]!.v).toBe(true)

      const poTypes = await harness.adapter.select<Array<{ t: string; v: boolean; amount: string }>>(
        `SELECT pg_typeof(approval)::text AS t, approval AS v, amount::text AS amount
         FROM vendor_purchase_orders WHERE id = $1`,
        [poId]
      )
      expect(poTypes[0]!.t).toBe('boolean')
      expect(poTypes[0]!.v).toBe(true)
      expect(poTypes[0]!.amount).toBe('1234.56')

      const invoiceTypes = await harness.adapter.select<Array<{ issue_t: string; due_t: string; amount: string }>>(
        `SELECT pg_typeof(issue_date)::text AS issue_t, pg_typeof(due_date)::text AS due_t, amount::text AS amount
         FROM vendor_invoices WHERE id = $1`,
        [invoiceId]
      )
      expect(invoiceTypes[0]!.issue_t).toBe('date')
      expect(invoiceTypes[0]!.due_t).toBe('date')
      expect(invoiceTypes[0]!.amount).toBe('789.01')

      const tsTypes = await harness.adapter.select<Array<{ created_t: string; updated_t: string }>>(
        `SELECT pg_typeof(created_at)::text AS created_t, pg_typeof(updated_at)::text AS updated_t
         FROM productions WHERE id = $1`,
        [productionId]
      )
      expect(tsTypes[0]!.created_t).toBe('timestamp with time zone')
      expect(tsTypes[0]!.updated_t).toBe('timestamp with time zone')

      const jsonTypes = await harness.adapter.select<Array<{ t: string; pages: string }>>(
        `SELECT pg_typeof(metadata_json)::text AS t, metadata_json->>'pages' AS pages
         FROM storyboard_imports WHERE id = $1`,
        [importId]
      )
      expect(jsonTypes[0]!.t).toBe('jsonb')
      expect(jsonTypes[0]!.pages).toBe('3')
    } finally {
      await harness.close()
    }
  }, 120_000)

  it('imports North Shore publish package into PostgreSQL with server asset paths', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL publish integration assertions: ${connectionError}`)
      return
    }
    await runEpisodicFullSeed()
    const productionId = EPISODIC_DEMO_IDS.production
    const packagePath = join(workDir, 'north-shore.publish.zip')
    await exportProductionForPostgresPublish(productionId, packagePath)

    const harness = await createPostgresRepoHarness('pg_publish_north_shore')
    const serverRoot = join(workDir, 'server-assets')
    let aclAssigned: { productionId: string; userId: string } | null = null
    try {
      await ensureImportUserExists(harness.adapter, 'user-1')
      const imported = await importPublishPackageFileToPostgres({
        packagePath,
        postgresAdapter: harness.adapter,
        serverAssetRoot: serverRoot,
        importingUserId: 'user-1',
        authenticatedUserId: 'user-1',
        onAssignAdministrator: async (args) => {
          aclAssigned = args
        },
      })
      expect(imported.productionId).toBe(productionId)
      expect(imported.assetsImported).toBeGreaterThan(0)
      expect(aclAssigned).toEqual({ productionId, userId: 'user-1' })

      const prodRows = await harness.adapter.select<Array<{ id: string; is_episodic: boolean }>>(
        'SELECT id, is_episodic FROM productions WHERE id = $1',
        [productionId]
      )
      expect(prodRows).toHaveLength(1)
      expect(prodRows[0]!.is_episodic).toBe(true)

      const [episodes, scenes, shots, budgetRevisions] = await Promise.all([
        harness.adapter.select<Array<{ n: number }>>(
          'SELECT COUNT(*)::int AS n FROM episodes WHERE production_id = $1',
          [productionId]
        ),
        harness.adapter.select<Array<{ n: number }>>(
          'SELECT COUNT(*)::int AS n FROM scenes WHERE production_id = $1',
          [productionId]
        ),
        harness.adapter.select<Array<{ n: number }>>(
          `SELECT COUNT(*)::int AS n
           FROM shots sh INNER JOIN scenes sc ON sc.id = sh.scene_id
           WHERE sc.production_id = $1`,
          [productionId]
        ),
        harness.adapter.select<Array<{ n: number }>>(
          'SELECT COUNT(*)::int AS n FROM budget_revisions WHERE production_id = $1',
          [productionId]
        ),
      ])
      expect(episodes[0]!.n).toBeGreaterThanOrEqual(3)
      expect(scenes[0]!.n).toBeGreaterThanOrEqual(30)
      expect(shots[0]!.n).toBeGreaterThanOrEqual(200)
      expect(budgetRevisions[0]!.n).toBeGreaterThanOrEqual(1)

      const [shootDays, shootDayUnits, strips] = await Promise.all([
        harness.adapter.select<Array<{ n: number }>>(
          'SELECT COUNT(*)::int AS n FROM shoot_days WHERE production_id = $1',
          [productionId]
        ),
        harness.adapter.select<Array<{ n: number }>>(
          `SELECT COUNT(*)::int AS n
           FROM shoot_day_units sdu
           INNER JOIN shoot_days sd ON sd.id = sdu.shoot_day_id
           WHERE sd.production_id = $1`,
          [productionId]
        ),
        harness.adapter.select<Array<{ n: number }>>(
          'SELECT COUNT(*)::int AS n FROM stripboard_strips WHERE production_id = $1',
          [productionId]
        ),
      ])
      expect(shootDays[0]!.n).toBeGreaterThan(0)
      expect(shootDayUnits[0]!.n).toBeGreaterThan(0)
      expect(strips[0]!.n).toBeGreaterThan(0)

      const [sceneEpisodeParity, stripSceneParity] = await Promise.all([
        harness.adapter.select<Array<{ bad: number }>>(
          `SELECT COUNT(*)::int AS bad
           FROM scenes sc
           LEFT JOIN episodes ep ON ep.id = sc.episode_id
           WHERE sc.production_id = $1
             AND sc.deleted_at IS NULL
             AND (sc.episode_id IS NULL OR ep.id IS NULL)`,
          [productionId]
        ),
        harness.adapter.select<Array<{ bad: number }>>(
          `SELECT COUNT(*)::int AS bad
           FROM stripboard_strips st
           LEFT JOIN scenes sc ON sc.id = st.scene_id
           WHERE st.production_id = $1
             AND st.deleted_at IS NULL
             AND st.scene_id IS NOT NULL
             AND (sc.id IS NULL OR sc.production_id <> $1)`,
          [productionId]
        ),
      ])
      expect(sceneEpisodeParity[0]!.bad).toBe(0)
      expect(stripSceneParity[0]!.bad).toBe(0)

      const docRows = await harness.adapter.select<Array<{ file_path: string }>>(
        'SELECT file_path FROM documents WHERE production_id = $1 ORDER BY id LIMIT 5',
        [productionId]
      )
      expect(docRows.length).toBeGreaterThan(0)
      for (const row of docRows) {
        expect(row.file_path.startsWith('server-assets/productions/')).toBe(true)
        expect(row.file_path.startsWith('attachments/')).toBe(false)
      }
      const storyboardRows = await harness.adapter.select<Array<{ storage_key: string }>>(
        'SELECT storage_key FROM storyboard_images WHERE production_id = $1 ORDER BY id LIMIT 5',
        [productionId]
      )
      expect(storyboardRows.length).toBeGreaterThan(0)
      for (const row of storyboardRows) {
        expect(row.storage_key.startsWith('server-assets/productions/')).toBe(true)
        expect(row.storage_key.startsWith('storyboards/')).toBe(false)
      }
      const firstServerAsset = join(serverRoot, docRows[0]!.file_path)
      expect(existsSync(firstServerAsset)).toBe(true)

      setDbAdapterForTests(harness.adapter)
      const importedProduction = await getProductionById(productionId)
      expect(importedProduction).not.toBeNull()
      expect(importedProduction?.name).toContain('North Shore')
      expect(importedProduction?.is_episodic).toBe(true)

      const episodesViaRepo = await listEpisodesByProduction(productionId)
      expect(episodesViaRepo.length).toBeGreaterThan(0)
      const shootDaysViaRepo = await listShootDaysByProduction(productionId)
      expect(shootDaysViaRepo.length).toBeGreaterThan(0)
      for (const day of shootDaysViaRepo) {
        if (!day.shooting_bloc_id) continue
        const blocExists = await harness.adapter.select<Array<{ n: number }>>(
          'SELECT COUNT(*)::int AS n FROM shooting_blocs WHERE id = $1 AND production_id = $2',
          [day.shooting_bloc_id, productionId]
        )
        expect(blocExists[0]!.n).toBe(1)
      }

      const scenesViaRepo = await listScenesByProduction(productionId)
      const shotsViaRepo = await listShotsByProduction(productionId)
      expect(scenesViaRepo.length).toBeGreaterThan(0)
      expect(shotsViaRepo.length).toBeGreaterThan(0)
      for (const scene of scenesViaRepo) {
        if (!scene.episode_id) continue
        expect(episodesViaRepo.some((ep) => ep.id === scene.episode_id)).toBe(true)
      }
      const sceneIds = new Set(scenesViaRepo.map((s) => s.id))
      for (const shot of shotsViaRepo) {
        expect(sceneIds.has(shot.scene_id)).toBe(true)
      }

      const [castRows, crewRows, locationRows, docsViaRepo, storyboardRowsViaRepo] = await Promise.all([
        listCast(productionId),
        listCrew(productionId),
        listLocationsByProduction(productionId),
        listDocumentsByProduction(productionId),
        listStoryboardImagesByProduction(productionId),
      ])
      expect(castRows.length + crewRows.length).toBeGreaterThan(0)
      expect(locationRows.length).toBeGreaterThan(0)
      expect(docsViaRepo.length).toBeGreaterThan(0)
      expect(storyboardRowsViaRepo.length).toBeGreaterThan(0)
      for (const d of docsViaRepo) {
        expect(d.file_path.startsWith('server-assets/productions/')).toBe(true)
      }
      const shotIdSet = new Set(shotsViaRepo.map((s) => s.id))
      for (const img of storyboardRowsViaRepo) {
        expect(img.storage_key.startsWith('server-assets/productions/')).toBe(true)
        expect(shotIdSet.has(img.shot_id)).toBe(true)
      }
      const storyboardBundle = await getStoryboardBundleForShotList(productionId)
      expect(storyboardBundle.length).toBeGreaterThan(0)

      const [budgetRevisionsViaRepo, budgetItemsViaRepo, expensesViaRepo] = await Promise.all([
        listBudgetRevisionsByProduction(productionId),
        listBudgetItemsByProduction(productionId),
        listExpensesByProduction(productionId),
      ])
      expect(budgetRevisionsViaRepo.length).toBeGreaterThan(0)
      expect(budgetItemsViaRepo.length).toBeGreaterThan(0)
      expect(expensesViaRepo.length).toBeGreaterThan(0)
      for (const item of budgetItemsViaRepo) {
        if (item.budget_revision_id == null) continue
        expect(budgetRevisionsViaRepo.some((rev) => rev.id === item.budget_revision_id)).toBe(true)
      }

      const [equipmentViaRepo, vendorsViaRepo, tasksViaRepo, deliverablesViaRepo, musicViaRepo, clearancesViaRepo] =
        await Promise.all([
          listEquipmentByProduction(productionId),
          listVendors(productionId),
          listTasksByProduction(productionId),
          listDeliverablesByProduction(productionId),
          listMusicTracksByProduction(productionId),
          listClearancesByProduction(productionId),
        ])
      expect(equipmentViaRepo.length).toBeGreaterThan(0)
      expect(vendorsViaRepo.length).toBeGreaterThan(0)
      expect(tasksViaRepo.length).toBeGreaterThan(0)
      expect(deliverablesViaRepo.length).toBeGreaterThan(0)
      expect(musicViaRepo.length).toBeGreaterThan(0)
      expect(clearancesViaRepo.length).toBeGreaterThan(0)
      for (const d of deliverablesViaRepo) {
        if (d.episode_id == null) continue
        expect(episodesViaRepo.some((ep) => ep.id === d.episode_id)).toBe(true)
      }
      for (const track of musicViaRepo) {
        if (track.episode_id == null) continue
        expect(episodesViaRepo.some((ep) => ep.id === track.episode_id)).toBe(true)
      }

      const [invoiceRows, poRows] = await Promise.all([
        listVendorInvoicesByProduction(productionId),
        listVendorPurchaseOrdersByProduction(productionId),
      ])
      expect(invoiceRows.length + poRows.length).toBeGreaterThan(0)
    } finally {
      setDbAdapterForTests(null)
      await harness.close()
    }
  }, 120_000)

  it('rejects missing-asset packages and cleans up written server files/rows', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL publish integration assertions: ${connectionError}`)
      return
    }
    if (!sqlDb) throw new Error('sql db missing')
    const ts = '2026-01-01T00:00:00.000Z'
    const productionId = 'aaaaaaaa-0000-4000-8000-000000000101'
    await sqlDb.exec(`
      INSERT INTO productions (id, name, slug, currency_code, is_episodic, created_at, updated_at)
      VALUES ('${productionId}', 'Corrupt Publish Fixture', 'corrupt-publish-fixture', 'GBP', 1, '${ts}', '${ts}');
      INSERT INTO episodes (id, production_id, name, sort_order, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000102', '${productionId}', 'Episode 1', 0, '${ts}', '${ts}');
      INSERT INTO scenes (id, production_id, scene_number, episode_id, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000103', '${productionId}', '1', 'aaaaaaaa-0000-4000-8000-000000000102', '${ts}', '${ts}');
      INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000104', 'aaaaaaaa-0000-4000-8000-000000000103', '1', '${ts}', '${ts}');
      INSERT INTO documents (id, production_id, file_name, file_path, mime_type, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000105', '${productionId}', 'spec.pdf', 'attachments/spec.pdf', 'application/pdf', '${ts}', '${ts}');
      INSERT INTO storyboard_images (id, production_id, scene_id, shot_id, storage_key, original_filename, mime_type, sort_order, source_type, created_at, updated_at)
      VALUES ('aaaaaaaa-0000-4000-8000-000000000106', '${productionId}', 'aaaaaaaa-0000-4000-8000-000000000103', 'aaaaaaaa-0000-4000-8000-000000000104', 'storyboards/fixture.png', 'fixture.png', 'image/png', 0, 'manual', '${ts}', '${ts}');
    `)
    await mkdir(join(fsCtx.appDataRoot, 'attachments'), { recursive: true })
    await mkdir(join(fsCtx.appDataRoot, 'storyboards'), { recursive: true })
    await writeFile(join(fsCtx.appDataRoot, 'attachments/spec.pdf'), Buffer.from('%PDF publish fixture'))
    await writeFile(join(fsCtx.appDataRoot, 'storyboards/fixture.png'), Buffer.from('PNGDATA'))

    const validPackagePath = join(workDir, 'corrupt-source.publish.zip')
    await exportProductionForPostgresPublish(productionId, validPackagePath)
    const parsed = parsePublishPackageBytes(new Uint8Array(await readFile(validPackagePath)))
    const missingArchivePath = parsed.manifest.assets.entries[0]!.archivePath
    const files = Array.from(parsed.fileIndex.entries())
      .filter(([path]) => path !== missingArchivePath && path.startsWith('files/assets/'))
      .map(([archivePath, bytes]) => ({ archivePath, bytes }))
    const corrupted = buildPublishPackageBytes({
      manifest: parsed.manifest,
      dataFile: parsed.dataFile,
      files,
    })
    const corruptedPath = join(workDir, 'corrupt-missing-asset.publish.zip')
    await writeFile(corruptedPath, Buffer.from(corrupted))

    const harness = await createPostgresRepoHarness('pg_publish_cleanup')
    const serverRoot = join(workDir, 'server-assets-cleanup')
    try {
      await ensureImportUserExists(harness.adapter, 'user-1')
      await expect(
        importPublishPackageFileToPostgres({
          packagePath: corruptedPath,
          postgresAdapter: harness.adapter,
          serverAssetRoot: serverRoot,
          importingUserId: 'user-1',
          authenticatedUserId: 'user-1',
        })
      ).rejects.toThrow(/Missing bundled asset bytes/)

      const prodRows = await harness.adapter.select<Array<{ n: number }>>(
        'SELECT COUNT(*)::int AS n FROM productions WHERE id = $1',
        [productionId]
      )
      const docRows = await harness.adapter.select<Array<{ n: number }>>(
        'SELECT COUNT(*)::int AS n FROM documents WHERE production_id = $1',
        [productionId]
      )
      const storyboardRows = await harness.adapter.select<Array<{ n: number }>>(
        'SELECT COUNT(*)::int AS n FROM storyboard_images WHERE production_id = $1',
        [productionId]
      )
      expect(prodRows[0]!.n).toBe(0)
      expect(docRows[0]!.n).toBe(0)
      expect(storyboardRows[0]!.n).toBe(0)
      expect(existsSync(serverRoot)).toBe(false)
    } finally {
      await harness.close()
    }
  }, 120_000)
})
