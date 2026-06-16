import { extractLocationFromSlug } from '@/lib/script-parser/common'
import type { ParsedScene } from '@/lib/script-parser'
import type { DayNight, IntExt } from '@/lib/script-parser/types'
import { normalizeLocationKey } from '@/lib/db/scriptImportLocationService'
import type { Location } from '@/lib/db/types'

export type ImportSceneDraft = ParsedScene & { id: string }

export type ImportLocationGroup = {
  canonicalKey: string
  rawVariants: string[]
  sceneIds: string[]
  matchesExistingLocation: Location | null
}

export type SceneSlugFieldPatch = {
  scene_number?: string
  int_ext?: IntExt | null
  location?: string | null
  day_night?: DayNight | null
}

/** Attaches stable ids for editable pre-import review rows. */
export function toImportSceneDrafts(parsed: ParsedScene[]): ImportSceneDraft[] {
  return parsed.map((scene) => ({
    ...scene,
    id: crypto.randomUUID(),
  }))
}

/** Single source of truth for the location name used during import resolution. */
export function effectiveParsedLocation(
  scene: Pick<ParsedScene, 'location' | 'title'>
): string | null {
  const fromField = scene.location?.trim()
  if (fromField) return fromField
  return extractLocationFromSlug(scene.title)
}

function buildSlugTitle(location: string | null | undefined, dayNight: DayNight | null | undefined): string {
  const loc = location?.trim() ?? ''
  const day = dayNight?.trim()
  if (loc && day) return `${loc} - ${day}`
  return loc || day || ''
}

/** Applies header field edits and keeps `title` in sync with location + time of day. */
export function syncSceneSlugFields(
  draft: ImportSceneDraft,
  patch: SceneSlugFieldPatch
): ImportSceneDraft {
  const sceneNumber = patch.scene_number !== undefined ? patch.scene_number.trim() : draft.scene_number
  const intExt = patch.int_ext !== undefined ? patch.int_ext : draft.int_ext
  const location =
    patch.location !== undefined ? (patch.location?.trim() || null) : (draft.location?.trim() || null)
  const dayNight =
    patch.day_night !== undefined ? patch.day_night : draft.day_night

  return {
    ...draft,
    scene_number: sceneNumber,
    int_ext: intExt ?? null,
    location,
    day_night: dayNight ?? null,
    title: buildSlugTitle(location, dayNight ?? null),
  }
}

/** Strips review-only id before persistence. */
export function draftToParsedScene(draft: ImportSceneDraft): ParsedScene {
  const { id: _id, ...parsed } = draft
  return parsed
}

/** Groups import drafts by normalized location for duplicate detection and merge UI. */
export function analyzeImportLocations(
  drafts: ImportSceneDraft[],
  existingLocations: Location[] = []
): ImportLocationGroup[] {
  const existingByKey = new Map<string, Location>()
  for (const loc of existingLocations) {
    existingByKey.set(normalizeLocationKey(loc.name), loc)
  }

  const groups = new Map<
    string,
    { rawVariants: Set<string>; sceneIds: string[] }
  >()

  for (const draft of drafts) {
    const raw = effectiveParsedLocation(draft)
    if (!raw) continue
    const key = normalizeLocationKey(raw)
    let group = groups.get(key)
    if (!group) {
      group = { rawVariants: new Set<string>(), sceneIds: [] }
      groups.set(key, group)
    }
    group.rawVariants.add(raw)
    group.sceneIds.push(draft.id)
  }

  return [...groups.entries()]
    .map(([canonicalKey, { rawVariants, sceneIds }]) => ({
      canonicalKey,
      rawVariants: [...rawVariants].sort(),
      sceneIds,
      matchesExistingLocation: existingByKey.get(canonicalKey) ?? null,
    }))
    .sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey))
}

/** True when any location group has multiple raw spellings for the same normalized key. */
export function hasLocationSpellingVariants(groups: ImportLocationGroup[]): boolean {
  return groups.some((group) => group.rawVariants.length > 1)
}

/** Sets the same canonical location name on all scenes in a merge group. */
export function applyLocationMergeToDrafts(
  drafts: ImportSceneDraft[],
  sceneIds: string[],
  canonicalLocationName: string
): ImportSceneDraft[] {
  const idSet = new Set(sceneIds)
  return drafts.map((draft) => {
    if (!idSet.has(draft.id)) return draft
    return syncSceneSlugFields(draft, { location: canonicalLocationName })
  })
}
