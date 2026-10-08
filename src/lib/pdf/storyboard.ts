/**
 * Storyboard PDF: each scene's storyboard panels, three across, in shot order. Every image of a
 * shot is printed (primary first). PNG and JPEG panels are embedded; other formats get an empty
 * frame so the panel keeps its place.
 */
import type { Location, Scene, Shot, StoryboardImage } from '@/lib/db/types'
import {
  COLOR_MUTED,
  DEFAULT_PAPER_SIZE,
  PdfLayout,
  formatIssuedStamp,
  type PaperSize,
} from '@/lib/pdf/layoutKit'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import { sortScenesByNumber } from '@/lib/schedule/sceneFields'

const SEP = ' | '
const PANELS_ACROSS = 3

export type StoryboardPdfPanel = {
  /** e.g. `Shot 1A | CU`, or `Shot 1A (2)` for a shot's later panels. */
  caption: string
  /** Shot description or subject, on the shot's first panel only. */
  detail: string | null
  storageKey: string
}

export type StoryboardPdfScene = {
  sceneNumber: string
  heading: string | null
  panels: StoryboardPdfPanel[]
}

export type StoryboardPdfData = {
  productionName: string
  scopeLabel: string
  scenes: StoryboardPdfScene[]
}

export type StoryboardPdfInput = {
  productionName: string
  scopeLabel: string
  scenes: Scene[]
  shots: Shot[]
  images: StoryboardImage[]
  locations: Pick<Location, 'id' | 'name'>[]
  /** Shot ids in print order (e.g. strip order); otherwise scene then shot number order. */
  shotOrder?: string[]
  sceneIds?: string[]
}

/** Panels grouped by scene. Scenes without a panel are left out. */
export function buildStoryboardPdfData(input: StoryboardPdfInput): StoryboardPdfData {
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const locationNameById = new Map(input.locations.map((l) => [l.id, l.name]))
  const imagesByShot = new Map<string, StoryboardImage[]>()
  for (const image of input.images) {
    if (image.deleted_at) continue
    const list = imagesByShot.get(image.shot_id) ?? []
    list.push(image)
    imagesByShot.set(image.shot_id, list)
  }
  for (const list of imagesByShot.values()) list.sort((a, b) => a.sort_order - b.sort_order)

  const live = input.shots.filter((s) => !s.deleted_at)
  let orderedShots: Shot[]
  if (input.shotOrder) {
    const shotById = new Map(live.map((s) => [s.id, s]))
    const seen = new Set<string>()
    orderedShots = []
    for (const id of input.shotOrder) {
      const shot = shotById.get(id)
      if (shot && !seen.has(id)) {
        seen.add(id)
        orderedShots.push(shot)
      }
    }
  } else {
    const wanted = input.sceneIds ? new Set(input.sceneIds) : null
    const sceneOrder = sortScenesByNumber(input.scenes.filter((s) => !s.deleted_at && (!wanted || wanted.has(s.id))))
    orderedShots = sceneOrder.flatMap((scene) =>
      live
        .filter((s) => s.scene_id === scene.id)
        .sort((a, b) => a.shot_number.localeCompare(b.shot_number, undefined, { numeric: true }))
    )
  }

  const scenes: StoryboardPdfScene[] = []
  const sceneGroup = new Map<string, StoryboardPdfScene>()
  for (const shot of orderedShots) {
    const images = imagesByShot.get(shot.id) ?? []
    const scene = sceneById.get(shot.scene_id)
    if (images.length === 0 || !scene) continue
    let group = sceneGroup.get(scene.id)
    if (!group) {
      group = {
        sceneNumber: scene.scene_number,
        heading: sceneSlugline(scene, scene.location_id ? locationNameById.get(scene.location_id) : null),
        panels: [],
      }
      sceneGroup.set(scene.id, group)
      scenes.push(group)
    }
    const label = [`Shot ${shot.shot_number}`, shot.shot_size].filter(Boolean).join(SEP)
    images.forEach((image, i) => {
      group!.panels.push({
        caption: i === 0 ? label : `Shot ${shot.shot_number} (${i + 1})`,
        detail: i === 0 ? shot.shot_description?.trim() || shot.subject?.trim() || null : null,
        storageKey: image.storage_key,
      })
    })
  }

  return { productionName: input.productionName, scopeLabel: input.scopeLabel, scenes }
}

export interface StoryboardPdfOptions {
  /** Reads a panel's image bytes; a throw or null prints an empty frame instead. */
  readImage: (storageKey: string) => Promise<Uint8Array | null>
  paperSize?: PaperSize
  issuedAt?: Date
}

export async function generateStoryboardPdf(data: StoryboardPdfData, options: StoryboardPdfOptions): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ paper: options.paperSize ?? DEFAULT_PAPER_SIZE })
  let current: StoryboardPdfScene | null = null
  const sceneTitle = (scene: StoryboardPdfScene) =>
    [`Scene ${scene.sceneNumber}`, scene.heading].filter(Boolean).join(SEP)

  layout.onNewPage = (l) => {
    l.runningHeader(
      ['STORYBOARD', data.scopeLabel].join(SEP),
      current ? `${sceneTitle(current)} (cont'd)` : data.productionName
    )
  }

  layout.masthead({
    title: data.productionName,
    right: 'STORYBOARD',
    subLeft: data.scopeLabel,
    subRight: `Issued ${formatIssuedStamp(options.issuedAt ?? new Date())}`,
  })

  if (data.scenes.length === 0) {
    layout.gap(12)
    layout.text('No storyboard panels for this selection yet.', layout.xLeft, layout.y - 9, { color: COLOR_MUTED })
    layout.gap(20)
  }

  for (const scene of data.scenes) {
    current = scene
    const items = await Promise.all(
      scene.panels.map(async (panel) => {
        let bytes: Uint8Array | null = null
        try {
          bytes = await options.readImage(panel.storageKey)
        } catch {
          bytes = null
        }
        return {
          image: bytes ? await layout.embedImage(bytes) : null,
          caption: panel.caption,
          detail: panel.detail,
        }
      })
    )
    layout.sectionBar(sceneTitle(scene), 120)
    layout.imageGrid(items, PANELS_ACROSS)
  }

  layout.applyFooters({ left: [data.productionName, 'Storyboard', data.scopeLabel].join(SEP) })
  return layout.doc.save()
}
