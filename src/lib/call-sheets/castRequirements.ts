/**
 * Call-sheet cast requirements: read-only service that derives which cast are required
 * for a shoot day/unit, which are booked, and the final call-sheet cast list (required AND booked only).
 *
 * Rules (documented):
 * A) Required cast: attached to at least one scheduled shot on that unit/day via shot_cast,
 *    OR (when no shot-level participation for the scheduled material) attached to at least one
 *    scheduled scene via scene_cast. Prefer shot_cast when scheduled shots exist; else scene_cast.
 * B) Booked cast: has a booking for that shoot day.
 * C) Final cast on call sheet: required AND booked only. Unbooked required cast must NOT appear.
 * D) Required but not booked: surfaced as warning; excluded from final list.
 * E) Booked but not required: surfaced as warning/info.
 *
 * No bookings are auto-created. DooD is unchanged.
 */

import type { Person } from '@/lib/db/types'

export type CallSheetCastRow = {
  person_id: string
  cast_number: string | null
  name: string
  phone: string | null
  email: string | null
  agent_name: string | null
  agent_email: string | null
  agent_phone: string | null
  source: 'shot' | 'scene'
}

export type CallSheetCastWarning = {
  person_id: string
  name: string
  cast_number: string | null
  source?: 'shot' | 'scene'
}

export type CallSheetCastResult = {
  /** Final cast to show on call sheet: required AND booked only, sorted by cast_number then name. */
  castRows: CallSheetCastRow[]
  /** Required by scheduled material but not booked; exclude from PDF. */
  requiredButNotBooked: CallSheetCastWarning[]
  /** Booked but not required by scheduled material. */
  bookedButNotRequired: CallSheetCastWarning[]
}

/**
 * Sort key: cast_number ascending (null/empty last or first? Spec says "cast_number ascending where present,
 * fallback to name ascending where cast_number is null". So: sort by (cast_number ?? '') then name.
 * Numeric sort for cast_number would be nicer but cast_number can be "1", "1A", "2" - so string sort is fine.
 */
function sortCastRows(rows: CallSheetCastRow[]): CallSheetCastRow[] {
  return [...rows].sort((a, b) => {
    const na = a.cast_number?.trim() ?? ''
    const nb = b.cast_number?.trim() ?? ''
    if (na !== nb) return na.localeCompare(nb, undefined, { numeric: true })
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

function personToWarning(p: Person, source?: 'shot' | 'scene'): CallSheetCastWarning {
  return {
    person_id: p.id,
    name: p.name,
    cast_number: p.cast_number ?? null,
    source,
  }
}

function personToRow(p: Person, source: 'shot' | 'scene'): CallSheetCastRow {
  return {
    person_id: p.id,
    cast_number: p.cast_number ?? null,
    name: p.name,
    phone: p.phone ?? null,
    email: p.email ?? null,
    agent_name: p.agent_name ?? null,
    agent_email: p.agent_email ?? null,
    agent_phone: p.agent_phone ?? null,
    source,
  }
}

/**
 * Compute call-sheet cast requirements for a shoot day / unit.
 * Deterministic; no DB writes. Uses shot_cast when scheduled shots exist; else scene_cast.
 */
export function getCallSheetCastRequirements(input: {
  sceneIdsScheduled: string[]
  shotIdsScheduled: string[]
  castBySceneId: Map<string, string[]>
  castByShotId: Map<string, string[]>
  bookedPersonIds: Set<string>
  cast: Person[]
}): CallSheetCastResult {
  const { castBySceneId, castByShotId, bookedPersonIds, cast } = input
  const castById = new Map(cast.map((p) => [p.id, p]))

  // A) Required: from shot_cast when scheduled shots exist, else from scene_cast
  const requiredPersonIds = new Set<string>()
  const requiredSource = new Map<string, 'shot' | 'scene'>()

  if (input.shotIdsScheduled.length > 0) {
    for (const shotId of input.shotIdsScheduled) {
      for (const pid of castByShotId.get(shotId) ?? []) {
        requiredPersonIds.add(pid)
        requiredSource.set(pid, 'shot')
      }
    }
  } else {
    for (const sceneId of input.sceneIdsScheduled) {
      for (const pid of castBySceneId.get(sceneId) ?? []) {
        requiredPersonIds.add(pid)
        requiredSource.set(pid, 'scene')
      }
    }
  }

  // C) Final call-sheet cast = required AND booked only
  const calledPersonIds = new Set<string>()
  for (const pid of requiredPersonIds) {
    if (bookedPersonIds.has(pid)) calledPersonIds.add(pid)
  }

  const castRows: CallSheetCastRow[] = []
  for (const pid of calledPersonIds) {
    const p = castById.get(pid)
    if (p) castRows.push(personToRow(p, requiredSource.get(pid) ?? 'scene'))
  }

  // D) Required but not booked
  const requiredButNotBooked: CallSheetCastWarning[] = []
  for (const pid of requiredPersonIds) {
    if (!bookedPersonIds.has(pid)) {
      const p = castById.get(pid)
      if (p) requiredButNotBooked.push(personToWarning(p, requiredSource.get(pid)))
    }
  }

  // E) Booked but not required
  const bookedButNotRequired: CallSheetCastWarning[] = []
  for (const pid of bookedPersonIds) {
    if (!requiredPersonIds.has(pid)) {
      const p = castById.get(pid)
      if (p) bookedButNotRequired.push(personToWarning(p))
    }
  }

  return {
    castRows: sortCastRows(castRows),
    requiredButNotBooked,
    bookedButNotRequired,
  }
}

/**
 * Helper: extract cast-called names in order for PDF (current contract is string[]).
 */
export function getCastCalledNames(castRows: CallSheetCastRow[]): string[] {
  return castRows.map((r) => r.name)
}
