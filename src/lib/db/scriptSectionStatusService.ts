/**
 * Loads what the derived section status needs for one script version: the shots linked to each
 * section, the shoot days those shots (or their scenes) are scheduled on, printed takes the script
 * supervisor logged against them, and the script supervisor's scene marks. Read-only.
 */
import { getDb } from './client'
import { listShotLinksByScriptVersion } from './repositories/scriptSections'
import { listShootDaysByProduction } from './repositories/schedule'
import { listStripsByProduction } from './repositories/stripboard-strips'
import type { SectionShootDayRef, SectionShotProgress } from './scriptSectionStatus'
import { formatSlateLabel } from '@/lib/script-supervisor/slateNumbering'

export type ScriptVersionSectionProgress = {
  /** Linked shots per section id, in link order. Sections with no links are absent. */
  shotsBySectionId: Map<string, SectionShotProgress[]>
  /** Scenes the script supervisor marked omitted; their sections count as cut. */
  omittedSceneIds: Set<string>
}

export async function loadScriptVersionSectionProgress(
  productionId: string,
  scriptVersionId: string
): Promise<ScriptVersionSectionProgress> {
  const db = await getDb()
  const [links, strips, days, printRows, marks] = await Promise.all([
    listShotLinksByScriptVersion(scriptVersionId),
    listStripsByProduction(productionId),
    listShootDaysByProduction(productionId),
    db.select<Array<{ shot_id: string; slate_prefix: string | null; slate_number: number; take_number: number }>>(
      `SELECT s.shot_id, s.slate_prefix, s.slate_number, t.take_number FROM slates s
       INNER JOIN takes t ON t.slate_id = s.id AND t.deleted_at IS NULL
       WHERE s.production_id = $1 AND s.deleted_at IS NULL AND s.shot_id IS NOT NULL AND t.status = 'print'
       ORDER BY s.slate_number, t.take_number`,
      [productionId]
    ),
    db.select<Array<{ scene_id: string; marked_status: string | null }>>(
      `SELECT scene_id, marked_status FROM script_supervisor_scene_progress
       WHERE production_id = $1 AND marked_status IS NOT NULL`,
      [productionId]
    ),
  ])

  const dayById = new Map<string, SectionShootDayRef>(
    days.map((d) => [d.id, { id: d.id, dayNumber: d.day_number, shootDate: d.shoot_date }])
  )
  const daysByShot = new Map<string, Set<string>>()
  const daysByScene = new Map<string, Set<string>>()
  for (const strip of strips) {
    if (!strip.shoot_day_id || !dayById.has(strip.shoot_day_id)) continue
    if (strip.strip_type === 'SHOT' && strip.shot_id) {
      const set = daysByShot.get(strip.shot_id) ?? new Set<string>()
      set.add(strip.shoot_day_id)
      daysByShot.set(strip.shot_id, set)
    } else if (strip.strip_type === 'SCENE' && strip.scene_id) {
      const set = daysByScene.get(strip.scene_id) ?? new Set<string>()
      set.add(strip.shoot_day_id)
      daysByScene.set(strip.scene_id, set)
    }
  }

  const printsByShot = new Map<string, string[]>()
  for (const row of printRows) {
    const list = printsByShot.get(row.shot_id) ?? []
    list.push(`Slate ${formatSlateLabel(row.slate_prefix, Number(row.slate_number))} T${row.take_number}`)
    printsByShot.set(row.shot_id, list)
  }
  const completeSceneIds = new Set(marks.filter((m) => m.marked_status === 'complete').map((m) => m.scene_id))
  const omittedSceneIds = new Set(marks.filter((m) => m.marked_status === 'omitted').map((m) => m.scene_id))

  const shotsBySectionId = new Map<string, SectionShotProgress[]>()
  for (const { sectionId, shot } of links) {
    const dayIds = new Set([...(daysByShot.get(shot.id) ?? []), ...(daysByScene.get(shot.scene_id) ?? [])])
    const shootDays = [...dayIds]
      .map((id) => dayById.get(id)!)
      .sort((a, b) => a.shootDate.localeCompare(b.shootDate))
    const list = shotsBySectionId.get(sectionId) ?? []
    list.push({
      shotId: shot.id,
      shotNumber: shot.shot_number,
      shootDays,
      printedTakes: printsByShot.get(shot.id) ?? [],
      sceneComplete: completeSceneIds.has(shot.scene_id),
    })
    shotsBySectionId.set(sectionId, list)
  }

  return { shotsBySectionId, omittedSceneIds }
}
