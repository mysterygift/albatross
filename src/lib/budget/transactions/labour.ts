import { z } from 'zod'
import {
  nullablePositiveIntegerSchema,
  nullablePositiveMoneySchema,
} from '@/lib/budget/fieldValidation'

export const LABOUR_RATE_TYPES = ['prep_day', 'shoot_day', 'overtime'] as const
export type LabourRateType = (typeof LABOUR_RATE_TYPES)[number]

const isoDate = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), 'Expected ISO date YYYY-MM-DD')

export const labourDetailsSchema = z.object({
  person_id: z.string().min(1).nullable().optional().default(null),
  labour_role_label: z.string().min(1, 'Labour role is required'),
  labour_rate_type: z.enum(LABOUR_RATE_TYPES),
  booked_days_count: nullablePositiveIntegerSchema(),
  rate_per_day: nullablePositiveMoneySchema(),
  currency_code: z.string().min(1).nullable().optional().default(null),
  start_date: isoDate.nullable().optional().default(null),
  end_date: isoDate.nullable().optional().default(null),
  unit: z.string().min(1).nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
})

export type LabourDetails = z.infer<typeof labourDetailsSchema>

export function parseLabourDetails(
  detailsJson: string
): { ok: true; value: LabourDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = labourDetailsSchema.safeParse(parsed)
    if (!res.success) return { ok: false, error: res.error.issues.map((i) => i.message).join('; ') }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function labourDetailsToJson(details: LabourDetails): string {
  const res = labourDetailsSchema.safeParse(details)
  if (!res.success) throw new Error(res.error.issues.map((i) => i.message).join('; '))
  return JSON.stringify(res.data)
}

