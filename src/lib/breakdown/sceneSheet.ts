/**
 * Builds a scene's breakdown sheet (header fields plus the elements tagged in it, by category) from data the
 * production already holds, so nothing on the sheet is typed twice. Shared by the on-screen sheet and the PDF.
 * Pure; no database access.
 */
import { formatEighths, pageNumberOf } from '@/lib/db/scriptSectionLayout'
import type { BreakdownCategory, BreakdownElement, BreakdownTag, Location, Production, Scene, ScriptPage } from '@/lib/db/types'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import { locationFromHeading } from './autoTag'
import { BREAKDOWN_CATEGORIES } from './categories'
import type { BreakdownStatus, ElementMatch } from './matching'

export type SceneSheetHeader = {
  /** Position of the scene in script order, 1-based, and the number of scenes in the script. */
  sceneOrdinal: number
  sceneCount: number
  /** When the scene was last broken down (latest tag change), ISO timestamp. */
  breakdownDate: string | null
  intExt: string | null
  dayNight: string | null
  productionCode: string | null
  productionTitle: string
  /** Sheet number in the breakdown (one sheet per scene, in script order). */
  breakdownPageNo: number
  sceneNumber: string
  sceneName: string | null
  /** First–last script page the scene is on, e.g. "12–13". */
  scriptPages: string | null
  description: string | null
  pageCount: string | null
  locationName: string | null
}

export type SceneSheetItem = {
  elementId: string
  name: string
  status: BreakdownStatus
  detail: string
  /** Tags of this element in the scene. */
  occurrences: number
}

export type SceneSheetCategory = {
  category: BreakdownCategory
  label: string
  colour: string
  items: SceneSheetItem[]
}

export type SceneSheet = {
  sceneId: string
  header: SceneSheetHeader
  /** Every category, in sheet order (empty ones included, as on the paper sheet). */
  categories: SceneSheetCategory[]
}

export type SceneSheetInput = {
  production: Pick<Production, 'name' | 'production_code'>
  /** Episode name for episodic productions; appended to the title. */
  episodeName?: string | null
  scene: Pick<Scene, 'id' | 'scene_number' | 'title' | 'description' | 'int_ext' | 'day_night' | 'page_eighths' | 'location_id'>
  sceneOrdinal: number
  sceneCount: number
  /** The scene's pages in the script version, in page order. */
  pages: ReadonlyArray<Pick<ScriptPage, 'page_number' | 'page_index' | 'eighths'>>
  locations: ReadonlyArray<Pick<Location, 'id' | 'name'>>
  /** The scene's tags. */
  tags: ReadonlyArray<Pick<BreakdownTag, 'element_id' | 'updated_at'>>
  elementsById: ReadonlyMap<string, Pick<BreakdownElement, 'id' | 'category' | 'name'>>
  matchesByElementId: ReadonlyMap<string, Pick<ElementMatch, 'status' | 'detail'>>
}

function known(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v && v !== 'UNK' ? v : null
}

export function buildSceneSheet(input: SceneSheetInput): SceneSheet {
  const { scene, pages } = input
  const locationName =
    input.locations.find((l) => l.id === scene.location_id)?.name ?? (scene.title ? locationFromHeading(scene.title) : null)

  const first = pages[0]
  const last = pages[pages.length - 1]
  const firstNo = first ? pageNumberOf(first) : null
  const lastNo = last ? pageNumberOf(last) : null
  const scriptPages = firstNo == null ? null : firstNo === lastNo ? firstNo : `${firstNo}–${lastNo}`

  const pageEighths = pages.reduce((sum, p) => sum + (p.eighths ?? 0), 0)
  const eighths = pageEighths > 0 ? pageEighths : (scene.page_eighths ?? 0)

  let breakdownDate: string | null = null
  const counts = new Map<string, number>()
  for (const tag of input.tags) {
    if (!breakdownDate || tag.updated_at > breakdownDate) breakdownDate = tag.updated_at
    counts.set(tag.element_id, (counts.get(tag.element_id) ?? 0) + 1)
  }

  const categories = BREAKDOWN_CATEGORIES.map((info) => {
    const items: SceneSheetItem[] = []
    for (const [elementId, occurrences] of counts) {
      const el = input.elementsById.get(elementId)
      if (!el || el.category !== info.key) continue
      const match = input.matchesByElementId.get(elementId)
      items.push({
        elementId,
        name: el.name,
        status: match?.status ?? 'needed',
        detail: match?.detail ?? '',
        occurrences,
      })
    }
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return { category: info.key, label: info.label, colour: info.colour, items }
  })

  const title = input.production.name
  return {
    sceneId: scene.id,
    header: {
      sceneOrdinal: input.sceneOrdinal,
      sceneCount: input.sceneCount,
      breakdownDate,
      intExt: known(scene.int_ext),
      dayNight: known(scene.day_night),
      productionCode: input.production.production_code?.trim() || null,
      productionTitle: input.episodeName?.trim() ? `${title} – ${input.episodeName.trim()}` : title,
      breakdownPageNo: input.sceneOrdinal,
      sceneNumber: scene.scene_number,
      sceneName: sceneSlugline(scene, locationName),
      scriptPages,
      description: scene.description?.trim() || null,
      pageCount: eighths > 0 ? formatEighths(eighths) : null,
      locationName,
    },
    categories,
  }
}

/** Sheet date, e.g. "7 Oct 2026". */
export function formatSheetDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
