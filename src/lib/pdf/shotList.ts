/**
 * Shot list PDF: one section per scene with every shot's camera details, matching the columns of
 * the Shot List page. `buildShotListPdfData` is pure; callers load the rows.
 */
import {
  castPersonIdsForStrip,
  compactCastForScheduleRow,
  type BuildScheduleStripContext,
} from '@/lib/call-sheets/scheduleStripRow'
import type { Location, Person, Scene, Shot } from '@/lib/db/types'
import {
  COLOR_MUTED,
  DEFAULT_PAPER_SIZE,
  PdfLayout,
  formatIssuedStamp,
  type PaperSize,
  type TableCell,
  type TableColumn,
} from '@/lib/pdf/layoutKit'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import { sortScenesByNumber } from '@/lib/schedule/sceneFields'

const SEP = ' | '
const TABLE_FONT = 7
const EMPTY_CELL = '-'

const COLUMNS: TableColumn[] = [
  { header: 'Shot', weight: 30 },
  { header: 'Subject', weight: 62 },
  { header: 'Description', weight: 112 },
  { header: 'Size', weight: 28, align: 'center' },
  { header: 'Movement', weight: 50 },
  { header: 'Lens', weight: 34 },
  { header: 'Support', weight: 46 },
  { header: 'Dur.', weight: 28, align: 'right' },
  { header: 'Est. min', weight: 28, align: 'right' },
  { header: 'Cast', weight: 48 },
  { header: 'Notes', weight: 74 },
]

/** Shot duration as `m:ss`, or an em dash when unknown (as on the Shot List page). */
export function formatShotDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export type ShotListPdfShot = {
  shotNumber: string
  subject: string | null
  description: string | null
  size: string | null
  movement: string | null
  lens: string | null
  support: string | null
  duration: string | null
  estimatedMinutes: number | null
  cast: string | null
  notes: string | null
}

export type ShotListPdfScene = {
  sceneNumber: string
  /** Slugline, e.g. `INT. KITCHEN - DAY`, else the scene title. */
  heading: string | null
  shots: ShotListPdfShot[]
}

export type ShotListPdfData = {
  productionName: string
  /** e.g. `All scenes`, `Scene 12` or `Day 3 | Main Unit`. */
  scopeLabel: string
  scenes: ShotListPdfScene[]
}

export type ShotListPdfInput = {
  productionName: string
  scopeLabel: string
  scenes: Scene[]
  shots: Shot[]
  locations: Pick<Location, 'id' | 'name'>[]
  castPeople: Person[]
  castBySceneId: Map<string, string[]>
  castByShotId: Map<string, string[]>
  /**
   * Shot ids in the order to print them (e.g. strip order for a shoot day). Shots are grouped under
   * their scene, scenes in order of first appearance. Without it, `sceneIds` (or every scene) are
   * printed in scene-number order with shots in shot-number order.
   */
  shotOrder?: string[]
  sceneIds?: string[]
}

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function buildShotListPdfData(input: ShotListPdfInput): ShotListPdfData {
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const locationNameById = new Map(input.locations.map((l) => [l.id, l.name]))
  const castCtx: BuildScheduleStripContext = {
    castBySceneId: input.castBySceneId,
    castByShotId: input.castByShotId,
    castPeople: input.castPeople,
  }
  const live = input.shots.filter((s) => !s.deleted_at)

  const groups: Array<{ scene: Scene; shots: Shot[] }> = []
  if (input.shotOrder) {
    const shotById = new Map(live.map((s) => [s.id, s]))
    const groupBySceneId = new Map<string, { scene: Scene; shots: Shot[] }>()
    for (const shotId of input.shotOrder) {
      const shot = shotById.get(shotId)
      const scene = shot ? sceneById.get(shot.scene_id) : undefined
      if (!shot || !scene) continue
      let group = groupBySceneId.get(scene.id)
      if (!group) {
        group = { scene, shots: [] }
        groupBySceneId.set(scene.id, group)
        groups.push(group)
      }
      if (!group.shots.includes(shot)) group.shots.push(shot)
    }
  } else {
    const wanted = input.sceneIds ? new Set(input.sceneIds) : null
    const scenes = sortScenesByNumber(input.scenes.filter((s) => !s.deleted_at && (!wanted || wanted.has(s.id))))
    for (const scene of scenes) {
      const shots = live
        .filter((s) => s.scene_id === scene.id)
        .sort((a, b) => a.shot_number.localeCompare(b.shot_number, undefined, { numeric: true }))
      groups.push({ scene, shots })
    }
  }

  return {
    productionName: input.productionName,
    scopeLabel: input.scopeLabel,
    scenes: groups.map(({ scene, shots }) => ({
      sceneNumber: scene.scene_number,
      heading: sceneSlugline(scene, scene.location_id ? locationNameById.get(scene.location_id) : null),
      shots: shots.map((shot) => ({
        shotNumber: shot.shot_number,
        subject: present(shot.subject),
        description: present(shot.shot_description),
        size: shot.shot_size,
        movement: shot.camera_movement,
        lens: present(shot.lens),
        support: present(shot.support),
        duration: shot.duration_seconds != null ? formatShotDuration(shot.duration_seconds) : null,
        estimatedMinutes: shot.estimated_shoot_minutes,
        cast:
          present(
            compactCastForScheduleRow(
              castPersonIdsForStrip({ shot_id: shot.id, scene_id: null }, shot.scene_id, castCtx),
              input.castPeople
            )
          ) ?? null,
        notes: present(shot.notes),
      })),
    })),
  }
}

function cell(value: string | number | null): TableCell {
  return value == null || value === '' ? { text: EMPTY_CELL, color: COLOR_MUTED } : String(value)
}

export interface ShotListPdfOptions {
  paperSize?: PaperSize
  issuedAt?: Date
}

export async function generateShotListPdf(data: ShotListPdfData, options: ShotListPdfOptions = {}): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ paper: options.paperSize ?? DEFAULT_PAPER_SIZE })
  let current: ShotListPdfScene | null = null
  const sceneTitle = (scene: ShotListPdfScene) =>
    [`Scene ${scene.sceneNumber}`, scene.heading].filter(Boolean).join(SEP)

  layout.onNewPage = (l) => {
    l.runningHeader(
      ['SHOT LIST', data.scopeLabel].join(SEP),
      current ? `${sceneTitle(current)} (cont'd)` : data.productionName
    )
  }

  layout.masthead({
    title: data.productionName,
    right: 'SHOT LIST',
    subLeft: data.scopeLabel,
    subRight: `Issued ${formatIssuedStamp(options.issuedAt ?? new Date())}`,
  })

  const total = data.scenes.reduce((sum, s) => sum + s.shots.length, 0)
  if (total === 0) {
    layout.gap(12)
    layout.text('No shots for this selection yet.', layout.xLeft, layout.y - 9, { color: COLOR_MUTED })
    layout.gap(20)
  }

  for (const scene of data.scenes) {
    if (scene.shots.length === 0) continue
    current = scene
    layout.sectionBar(sceneTitle(scene), 50)
    layout.table({
      columns: COLUMNS,
      fontSize: TABLE_FONT,
      rows: scene.shots.map((shot) => [
        { text: shot.shotNumber, bold: true },
        cell(shot.subject),
        cell(shot.description),
        cell(shot.size),
        cell(shot.movement),
        cell(shot.lens),
        cell(shot.support),
        cell(shot.duration),
        cell(shot.estimatedMinutes),
        cell(shot.cast),
        cell(shot.notes),
      ]),
    })
  }

  layout.applyFooters({ left: [data.productionName, 'Shot list', data.scopeLabel].join(SEP) })
  return layout.doc.save()
}
