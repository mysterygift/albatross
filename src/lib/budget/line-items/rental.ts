import { z } from 'zod'
import {
  nullablePositiveIntegerSchema,
  nullablePositiveMoneySchema,
} from '@/lib/budget/fieldValidation'

export const RENTAL_LINE_ITEM_RATE_TYPES = ['daily', 'weekly', 'flat'] as const
export type RentalLineItemRateType = (typeof RENTAL_LINE_ITEM_RATE_TYPES)[number]

const isoDate = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), 'Expected ISO date YYYY-MM-DD')
  .optional()
  .nullable()
  .default(null)

export const rentalLineItemDetailsSchema = z.object({
  rental_description: z.string().nullable().optional().default(null),
  rental_rate_type: z.enum(RENTAL_LINE_ITEM_RATE_TYPES).nullable().optional().default(null),
  rental_rate_amount: nullablePositiveMoneySchema(),
  rental_start_date: isoDate,
  rental_end_date: isoDate,
  rental_period_override_days: nullablePositiveIntegerSchema(),
  equipment_description: z.string().nullable().optional().default(null),
  vendor_id: z.string().nullable().optional().default(null),
  primary_contact_override: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
})

export type RentalLineItemDetails = z.infer<typeof rentalLineItemDetailsSchema>

export function parseRentalLineItemDetails(
  detailsJson: string
): { ok: true; value: RentalLineItemDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = rentalLineItemDetailsSchema.safeParse(parsed)
    if (!res.success) return { ok: false, error: res.error.issues.map((i) => i.message).join('; ') }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function rentalLineItemDetailsToJson(details: RentalLineItemDetails): string {
  const res = rentalLineItemDetailsSchema.safeParse(details)
  if (!res.success) throw new Error(res.error.issues.map((i) => i.message).join('; '))
  return JSON.stringify(res.data)
}

/** Inclusive rental days between two YYYY-MM-DD dates; null if either missing. */
export function computeRentalDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): number | null {
  if (!startDate || !endDate) return null
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  if (!sy || !sm || !sd || !ey || !em || !ed) return null
  const start = Date.UTC(sy, sm - 1, sd)
  const end = Date.UTC(ey, em - 1, ed)
  const diffMs = end - start
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return diffDays < 0 ? null : diffDays + 1
}

export function getEffectiveRentalDays(details: RentalLineItemDetails): number | null {
  if (details.rental_period_override_days != null) {
    return details.rental_period_override_days
  }
  return computeRentalDays(details.rental_start_date, details.rental_end_date)
}

/** Suggested estimated cost from rate and days; for line item preview only. */
export function calculateRentalSuggestedAmount(details: RentalLineItemDetails): number | null {
  const rate = details.rental_rate_amount
  const effectiveDays = getEffectiveRentalDays(details)
  const rateType = details.rental_rate_type ?? 'daily'

  if (rateType === 'daily') {
    if (rate != null && effectiveDays != null) return rate * effectiveDays
    return null
  }
  if (rateType === 'weekly') {
    if (rate != null && effectiveDays != null) return rate * Math.ceil(effectiveDays / 7)
    return null
  }
  if (rateType === 'flat') {
    if (rate != null) return rate
    return null
  }
  return null
}
