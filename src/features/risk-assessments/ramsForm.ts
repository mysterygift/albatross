import { z } from 'zod'
import type { RiskAssessmentFull, RiskAssessmentInput } from '@/lib/db/repositories/risk-assessments'
import type { HazardContent } from '@/lib/db/types'

const rating = z.number().int().min(1).max(5)

export const hazardFormSchema = z.object({
  /** Persisted id; kept as a value (field array uses `fieldKey` for React keys). */
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Name the hazard'),
  description: z.string(),
  risks: z.string(),
  outcomes: z.string(),
  control_measures: z.string(),
  at_risk_crew: z.boolean(),
  at_risk_cast: z.boolean(),
  at_risk_public: z.boolean(),
  severity_before: rating,
  probability_before: rating,
  severity_after: rating,
  probability_after: rating,
})

export const ramsFormSchema = z.object({
  shoot_day_id: z.string().min(1, 'Choose a shoot day'),
  shoot_day_unit_ids: z.array(z.string()).min(1, 'Select at least one unit'),
  location_id: z.string().nullable(),
  location_name: z.string(),
  activities: z.string(),
  responsible_person_id: z.string().nullable(),
  responsible_person_name: z.string(),
  first_aiders: z.array(
    z.object({ name: z.string(), phone: z.string(), email: z.string() })
  ),
  hospital_name: z.string(),
  hospital_address: z.string(),
  hospital_phone: z.string(),
  police_name: z.string(),
  police_address: z.string(),
  police_phone: z.string(),
  hazards: z.array(hazardFormSchema),
})

export type RamsFormValues = z.infer<typeof ramsFormSchema>
export type HazardFormValues = z.infer<typeof hazardFormSchema>

export function hazardToForm(h: HazardContent & { id?: string }): HazardFormValues {
  return {
    ...(h.id ? { id: h.id } : {}),
    name: h.name,
    description: h.description,
    risks: h.risks,
    outcomes: h.outcomes,
    control_measures: h.control_measures,
    at_risk_crew: !!h.at_risk_crew,
    at_risk_cast: !!h.at_risk_cast,
    at_risk_public: !!h.at_risk_public,
    severity_before: h.severity_before,
    probability_before: h.probability_before,
    severity_after: h.severity_after,
    probability_after: h.probability_after,
  }
}

export function hazardFromForm(h: HazardFormValues): HazardContent & { id?: string } {
  return {
    ...(h.id ? { id: h.id } : {}),
    name: h.name,
    description: h.description,
    risks: h.risks,
    outcomes: h.outcomes,
    control_measures: h.control_measures,
    at_risk_crew: h.at_risk_crew ? 1 : 0,
    at_risk_cast: h.at_risk_cast ? 1 : 0,
    at_risk_public: h.at_risk_public ? 1 : 0,
    severity_before: h.severity_before,
    probability_before: h.probability_before,
    severity_after: h.severity_after,
    probability_after: h.probability_after,
  }
}

export function toFormValues(ra: RiskAssessmentFull): RamsFormValues {
  return {
    shoot_day_id: ra.shoot_day_id,
    shoot_day_unit_ids: ra.shoot_day_unit_ids,
    location_id: ra.location_id,
    location_name: ra.location_name,
    activities: ra.activities,
    responsible_person_id: ra.responsible_person_id,
    responsible_person_name: ra.responsible_person_name,
    first_aiders: ra.first_aiders,
    hospital_name: ra.hospital_name ?? '',
    hospital_address: ra.hospital_address ?? '',
    hospital_phone: ra.hospital_phone ?? '',
    police_name: ra.police_name ?? '',
    police_address: ra.police_address ?? '',
    police_phone: ra.police_phone ?? '',
    hazards: ra.hazards.map(hazardToForm),
  }
}

export function toSaveInput(
  values: RamsFormValues,
  ids: { id: string; production_id: string }
): RiskAssessmentInput {
  return {
    id: ids.id,
    production_id: ids.production_id,
    shoot_day_id: values.shoot_day_id,
    shoot_day_unit_ids: values.shoot_day_unit_ids,
    location_id: values.location_id,
    location_name: values.location_name,
    activities: values.activities,
    responsible_person_id: values.responsible_person_id,
    responsible_person_name: values.responsible_person_name,
    first_aiders: values.first_aiders,
    hospital_name: values.hospital_name,
    hospital_address: values.hospital_address,
    hospital_phone: values.hospital_phone,
    police_name: values.police_name,
    police_address: values.police_address,
    police_phone: values.police_phone,
    hazards: values.hazards.map(hazardFromForm),
  }
}

export const RAMS_QUERY_KEY = 'risk-assessments' as const
export const ramsListKey = (productionId: string | null) => [RAMS_QUERY_KEY, 'list', productionId] as const
export const ramsDetailKey = (id: string | undefined) => [RAMS_QUERY_KEY, 'detail', id] as const
export const hazardTemplatesKey = (productionId: string | null) => ['hazard-templates', productionId] as const
