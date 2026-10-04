import type { RiskAssessmentStatus } from '@/lib/db/types'

export type RamsSignOffStatus = 'ok' | 'unapproved' | 'missing'

export type RamsCoverage = {
  status: RiskAssessmentStatus
  /** `shoot_day_unit_id`s this RAMS covers. */
  shoot_day_unit_ids: string[]
}

/**
 * Call sheet gate. `ramsList` is every RAMS on one shoot day.
 *
 * - `missing`: no RAMS covers the unit.
 * - `unapproved`: at least one RAMS covering the unit is still a draft.
 * - `ok`: every RAMS covering the unit is approved.
 *
 * With `shootDayUnitId === null` (a day with no unit rows) every RAMS on the day counts.
 */
export function getRamsSignOffStatus(
  ramsList: readonly RamsCoverage[],
  shootDayUnitId: string | null
): RamsSignOffStatus {
  const covering =
    shootDayUnitId == null
      ? ramsList
      : ramsList.filter((r) => r.shoot_day_unit_ids.includes(shootDayUnitId))
  if (covering.length === 0) return 'missing'
  return covering.every((r) => r.status === 'approved') ? 'ok' : 'unapproved'
}

/** User-facing copy for the call sheet warning; `null` when nothing is wrong. */
export function describeRamsSignOff(
  status: RamsSignOffStatus,
  unitName: string
): { title: string; detail: string } | null {
  if (status === 'unapproved') {
    return {
      title: 'RAMS not signed off',
      detail: `The risk assessment for ${unitName} on this day is still a draft.`,
    }
  }
  if (status === 'missing') {
    return {
      title: 'No RAMS covers this unit',
      detail: `There is no risk assessment for ${unitName} on this day.`,
    }
  }
  return null
}
