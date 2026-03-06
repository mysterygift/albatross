import { z } from 'zod'

export const ALLOW_STATUSES = ['open', 'resolved'] as const
export type AllowStatus = (typeof ALLOW_STATUSES)[number]

export const allowDetailsSchema = z.object({
  allow_description: z.string().min(1, 'Allow description is required'),
  provisional_amount: z
    .number()
    .finite()
    .nonnegative()
    .nullable()
    .optional()
    .default(null),
  status: z
    .enum(ALLOW_STATUSES, { message: 'Select a status' })
    .default('open'),
  notes: z.string().nullable().optional().default(null),
})

export type AllowDetails = z.infer<typeof allowDetailsSchema>

export function parseAllowDetails(
  detailsJson: string
): { ok: true; value: AllowDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = allowDetailsSchema.safeParse(parsed)
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

export function allowDetailsToJson(details: AllowDetails): string {
  const res = allowDetailsSchema.safeParse(details)
  if (!res.success) {
    throw new Error(res.error.issues.map((i) => i.message).join('; '))
  }
  return JSON.stringify(res.data)
}

