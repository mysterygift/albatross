/**
 * Script Supervisor exports (SS9): loads what the continuity sheets, editor's log and marked-up script need.
 * Local SQLite only; read-only apart from `loadLinedScene` generating script elements on first use.
 */
import { getDb } from './client'
import { listSlatesByShootDay, listTakesBySlateIds } from './repositories/scriptSupervisor'
import { listAnnotationsForScene, listAnnotationsForSlate, listContinuityMediaForSlate } from './repositories/scriptAnnotations'
import { getScriptElementExcerpts, loadLinedScene } from './repositories/scriptLining'
import { annotationsByElement } from '@/lib/script-supervisor/annotations'
import type { ContinuitySlateInput } from '@/lib/script-supervisor/continuitySheets'
import { layoutLinedScript } from '@/lib/script-supervisor/lining'
import type { MarkedUpSceneInput } from '@/lib/script-supervisor/markedUpScript'
import { slateDisplayLabel } from '@/lib/script-supervisor/slateNumbering'

export type ExportScene = { sceneId: string; sceneNumber: string; title: string | null }

async function sceneInfo(ids: readonly string[]): Promise<Map<string, ExportScene>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id, scene_number, title FROM scenes WHERE id IN (${unique.map((_, i) => `$${i + 1}`).join(', ')})`,
    unique
  )
  return new Map(
    rows.map((r) => [
      r.id as string,
      { sceneId: r.id as string, sceneNumber: (r.scene_number as string | null) ?? '', title: (r.title as string | null) ?? null },
    ])
  )
}

/** Slates on a shoot day with their takes, script notes (with the line each is on) and photo tags, in shot order. */
export async function loadContinuityDay(shootDayId: string): Promise<ContinuitySlateInput[]> {
  const slates = await listSlatesByShootDay(shootDayId)
  if (slates.length === 0) return []
  const [takes, scenes, notesBySlate, photosBySlate] = await Promise.all([
    listTakesBySlateIds(slates.map((s) => s.id)),
    sceneInfo(slates.map((s) => s.scene_id).filter((id): id is string => !!id)),
    Promise.all(slates.map((s) => listAnnotationsForSlate(s.id))),
    Promise.all(slates.map((s) => listContinuityMediaForSlate(s.id))),
  ])
  const excerpts = await getScriptElementExcerpts(notesBySlate.flat().map((n) => n.elementId))
  return slates.map((slate, i) => {
    const sceneNumber = slate.scene_id ? scenes.get(slate.scene_id)?.sceneNumber ?? null : null
    return {
      slate,
      label: slateDisplayLabel(slate, sceneNumber),
      sceneNumber,
      takes: takes.filter((t) => t.slate_id === slate.id),
      notes: notesBySlate[i]!.map((n) => ({ ...n, excerpt: excerpts.get(n.elementId) ?? null })),
      photos: photosBySlate[i]!.map((p) => ({ takeNumber: p.takeNumber, tags: p.tags })),
    }
  })
}

/** Scenes with at least one live slate on the day, in the order they were first slated. */
export async function listScenesShotOnDay(shootDayId: string): Promise<ExportScene[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sc.id, sc.scene_number, sc.title, MIN(s.created_at) AS first_slate
     FROM slates s
     INNER JOIN scenes sc ON sc.id = s.scene_id AND sc.deleted_at IS NULL
     WHERE s.shoot_day_id = $1 AND s.deleted_at IS NULL
     GROUP BY sc.id, sc.scene_number, sc.title
     ORDER BY first_slate, sc.scene_number`,
    [shootDayId]
  )
  return rows.map((r) => ({
    sceneId: r.id as string,
    sceneNumber: (r.scene_number as string | null) ?? '',
    title: (r.title as string | null) ?? null,
  }))
}

/**
 * Marked-up script input for each scene, built from the same `layoutLinedScript` the Script view uses.
 * Scenes not in an imported script are returned in `missing`.
 */
export async function loadMarkedUpScenes(
  productionId: string,
  scenes: readonly ExportScene[]
): Promise<{ scenes: MarkedUpSceneInput[]; missing: ExportScene[] }> {
  const out: MarkedUpSceneInput[] = []
  const missing: ExportScene[] = []
  for (const scene of scenes) {
    const lined = await loadLinedScene(productionId, scene.sceneId)
    if (!lined || lined.elements.length === 0) {
      missing.push(scene)
      continue
    }
    const notes = await listAnnotationsForScene(lined.scriptVersionId, scene.sceneId)
    out.push({
      sceneNumber: scene.sceneNumber,
      sceneTitle: scene.title,
      layout: layoutLinedScript(lined.elements, lined.tramlines),
      annotations: annotationsByElement(notes),
    })
  }
  return { scenes: out, missing }
}

export type SceneCoverageState = 'no_script' | 'unlined' | 'under' | 'covered'

export type SceneCoverage = ExportScene & {
  state: SceneCoverageState
  tramlines: number
  /** Blocks with fewer than two tramlines (headings ignored). */
  underCovered: number
}

/** Two-tramline check for every scene slated on the day. */
export async function loadDayCoverage(productionId: string, shootDayId: string): Promise<SceneCoverage[]> {
  const scenes = await listScenesShotOnDay(shootDayId)
  const out: SceneCoverage[] = []
  for (const scene of scenes) {
    const lined = await loadLinedScene(productionId, scene.sceneId)
    if (!lined || lined.elements.length === 0) {
      out.push({ ...scene, state: 'no_script', tramlines: 0, underCovered: 0 })
      continue
    }
    const layout = layoutLinedScript(lined.elements, lined.tramlines)
    const under = layout.rows.filter((r) => r.coverage != null && r.coverage < 2).length
    const state: SceneCoverageState = layout.columns.length === 0 ? 'unlined' : under > 0 ? 'under' : 'covered'
    out.push({ ...scene, state, tramlines: layout.columns.length, underCovered: layout.columns.length > 0 ? under : 0 })
  }
  return out
}
