/**
 * Whether a breakdown element has been sourced, judged against the production's own data:
 *
 *  - Locations   → Locations: found and booked (or wrapped) = sourced; found but on hold / unbooked = partial.
 *  - Cast        → cast members by character (role) name, then by name: found = sourced, partial while they
 *                  are missing from the cast list of a scene the element is tagged in.
 *  - Lighting    → Equipment in the lighting categories: found = sourced.
 *  - Foley/Music → Music tracks: found = sourced, partial while a clearance for the track is not granted.
 *  - Everything else has no database yet and uses the element's manual status.
 *
 * An element linked to a row uses that row. Otherwise an exact name match is used automatically (and offered
 * as a link); looser matches are only suggestions. Marking an element sourced by hand always wins, so a
 * producer can sign off a location on hold. Pure; adding a database for another category means adding a
 * matcher here.
 */
import type {
  BreakdownCategory,
  BreakdownElement,
  BreakdownLinkedEntityType,
  Clearance,
  Equipment,
  Location,
  MusicTrack,
  Person,
} from '@/lib/db/types'
import { bestMatches } from '@/lib/text/similarity'

export type BreakdownStatus = 'sourced' | 'partial' | 'needed'

export const BREAKDOWN_STATUS_LABEL: Record<BreakdownStatus, string> = {
  sourced: 'Sourced',
  partial: 'In progress',
  needed: 'Needed',
}

export type MatchedEntity = {
  type: BreakdownLinkedEntityType
  id: string
  name: string
}

export type ElementMatch = {
  status: BreakdownStatus
  /** What decided the status. */
  source: 'linked' | 'auto' | 'manual'
  /** The row the element is linked or automatically matched to. */
  entity: MatchedEntity | null
  /** Loose matches worth offering as a link (excludes `entity`). */
  suggestions: MatchedEntity[]
  /** One line on why, e.g. "On Locations · on hold". */
  detail: string
  /** Scenes the element is tagged in whose cast list does not include the matched cast member. */
  missingFromSceneIds: string[]
}

export type BreakdownMatchData = {
  locations: readonly Location[]
  cast: readonly Person[]
  equipment: readonly Equipment[]
  musicTracks: readonly MusicTrack[]
  clearances: readonly Clearance[]
  /** scene_cast person ids per scene. */
  castIdsBySceneId: ReadonlyMap<string, readonly string[]>
}

export const LINKED_ENTITY_TYPE_FOR_CATEGORY: Partial<Record<BreakdownCategory, BreakdownLinkedEntityType>> = {
  cast: 'person',
  locations: 'location',
  lighting: 'equipment',
  foley_music: 'music_track',
}

export const LINKED_ENTITY_LABEL: Record<BreakdownLinkedEntityType, string> = {
  location: 'Locations',
  person: 'Cast',
  equipment: 'Equipment',
  music_track: 'Music',
}

const LIGHTING_CATEGORIES = new Set(['lighting', 'lighting_accessories'])

type Candidate = MatchedEntity & { aliases: string[] }

function candidatesFor(category: BreakdownCategory, data: BreakdownMatchData): Candidate[] {
  switch (category) {
    case 'locations':
      return data.locations.map((l) => ({ type: 'location', id: l.id, name: l.name, aliases: [l.name] }))
    case 'cast':
      return data.cast.map((p) => ({
        type: 'person',
        id: p.id,
        name: p.role_name?.trim() ? `${p.role_name} (${p.name})` : p.name,
        aliases: [p.role_name ?? '', p.name].filter((s) => s.trim()),
      }))
    case 'lighting':
      return data.equipment
        .filter((e) => LIGHTING_CATEGORIES.has(e.category))
        .map((e) => ({ type: 'equipment', id: e.id, name: e.name, aliases: [e.name] }))
    case 'foley_music':
      return data.musicTracks.map((t) => ({
        type: 'music_track',
        id: t.id,
        name: t.artist ? `${t.title} – ${t.artist}` : t.title,
        aliases: [t.title],
      }))
    default:
      return []
  }
}

/** Status and detail a matched row gives the element. */
function judgeEntity(
  entity: Candidate,
  sceneIds: readonly string[],
  data: BreakdownMatchData
): { status: BreakdownStatus; detail: string; missingFromSceneIds: string[] } {
  const where = `On ${LINKED_ENTITY_LABEL[entity.type]}`
  switch (entity.type) {
    case 'location': {
      const loc = data.locations.find((l) => l.id === entity.id)!
      if (loc.booked_status === 'booked' || loc.booked_status === 'wrap') {
        return { status: 'sourced', detail: `${where} · ${loc.booked_status === 'wrap' ? 'wrapped' : 'booked'}`, missingFromSceneIds: [] }
      }
      return { status: 'partial', detail: `${where} · ${loc.booked_status === 'hold' ? 'on hold' : 'not booked'}`, missingFromSceneIds: [] }
    }
    case 'person': {
      const missing = sceneIds.filter((sid) => !(data.castIdsBySceneId.get(sid) ?? []).includes(entity.id))
      if (missing.length > 0) {
        return {
          status: 'partial',
          detail: `${where} · not in the cast list of ${missing.length === 1 ? '1 tagged scene' : `${missing.length} tagged scenes`}`,
          missingFromSceneIds: missing,
        }
      }
      return { status: 'sourced', detail: `${where} · in every tagged scene`, missingFromSceneIds: [] }
    }
    case 'equipment':
      return { status: 'sourced', detail: `${where}`, missingFromSceneIds: [] }
    case 'music_track': {
      const clearances = data.clearances.filter((c) => c.type === 'music' && c.item_id === entity.id)
      if (clearances.length > 0 && !clearances.some((c) => c.granted_at)) {
        return { status: 'partial', detail: `${where} · clearance not granted`, missingFromSceneIds: [] }
      }
      return { status: 'sourced', detail: clearances.length > 0 ? `${where} · cleared` : where, missingFromSceneIds: [] }
    }
  }
}

function strip(c: Candidate): MatchedEntity {
  return { type: c.type, id: c.id, name: c.name }
}

/** Sourced state of one element tagged in `sceneIds`. */
export function matchBreakdownElement(
  element: Pick<BreakdownElement, 'category' | 'name' | 'manual_status' | 'linked_entity_type' | 'linked_entity_id'>,
  sceneIds: readonly string[],
  data: BreakdownMatchData
): ElementMatch {
  const manualSourced = element.manual_status === 'sourced'
  const candidates = candidatesFor(element.category, data)

  let entity: Candidate | null = null
  let source: ElementMatch['source'] = 'manual'
  let linkLost = false
  if (element.linked_entity_type && element.linked_entity_id) {
    entity = candidates.find((c) => c.type === element.linked_entity_type && c.id === element.linked_entity_id) ?? null
    if (entity) source = 'linked'
    else linkLost = true
  }

  const scored = new Map<string, { c: Candidate; score: number; exact: boolean }>()
  for (const alias of [0, 1]) {
    for (const m of bestMatches(element.name, candidates, (c) => c.aliases[alias])) {
      const prev = scored.get(m.item.id)
      if (!prev || m.score > prev.score) scored.set(m.item.id, { c: m.item, score: m.score, exact: m.exact })
    }
  }
  const ranked = [...scored.values()].sort((a, b) => b.score - a.score)
  if (!entity) {
    const exact = ranked.filter((r) => r.exact)
    // Only an unambiguous exact match decides the status on its own.
    if (exact.length === 1) {
      entity = exact[0]!.c
      source = 'auto'
    }
  }
  const suggestions = ranked.filter((r) => r.c.id !== entity?.id).slice(0, 3).map((r) => strip(r.c))

  if (entity) {
    const judged = judgeEntity(entity, sceneIds, data)
    return {
      status: manualSourced ? 'sourced' : judged.status,
      source,
      entity: strip(entity),
      suggestions,
      detail: manualSourced && judged.status !== 'sourced' ? `${judged.detail} · marked sourced` : judged.detail,
      missingFromSceneIds: judged.missingFromSceneIds,
    }
  }
  const linkType = LINKED_ENTITY_TYPE_FOR_CATEGORY[element.category]
  const detail = linkLost
    ? 'The linked row was removed'
    : manualSourced
      ? 'Marked sourced'
      : linkType
        ? `Not found on ${LINKED_ENTITY_LABEL[linkType]}`
        : 'Not sourced yet'
  return {
    status: manualSourced ? 'sourced' : 'needed',
    source: 'manual',
    entity: null,
    suggestions,
    detail,
    missingFromSceneIds: [],
  }
}
