import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'

import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
  }
})

import { createProduction } from '@/lib/db/repositories/production'
import {
  createScene,
  createShot,
  deleteScene,
  deleteShot,
  listShotsByProduction,
  moveShotToScene,
  updateShot,
} from '@/lib/db/repositories/schedule'
import {
  applyAthenaImportToStoryboard,
  cleanupStoryboardImagesForDeletedShot,
  createStoryboardImport,
  createStoryboardImage,
  deleteStoryboardImage,
  getPrimaryStoryboardImageForShot,
  getStoryboardBundleForShotList,
  getStoryboardImageById,
  getStoryboardImagesForScene,
  listStoryboardImagesByScene,
  listStoryboardImagesByProduction,
  listStoryboardImagesByShot,
} from '@/lib/db/repositories/storyboard'

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAlbatrossMigrationsSqlJs(db)
  dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

describe('storyboard repository foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates storyboard image linked to a valid shot', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Storyboard', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '12' })
    const shot = await createShot({ scene_id: scene.id, shot_number: 'A' })

    const image = await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: `storyboards/${production.id}/shots/${shot.shot.id}/manual/test-image.jpg`,
      original_filename: 'test-image.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })

    expect(image.shot_id).toBe(shot.shot.id)
    expect(image.scene_id).toBe(scene.id)
    expect(image.production_id).toBe(production.id)
    expect(image.sort_order).toBe(0)
  })

  it('rejects invalid shot/scene/production combinations', async () => {
    await makeDb()
    const p1 = await createProduction({ name: 'A', notes: null }, { skipBudgetSeed: true })
    const p2 = await createProduction({ name: 'B', notes: null }, { skipBudgetSeed: true })
    const scene1 = await createScene({ production_id: p1.id, scene_number: '1' })
    const scene2 = await createScene({ production_id: p2.id, scene_number: '2' })
    const shot1 = await createShot({ scene_id: scene1.id, shot_number: '1' })

    await expect(
      createStoryboardImage({
        production_id: p1.id,
        scene_id: scene2.id,
        shot_id: shot1.shot.id,
        storage_key: 'storyboards/invalid.jpg',
        original_filename: 'invalid.jpg',
        mime_type: 'image/jpeg',
        source_type: 'manual',
      })
    ).rejects.toThrow(/scene_id does not match/)

    await expect(
      createStoryboardImage({
        production_id: p2.id,
        scene_id: scene1.id,
        shot_id: shot1.shot.id,
        storage_key: 'storyboards/invalid-2.jpg',
        original_filename: 'invalid-2.jpg',
        mime_type: 'image/jpeg',
        source_type: 'manual',
      })
    ).rejects.toThrow(/production_id does not match/)
  })

  it('lists storyboard images by scene and shot correctly', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Lists', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '8' })
    const shotA = await createShot({ scene_id: scene.id, shot_number: '1' })
    const shotB = await createShot({ scene_id: scene.id, shot_number: '2' })

    const imgA1 = await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shotA.shot.id,
      storage_key: 'storyboards/a1.jpg',
      original_filename: 'a1.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 0,
    })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shotA.shot.id,
      storage_key: 'storyboards/a2.jpg',
      original_filename: 'a2.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 1,
    })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shotB.shot.id,
      storage_key: 'storyboards/b1.jpg',
      original_filename: 'b1.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 0,
    })

    const byShot = await listStoryboardImagesByShot(shotA.shot.id)
    expect(byShot).toHaveLength(2)
    expect(byShot[0]!.id).toBe(imgA1.id)

    const byScene = await listStoryboardImagesByScene(scene.id)
    expect(byScene).toHaveLength(3)
  })

  it('soft-deletes storyboard image', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Delete', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '17' })
    const shot = await createShot({ scene_id: scene.id, shot_number: 'Z' })
    const image = await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/delete-me.jpg',
      original_filename: 'delete-me.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })

    await deleteStoryboardImage(image.id)
    const byShot = await listStoryboardImagesByShot(shot.shot.id)
    expect(byShot).toHaveLength(0)
  })

  it('deleting shot cleans up storyboard images (no orphans)', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Delete shot sync', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '20' })
    const shot = await createShot({ scene_id: scene.id, shot_number: 'A' })
    const img = await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/delete-shot-sync.jpg',
      original_filename: 'delete-shot-sync.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })

    await deleteShot(shot.shot.id)
    expect(await listStoryboardImagesByShot(shot.shot.id)).toHaveLength(0)
    expect(await getStoryboardImageById(img.id)).toBeNull()
  })

  it('moving shot updates storyboard image scene linkage', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Move shot sync', notes: null }, { skipBudgetSeed: true })
    const sceneA = await createScene({ production_id: production.id, scene_number: '30' })
    const sceneB = await createScene({ production_id: production.id, scene_number: '40' })
    const shot = await createShot({ scene_id: sceneA.id, shot_number: 'A' })
    const img = await createStoryboardImage({
      production_id: production.id,
      scene_id: sceneA.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/move-shot-sync.jpg',
      original_filename: 'move-shot-sync.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })

    const moved = await moveShotToScene(shot.shot.id, sceneB.id)
    expect(moved.scene_id).toBe(sceneB.id)
    const movedImage = await getStoryboardImageById(img.id)
    expect(movedImage?.scene_id).toBe(sceneB.id)
    expect(await listStoryboardImagesByScene(sceneA.id)).toHaveLength(0)
    expect(await listStoryboardImagesByScene(sceneB.id)).toHaveLength(1)
  })

  it('updating shot metadata and shot order reflects in storyboard-linked views', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Order sync', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '50' })
    const shot1 = await createShot({ scene_id: scene.id, shot_number: '1' })
    const shot2 = await createShot({ scene_id: scene.id, shot_number: '2' })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot1.shot.id,
      storage_key: 'storyboards/order-shot-1.jpg',
      original_filename: 'order-shot-1.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot2.shot.id,
      storage_key: 'storyboards/order-shot-2.jpg',
      original_filename: 'order-shot-2.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })

    await updateShot(shot1.shot.id, { shot_description: 'Updated description' })
    await updateShot(shot1.shot.id, { shot_number: '3' })

    const shotsInProduction = await listShotsByProduction(production.id)
    expect(shotsInProduction.map((s) => s.shot_number)).toEqual(['2', '3'])
    expect(await listStoryboardImagesByProduction(production.id)).toHaveLength(2)
  })

  it('storyboard image upload does not create duplicate shots', async () => {
    await makeDb()
    const production = await createProduction({ name: 'No duplicate shots', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '60' })
    const shot = await createShot({ scene_id: scene.id, shot_number: '1A' })

    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/no-dup-1.jpg',
      original_filename: 'no-dup-1.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/no-dup-2.jpg',
      original_filename: 'no-dup-2.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })

    const shots = await listShotsByProduction(production.id)
    expect(shots).toHaveLength(1)
    expect(shots[0]!.id).toBe(shot.shot.id)
    expect(await listStoryboardImagesByShot(shot.shot.id)).toHaveLength(2)
  })

  it('deleting scene cleans up storyboard images tied to that scene', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Delete scene sync', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '70' })
    const shot = await createShot({ scene_id: scene.id, shot_number: 'A' })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/delete-scene-sync.jpg',
      original_filename: 'delete-scene-sync.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })

    await deleteScene(scene.id)
    expect(await listStoryboardImagesByScene(scene.id)).toHaveLength(0)
    expect(await listStoryboardImagesByProduction(production.id)).toHaveLength(0)
  })

  it('exposes cleanup helper for deleted shots', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Helper coverage', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '80' })
    const shot = await createShot({ scene_id: scene.id, shot_number: 'A' })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/helper.jpg',
      original_filename: 'helper.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })
    await cleanupStoryboardImagesForDeletedShot(shot.shot.id)
    expect(await listStoryboardImagesByShot(shot.shot.id)).toHaveLength(0)
  })

  it('returns empty storyboard images when storyboard tables are unavailable', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    dbAdapter = createSqlJsTauriAdapter(db)

    await expect(listStoryboardImagesByProduction('demo-production')).resolves.toEqual([])
    await expect(listStoryboardImagesByScene('demo-scene')).resolves.toEqual([])
    await expect(listStoryboardImagesByShot('demo-shot')).resolves.toEqual([])
  })

  it('selects primary image using lowest sort_order', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Primary rule', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '94' })
    const shot = await createShot({ scene_id: scene.id, shot_number: '1' })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/shot-primary-2.jpg',
      original_filename: 'shot-primary-2.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 2,
    })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/shot-primary-0.jpg',
      original_filename: 'shot-primary-0.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 0,
    })

    const primary = await getPrimaryStoryboardImageForShot(shot.shot.id)
    expect(primary?.storage_key).toBe('storyboards/shot-primary-0.jpg')
  })

  it('returns scene image map grouped by shot in stable order', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Scene map', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '95' })
    const shotA = await createShot({ scene_id: scene.id, shot_number: '1' })
    const shotB = await createShot({ scene_id: scene.id, shot_number: '2' })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shotA.shot.id,
      storage_key: 'storyboards/map-a-1.jpg',
      original_filename: 'map-a-1.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 1,
    })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shotA.shot.id,
      storage_key: 'storyboards/map-a-0.jpg',
      original_filename: 'map-a-0.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 0,
    })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shotB.shot.id,
      storage_key: 'storyboards/map-b-0.jpg',
      original_filename: 'map-b-0.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 0,
    })

    const byShot = await getStoryboardImagesForScene(scene.id)
    expect(byShot.get(shotA.shot.id)?.map((x) => x.storage_key)).toEqual([
      'storyboards/map-a-0.jpg',
      'storyboards/map-a-1.jpg',
    ])
    expect(byShot.get(shotB.shot.id)?.map((x) => x.storage_key)).toEqual(['storyboards/map-b-0.jpg'])
  })

  it('builds storyboard shot-list bundle in canonical scene/shot order with missing image safety', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Bundle', notes: null }, { skipBudgetSeed: true })
    const scene1 = await createScene({ production_id: production.id, scene_number: '10' })
    const scene2 = await createScene({ production_id: production.id, scene_number: '20' })
    const shotA = await createShot({ scene_id: scene1.id, shot_number: '1' })
    await createShot({ scene_id: scene1.id, shot_number: '2' })
    const shotC = await createShot({ scene_id: scene2.id, shot_number: '1' })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene1.id,
      shot_id: shotA.shot.id,
      storage_key: 'storyboards/bundle-a.jpg',
      original_filename: 'bundle-a.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 0,
    })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene2.id,
      shot_id: shotC.shot.id,
      storage_key: 'storyboards/bundle-c.jpg',
      original_filename: 'bundle-c.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
      sort_order: 0,
    })

    const bundle = await getStoryboardBundleForShotList(production.id)
    expect(bundle.map((row) => `${row.scene_number}:${row.shot_number}`)).toEqual(['10:1', '10:2', '20:1'])
    expect(bundle[0]!.primary_image?.storage_key).toBe('storyboards/bundle-a.jpg')
    expect(bundle[1]!.primary_image).toBeNull()
    expect(bundle[1]!.images).toEqual([])
    expect(bundle[2]!.primary_image?.storage_key).toBe('storyboards/bundle-c.jpg')
  })

  it('applies reviewed Athena panels with replace/add policies', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Apply import', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '92' })
    const shotA = await createShot({ scene_id: scene.id, shot_number: '1' })
    const shotB = await createShot({ scene_id: scene.id, shot_number: '2' })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shotA.shot.id,
      storage_key: 'storyboards/existing-a.jpg',
      original_filename: 'existing-a.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })
    const importRow = await createStoryboardImport({
      production_id: production.id,
      scene_id: scene.id,
      source_filename: 'athena.pdf',
      source_type: 'athena_pdf_import',
      status: 'completed',
    })

    const result = await applyAthenaImportToStoryboard({
      production_id: production.id,
      source_import_id: importRow.id,
      items: [
        {
          candidate_id: 'c1',
          shot_id: shotA.shot.id,
          scene_id: scene.id,
          storage_key: 'storyboards/import-a.png',
          original_filename: 'import-a.png',
          mime_type: 'image/png',
          conflict_policy: 'replace',
        },
        {
          candidate_id: 'c2',
          shot_id: shotB.shot.id,
          scene_id: scene.id,
          storage_key: 'storyboards/import-b.png',
          original_filename: 'import-b.png',
          mime_type: 'image/png',
          conflict_policy: 'add',
        },
      ],
    })
    expect(result.appliedCount).toBe(2)
    const imagesA = await listStoryboardImagesByShot(shotA.shot.id)
    const imagesB = await listStoryboardImagesByShot(shotB.shot.id)
    expect(imagesA).toHaveLength(1)
    expect(imagesA[0]!.storage_key).toBe('storyboards/import-a.png')
    expect(imagesA[0]!.source_import_id).toBe(importRow.id)
    expect(imagesB).toHaveLength(1)
    expect(imagesB[0]!.storage_key).toBe('storyboards/import-b.png')
  })

  it('fails safely without mutating existing images when apply input is invalid', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Apply rollback', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '93' })
    const shot = await createShot({ scene_id: scene.id, shot_number: '1' })
    await createStoryboardImage({
      production_id: production.id,
      scene_id: scene.id,
      shot_id: shot.shot.id,
      storage_key: 'storyboards/preexisting.jpg',
      original_filename: 'preexisting.jpg',
      mime_type: 'image/jpeg',
      source_type: 'manual',
    })
    const importRow = await createStoryboardImport({
      production_id: production.id,
      scene_id: scene.id,
      source_filename: 'athena-fail.pdf',
      source_type: 'athena_pdf_import',
      status: 'completed',
    })

    await expect(
      applyAthenaImportToStoryboard({
        production_id: production.id,
        source_import_id: importRow.id,
        items: [
          {
            candidate_id: 'c1',
            shot_id: shot.shot.id,
            scene_id: scene.id,
            storage_key: 'storyboards/new-a.png',
            original_filename: 'new-a.png',
            mime_type: 'image/png',
            conflict_policy: 'replace',
          },
          {
            candidate_id: 'c2',
            shot_id: 'missing-shot',
            scene_id: scene.id,
            storage_key: 'storyboards/new-b.png',
            original_filename: 'new-b.png',
            mime_type: 'image/png',
            conflict_policy: 'add',
          },
        ],
      })
    ).rejects.toThrow(/Shot not found or deleted/)

    const imagesAfter = await listStoryboardImagesByShot(shot.shot.id)
    expect(imagesAfter).toHaveLength(1)
    expect(imagesAfter[0]!.storage_key).toBe('storyboards/preexisting.jpg')
  })
})
