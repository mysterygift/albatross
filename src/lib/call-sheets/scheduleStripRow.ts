import type { Person, StripboardStrip } from '@/lib/db/types'
import type { CallSheetStrip } from '@/lib/pdf/callSheet'
import { resolveSceneIdForStrip } from '@/lib/schedule/episodicScheduleDisplay'

/** INT/EXT + D/N in a compact call-sheet cell (no fabricated values). */
export function formatScheduleDnColumn(
  intExt: string | null | undefined,
  dayNight: string | null | undefined,
): string {
  const ie =
    intExt && String(intExt).trim() && intExt !== 'UNK' ? String(intExt).trim().slice(0, 4) : ''
  const dnRaw = dayNight ? String(dayNight).trim() : ''
  const dn =
    dnRaw === 'DAY'
      ? 'D'
      : dnRaw === 'NIGHT'
        ? 'N'
        : dnRaw === 'MIXED'
          ? 'M'
          : dnRaw === 'UNK'
            ? ''
            : dnRaw
              ? dnRaw.slice(0, 3)
              : ''
  if (ie && dn) return `${ie}/${dn}`
  if (ie) return ie
  if (dn) return dn
  return ''
}

/** Cast numbers when present, else very short name tokens; capped for PDF width. */
export function compactCastForScheduleRow(personIds: string[], people: Person[]): string {
  if (!personIds.length) return ''
  const list = personIds
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is Person => p != null && p.is_cast === 1)
  if (!list.length) return ''
  list.sort((a, b) => {
    const na = a.cast_number?.trim() ?? ''
    const nb = b.cast_number?.trim() ?? ''
    if (na !== nb) return na.localeCompare(nb, undefined, { numeric: true })
    return a.name.localeCompare(b.name)
  })
  const parts = list.map((p) => {
    const cn = p.cast_number?.trim()
    if (cn) return cn
    const bits = p.name.trim().split(/\s+/)
    if (bits.length >= 2) return `${bits[0]!.slice(0, 1)}.${bits[bits.length - 1]!.slice(0, 6)}`
    return p.name.slice(0, 8)
  })
  let s = parts.join(', ')
  if (s.length > 36) s = `${s.slice(0, 33)}…`
  return s
}

export type BuildScheduleStripContext = {
  castBySceneId: Map<string, string[]>
  castByShotId: Map<string, string[]>
  castPeople: Person[]
}

/** Resolve parent scene for stripboard rows (SHOT strips often omit scene_id). */
export function resolveSceneAndShotForStripboardStrip<
  TScene extends SceneLike,
  TShot extends ShotLike,
>(
  strip: Pick<StripboardStrip, 'strip_type' | 'scene_id' | 'shot_id'>,
  scenes: TScene[],
  shots: TShot[],
  sceneById?: Map<string, TScene>,
): { scene: TScene | null; shot: TShot | null } {
  const shotById = new Map(shots.map((h) => [h.id, h]))
  const shot = strip.shot_id ? (shotById.get(strip.shot_id) ?? null) : null
  const sceneId = resolveSceneIdForStrip(strip, shotById)
  const scene = sceneId
    ? (sceneById?.get(sceneId) ?? scenes.find((c) => c.id === sceneId) ?? null)
    : null
  return { scene, shot }
}

/**
 * Resolve cast person IDs for a strip: shot_cast when shot_id is set (else scene_cast for that shot’s scene);
 * otherwise scene_cast for scene_id.
 */
export function castPersonIdsForStrip(
  strip: { shot_id: string | null; scene_id: string | null },
  shotSceneId: string | null,
  ctx: BuildScheduleStripContext,
): string[] {
  if (strip.shot_id) {
    const fromShot = ctx.castByShotId.get(strip.shot_id)
    if (fromShot?.length) return fromShot
    if (shotSceneId) return ctx.castBySceneId.get(shotSceneId) ?? []
    return []
  }
  if (strip.scene_id) return ctx.castBySceneId.get(strip.scene_id) ?? []
  return []
}

type StripboardStripLike = {
  strip_type: string
  scene_id: string | null
  shot_id: string | null
  title: string | null
  description: string | null
  origin_location_id?: string | null
  destination_location_id?: string | null
  /** When set (e.g. otp / itp), row may be grouped under IF TIME PERMITS on call sheets. */
  color_tag?: string | null
}

function moveStripLocLabel(
  strip: Pick<StripboardStripLike, 'origin_location_id' | 'destination_location_id' | 'title'>,
  locationNameById: ReadonlyMap<string, string>
): string | null {
  const originName = strip.origin_location_id
    ? locationNameById.get(strip.origin_location_id) ?? null
    : null
  const destName = strip.destination_location_id
    ? locationNameById.get(strip.destination_location_id) ?? null
    : null
  if (originName && destName) return `${originName} → ${destName}`
  if (originName) return originName
  if (destName) return destName
  return strip.title?.trim() || null
}

/** Clear signal from existing strip fields only (no invented flags). */
export function stripboardStripSuggestsIfTimePermits(strip: StripboardStripLike): boolean {
  const tag = (strip.color_tag ?? '').trim().toLowerCase()
  if (tag === 'otp' || tag === 'itp' || tag === 'if_time_permits') return true
  if (strip.strip_type !== 'NOTE') return false
  const blob = [strip.title, strip.description].filter(Boolean).join(' ').toLowerCase()
  return /\bif\s+time\s+permits\b|\btime\s+permits\b|\bitp\b/.test(blob)
}

type SceneLike = {
  id: string
  scene_number: string
  heading: string | null
  title: string | null
  description: string | null
  int_ext: string | null
  day_night: string | null
  page_eighths: number | null
  location_id: string | null
}

type ShotLike = {
  id: string
  scene_id: string
  shot_number: string
  shot_description: string | null
  notes: string | null
}

/**
 * One stripboard row → call sheet schedule row. Preserves strip_type from the stripboard.
 * `locState.lastLocationId` tracks the last scene row that printed a concrete location (for ditto).
 */
export function buildCallSheetStripFromStripboard(
  strip: StripboardStripLike,
  scene: SceneLike | null,
  shot: ShotLike | null,
  locationName: string | null,
  locState: { lastLocationId: string | null },
  castIds: string[],
  castPeople: Person[],
  locationNameById: ReadonlyMap<string, string> = new Map(),
): CallSheetStrip {
  const st = strip.strip_type
  const ifTimePermits = stripboardStripSuggestsIfTimePermits(strip)

  if (st === 'CALL' || st === 'LUNCH' || st === 'WRAP' || st === 'NOTE' || st === 'MOVE') {
    const noteParts = [strip.title, strip.description].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    )
    const moveLoc = st === 'MOVE' ? moveStripLocLabel(strip, locationNameById) : null
    return {
      strip_type: st as CallSheetStrip['strip_type'],
      title: strip.title,
      description: strip.description,
      locLabel: moveLoc,
      locDitto: false,
      castCompact: null,
      rowNotes: noteParts.length ? noteParts.join(' — ').slice(0, 200) : null,
      ifTimePermits,
    }
  }

  const isShotOrScene = st === 'SHOT' || st === 'SCENE'
  if (!isShotOrScene) {
    return {
      strip_type: 'NOTE',
      title: strip.title,
      description: strip.description,
      locLabel: null,
      locDitto: false,
      castCompact: null,
      rowNotes: [strip.title, strip.description].filter(Boolean).join(' — ').slice(0, 200) || null,
      ifTimePermits,
    }
  }

  if (!scene) {
    return {
      strip_type: st === 'SHOT' ? 'SHOT' : 'SCENE',
      title: strip.title,
      description: strip.description,
      locLabel: null,
      locDitto: false,
      castCompact: null,
      rowNotes: [strip.title, strip.description].filter(Boolean).join(' — ').slice(0, 200) || null,
      ifTimePermits,
    }
  }

  let locLabel: string | null = null
  let locDitto = false
  if (scene.location_id && locationName?.trim()) {
    const id = scene.location_id
    const name = locationName.trim()
    if (locState.lastLocationId === id) {
      locDitto = true
    } else {
      locLabel = name.length > 16 ? `${name.slice(0, 15)}…` : name
      locState.lastLocationId = id
    }
  } else {
    locState.lastLocationId = null
  }

  const castCompact = compactCastForScheduleRow(castIds, castPeople)

  const shotDescription = shot?.shot_description?.trim() || null

  const noteParts =
    st === 'SHOT'
      ? [strip.description, shot?.notes].filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        )
      : [strip.description, shot?.notes, shot?.shot_description].filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        )
  const rowNotes = noteParts.length ? noteParts.join(' · ').slice(0, 200) : null

  return {
    strip_type: st === 'SHOT' ? 'SHOT' : 'SCENE',
    scene_number: scene.scene_number,
    scene_heading: scene.heading,
    scene_title: scene.title,
    scene_description: scene.description,
    int_ext: scene.int_ext,
    day_night: scene.day_night,
    page_eighths: scene.page_eighths,
    shot_number: shot?.shot_number ?? null,
    shot_description: shotDescription,
    title: strip.title,
    description: strip.description,
    locLabel,
    locDitto,
    castCompact: castCompact || null,
    rowNotes,
    ifTimePermits,
  }
}

/** SHOT DESCRIPTION column: scene title (or heading) then shot description on the next line. */
export function formatCallSheetSynopsis(s: CallSheetStrip): string {
  if (s.strip_type === 'SHOT') {
    const sceneLine = (s.scene_title?.trim() || s.scene_heading?.trim() || '') || ''
    const shotLine = s.shot_description?.trim() || ''
    if (sceneLine && shotLine) return `${sceneLine}\n${shotLine}`
    if (shotLine) return shotLine
    if (sceneLine) return sceneLine
    const fallback = [s.title, s.description].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    )
    return fallback.length ? fallback.join(' · ') : '—'
  }

  const parts = [s.scene_heading, s.scene_title, s.scene_description].filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  )
  if (parts.length) return parts.join(' · ')
  const fallback = [s.title, s.description].filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  )
  return fallback.length ? fallback.join(' · ') : '—'
}
