import type { FirstAider, HazardContent } from '@/lib/db/types'
import { clampRating } from '@/lib/risk-assessments/riskMatrix'

/** A hazard as edited / saved: content plus optional persisted id. */
export type HazardInput = HazardContent & { id?: string }

/** Everything about a RAMS that counts as "content" for sign-off (status fields excluded). */
export type RiskAssessmentContent = {
  shoot_day_id: string
  shoot_day_unit_ids: string[]
  location_id: string | null
  location_name: string
  activities: string
  responsible_person_id: string | null
  responsible_person_name: string
  first_aiders: FirstAider[]
  hospital_name: string
  hospital_address: string
  hospital_phone: string
  police_name: string
  police_address: string
  police_phone: string
  hazards: HazardContent[]
}

export function emptyFirstAider(): FirstAider {
  return { name: '', phone: '', email: '' }
}

export function parseFirstAiders(json: string | null | undefined): FirstAider[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p): p is Record<string, unknown> => p != null && typeof p === 'object')
      .map((p) => ({
        name: typeof p.name === 'string' ? p.name : '',
        phone: typeof p.phone === 'string' ? p.phone : '',
        email: typeof p.email === 'string' ? p.email : '',
      }))
  } catch {
    return []
  }
}

/** Serialises first aiders, dropping completely blank rows. `null` when there are none. */
export function serializeFirstAiders(list: readonly FirstAider[]): string | null {
  const cleaned = list
    .map((a) => ({ name: a.name.trim(), phone: a.phone.trim(), email: a.email.trim() }))
    .filter((a) => a.name || a.phone || a.email)
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null
}

/** A new blank hazard with sensible default ratings. */
export function blankHazard(): HazardContent {
  return {
    name: '',
    description: '',
    risks: '',
    outcomes: '',
    control_measures: '',
    at_risk_crew: 1,
    at_risk_cast: 0,
    at_risk_public: 0,
    severity_before: 3,
    probability_before: 3,
    severity_after: 2,
    probability_after: 2,
  }
}

/** Only the hazard content fields (drops ids / keys), e.g. when adding a template to a RAMS. */
export function hazardContent(h: HazardContent): HazardContent {
  return {
    name: h.name,
    description: h.description,
    risks: h.risks,
    outcomes: h.outcomes,
    control_measures: h.control_measures,
    at_risk_crew: h.at_risk_crew,
    at_risk_cast: h.at_risk_cast,
    at_risk_public: h.at_risk_public,
    severity_before: h.severity_before,
    probability_before: h.probability_before,
    severity_after: h.severity_after,
    probability_after: h.probability_after,
  }
}

export function normalizeHazard(h: HazardContent): HazardContent {
  return {
    name: h.name.trim(),
    description: h.description.trim(),
    risks: h.risks.trim(),
    outcomes: h.outcomes.trim(),
    control_measures: h.control_measures.trim(),
    at_risk_crew: h.at_risk_crew ? 1 : 0,
    at_risk_cast: h.at_risk_cast ? 1 : 0,
    at_risk_public: h.at_risk_public ? 1 : 0,
    severity_before: clampRating(h.severity_before, 3),
    probability_before: clampRating(h.probability_before, 3),
    severity_after: clampRating(h.severity_after, 2),
    probability_after: clampRating(h.probability_after, 2),
  }
}

/**
 * Stable string for comparing RAMS content. Unit order is irrelevant; hazard order is not.
 * Used to decide whether a save of an approved RAMS changed anything (and so reverts to draft).
 */
export function riskAssessmentContentSignature(c: RiskAssessmentContent): string {
  return JSON.stringify({
    d: c.shoot_day_id,
    u: [...new Set(c.shoot_day_unit_ids)].sort(),
    li: c.location_id ?? null,
    ln: c.location_name.trim(),
    a: c.activities.trim(),
    pi: c.responsible_person_id ?? null,
    pn: c.responsible_person_name.trim(),
    fa: parseFirstAiders(serializeFirstAiders(c.first_aiders)),
    h: [c.hospital_name, c.hospital_address, c.hospital_phone].map((v) => v.trim()),
    p: [c.police_name, c.police_address, c.police_phone].map((v) => v.trim()),
    hz: c.hazards.map(normalizeHazard),
  })
}

/** Splits a multi-line field into trimmed, non-empty lines (bullets stripped). */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}
