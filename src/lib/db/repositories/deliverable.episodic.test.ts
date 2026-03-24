import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
    executeBatch: vi.fn(
      async (
        db: { execute: (sql: string, bindValues?: unknown[]) => Promise<void> },
        statements: Array<{ sql: string; bindValues: unknown[] }>
      ) => {
        let open = false
        try {
          for (const s of statements) {
            const upper = s.sql.trim().toUpperCase()
            if (upper.startsWith('BEGIN')) open = true
            await db.execute(s.sql, s.bindValues)
            if (upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) open = false
          }
        } catch (e) {
          if (open) {
            try {
              await db.execute('ROLLBACK', [])
            } catch {
              /* ignore */
            }
          }
          throw e
        }
      }
    ),
  }
})

import { createProduction } from '@/lib/db/repositories/production'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import { appendEpisode, archiveEpisode } from '@/lib/db/episodeManagementService'
import {
  assertDeliverableEpisodeAllowed,
  createDeliverable,
  listDeliverablesByProduction,
  resolveDeliverableScopeLabel,
  updateDeliverable,
} from '@/lib/db/repositories/deliverable'
import {
  applyDeliverableTemplateToProduction,
  createDeliverableTemplate,
  createDeliverableTemplateItem,
} from '@/lib/db/repositories/deliverableTemplates'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

describe('deliverable episodic scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('episodic: create with active episode and project-wide; filter lists', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'Series', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'One' }
    )
    const eps = await listEpisodesByProduction(p.id)
    const e1 = eps[0]!

    const dScoped = await createDeliverable({
      production_id: p.id,
      name: 'A',
      episode_id: e1.id,
    })
    expect(dScoped.episode_id).toBe(e1.id)

    const dWide = await createDeliverable({
      production_id: p.id,
      name: 'B',
      episode_id: null,
    })
    expect(dWide.episode_id).toBeNull()

    const all = await listDeliverablesByProduction(p.id, { filter: 'all' })
    expect(all.map((x) => x.name).sort()).toEqual(['A', 'B'])

    const wideOnly = await listDeliverablesByProduction(p.id, { filter: 'project_wide' })
    expect(wideOnly.map((x) => x.name)).toEqual(['B'])

    const epOnly = await listDeliverablesByProduction(p.id, { filter: 'episode', episodeId: e1.id })
    expect(epOnly.map((x) => x.name)).toEqual(['A'])
  })

  it('non-episodic: rejects episode_id on create', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Film', notes: null }, { skipBudgetSeed: true })
    await expect(
      createDeliverable({
        production_id: p.id,
        name: 'X',
        episode_id: 'any-id',
      })
    ).rejects.toThrow(/non-episodic/)
  })

  it('rejects episode from another production', async () => {
    await makeDb()
    const p1 = await createProduction(
      { name: 'S1', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'E1' }
    )
    const p2 = await createProduction(
      { name: 'S2', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'E2' }
    )
    const ep1 = (await listEpisodesByProduction(p1.id))[0]!
    await expect(
      createDeliverable({
        production_id: p2.id,
        name: 'Bad',
        episode_id: ep1.id,
      })
    ).rejects.toThrow(/Episode not found or archived/)
  })

  it('rejects archived episode on create; existing row keeps link; resolveDeliverableScopeLabel shows archived', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'Keep' }
    )
    await appendEpisode(p.id, 'ToArchive')
    const list = await listEpisodesByProduction(p.id)
    const eGone = list.find((e) => e.name === 'ToArchive')!

    const d = await createDeliverable({
      production_id: p.id,
      name: 'Legacy',
      episode_id: eGone.id,
    })
    await archiveEpisode(p.id, eGone.id)

    await expect(
      createDeliverable({
        production_id: p.id,
        name: 'Nope',
        episode_id: eGone.id,
      })
    ).rejects.toThrow(/Episode not found or archived/)

    const reloaded = await listDeliverablesByProduction(p.id)
    expect(reloaded.find((x) => x.id === d.id)?.episode_id).toBe(eGone.id)

    const label = await resolveDeliverableScopeLabel(p.id, eGone.id)
    expect(label).toEqual({
      kind: 'episode',
      name: 'ToArchive',
      archived: true,
    })
  })

  it('list filter episode requires episodeId', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' }
    )
    await expect(listDeliverablesByProduction(p.id, { filter: 'episode' })).rejects.toThrow(
      /episodeId is required/
    )
  })

  it('assertDeliverableEpisodeAllowed matches non-episodic / episodic rules', async () => {
    await makeDb()
    const film = await createProduction({ name: 'F', notes: null }, { skipBudgetSeed: true })
    await expect(assertDeliverableEpisodeAllowed(film.id, 'e1')).rejects.toThrow(/non-episodic/)
    await expect(assertDeliverableEpisodeAllowed(film.id, null)).resolves.toBeUndefined()

    const series = await createProduction(
      { name: 'Sr', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'P' }
    )
    const ep = (await listEpisodesByProduction(series.id))[0]!
    await expect(assertDeliverableEpisodeAllowed(series.id, null)).resolves.toBeUndefined()
    await expect(assertDeliverableEpisodeAllowed(series.id, ep.id)).resolves.toBeUndefined()
  })

  it('applyDeliverableTemplateToProduction sets episode_id when requested', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'Only' }
    )
    const ep = (await listEpisodesByProduction(p.id))[0]!
    const tpl = await createDeliverableTemplate({ name: 'Tpl' })
    await createDeliverableTemplateItem({
      deliverable_template_id: tpl.id,
      name: 'From template',
    })
    await applyDeliverableTemplateToProduction({
      productionId: p.id,
      templateId: tpl.id,
      episodeId: ep.id,
    })
    const rows = await listDeliverablesByProduction(p.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.episode_id).toBe(ep.id)
    expect(rows[0]!.name).toBe('From template')
  })

  it('apply template without episodeId leaves project-wide rows', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'Only' }
    )
    const tpl = await createDeliverableTemplate({ name: 'T2' })
    await createDeliverableTemplateItem({ deliverable_template_id: tpl.id, name: 'Row' })
    await applyDeliverableTemplateToProduction({ productionId: p.id, templateId: tpl.id })
    const rows = await listDeliverablesByProduction(p.id)
    expect(rows[0]!.episode_id).toBeNull()
  })

  it('updateDeliverable can set and clear episode scope', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' }
    )
    await appendEpisode(p.id, 'B')
    const [ea, eb] = await listEpisodesByProduction(p.id)
    let d = await createDeliverable({ production_id: p.id, name: 'M', episode_id: null })
    expect(d.episode_id).toBeNull()
    d = await updateDeliverable(d.id, { episode_id: ea!.id })
    expect(d.episode_id).toBe(ea!.id)
    d = await updateDeliverable(d.id, { episode_id: eb!.id })
    expect(d.episode_id).toBe(eb!.id)
    d = await updateDeliverable(d.id, { episode_id: null })
    expect(d.episode_id).toBeNull()
  })

  it('updateDeliverable rejects targeting archived episode', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'Keep' }
    )
    await appendEpisode(p.id, 'Old')
    const eOld = (await listEpisodesByProduction(p.id)).find((e) => e.name === 'Old')!
    const d = await createDeliverable({ production_id: p.id, name: 'D', episode_id: eOld.id })
    await archiveEpisode(p.id, eOld.id)
    const [eActive] = await listEpisodesByProduction(p.id)
    await updateDeliverable(d.id, { episode_id: eActive!.id })
    await expect(updateDeliverable(d.id, { episode_id: eOld.id })).rejects.toThrow(
      /Episode not found or archived/
    )
  })
})
