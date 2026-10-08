import type { CallSheetCastRow } from '@/lib/call-sheets/castRequirements'
import type { CallSheetCrewGroup } from '@/lib/call-sheets/crewRequirements'

/** A cast or crew member called on a shoot day + unit, as a recipient of personalised paperwork. */
export type DayRecipient = {
  /** `cast-<personId>` or `crew-<personId>` (see `personIdFromRecipient`). */
  id: string
  personId: string
  fullName: string
  type: 'cast' | 'crew'
  email: string | null
  /** Cast only. */
  agentEmail: string | null
}

/**
 * Recipients for a day + unit: the called cast (in cast-number order) then crew (department
 * order). A person listed as both keeps their first entry.
 */
export function buildDayRecipients(castRows: CallSheetCastRow[], crewGroups: CallSheetCrewGroup[]): DayRecipient[] {
  const all: DayRecipient[] = [
    ...castRows.map((row) => ({
      id: `cast-${row.person_id}`,
      personId: row.person_id,
      fullName: row.name,
      type: 'cast' as const,
      email: row.email?.trim() || null,
      agentEmail: row.agent_email?.trim() || null,
    })),
    ...crewGroups.flatMap((group) =>
      group.rows.map((row) => ({
        id: `crew-${row.person_id}`,
        personId: row.person_id,
        fullName: row.name,
        type: 'crew' as const,
        email: row.email?.trim() || null,
        agentEmail: null,
      }))
    ),
  ]
  const byId = new Map<string, DayRecipient>()
  for (const r of all) if (!byId.has(r.id)) byId.set(r.id, r)
  return [...byId.values()]
}
