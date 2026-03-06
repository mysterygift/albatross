import { z } from 'zod'

export const RENTAL_RATE_TYPES = ['daily', 'weekly', 'flat'] as const
export type RentalRateType = (typeof RENTAL_RATE_TYPES)[number]

const isoDate = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), 'Expected ISO date YYYY-MM-DD')

export const rentalDetailsSchema = z
  .object({
    rental_description: z.string().min(1, 'Rental description is required'),
    rental_rate_type: z.enum(RENTAL_RATE_TYPES, {
      message: 'Select a rental rate type',
    }),
    rental_rate_amount: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    rental_start_date: isoDate.nullable().optional().default(null),
    rental_end_date: isoDate.nullable().optional().default(null),
    rental_period_override_days: z
      .number()
      .finite()
      .positive('Override days must be greater than 0')
      .nullable()
      .optional()
      .default(null),
    equipment_description: z.string().nullable().optional().default(null),
    vendor_id: z.string().min(1).nullable().optional().default(null),
    primary_contact_override: z.string().nullable().optional().default(null),
    notes: z.string().nullable().optional().default(null),
  })
  .superRefine((val, ctx) => {
    if (val.rental_start_date && val.rental_end_date) {
      if (val.rental_end_date < val.rental_start_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rental_end_date'],
          message: 'End date must be on or after start date',
        })
      }
    }
  })

export type RentalDetails = z.infer<typeof rentalDetailsSchema>

export function parseRentalDetails(
  detailsJson: string
): { ok: true; value: RentalDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = rentalDetailsSchema.safeParse(parsed)
    if (!res.success) {
      return {
        ok: false,
        error: res.error.issues.map((i) => i.message).join('; '),
      }
    }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function rentalDetailsToJson(details: RentalDetails): string {
  const res = rentalDetailsSchema.safeParse(details)
  if (!res.success) {
    throw new Error(res.error.issues.map((i) => i.message).join('; '))
  }
  return JSON.stringify(res.data)
}

/** Inclusive rental days between two YYYY-MM-DD dates; null if either missing. */
export function computeRentalDays(startDate: string | null, endDate: string | null): number | null {
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

export function getEffectiveRentalDays(details: RentalDetails): number | null {
  if (details.rental_period_override_days != null) {
    return details.rental_period_override_days
  }
  return computeRentalDays(details.rental_start_date, details.rental_end_date)
}

export function calculateRentalExpenseAmount(details: RentalDetails): number | null {
  const rate = details.rental_rate_amount
  const effectiveDays = getEffectiveRentalDays(details)

  if (details.rental_rate_type === 'daily') {
    if (rate != null && effectiveDays != null) {
      return rate * effectiveDays
    }
    return null
  }

  if (details.rental_rate_type === 'weekly') {
    if (rate != null && effectiveDays != null) {
      return rate * Math.ceil(effectiveDays / 7)
    }
    return null
  }

  if (details.rental_rate_type === 'flat') {
    if (rate != null) {
      return rate
    }
    return null
  }

  return null
}

