import { z } from 'zod'

export const LABOUR_LINE_ITEM_RATE_TYPES = ['prep_day', 'shoot_day', 'overtime'] as const
export type LabourLineItemRateType = (typeof LABOUR_LINE_ITEM_RATE_TYPES)[number]

const isoDate = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), 'Expected ISO date YYYY-MM-DD')
  .optional()
  .nullable()
  .default(null)

export const labourLineItemDetailsSchema = z.object({
  person_id: z.string().nullable().optional().default(null),
  labour_role_label: z.string().nullable().optional().default(null),
  labour_rate_type: z.enum(LABOUR_LINE_ITEM_RATE_TYPES).nullable().optional().default(null),
  planned_days_count: z.number().finite().nonnegative().nullable().optional().default(null),
  rate_per_day: z.number().finite().nonnegative().nullable().optional().default(null),
  currency_code: z.string().nullable().optional().default(null),
  start_date: isoDate,
  end_date: isoDate,
  unit: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
})

export type LabourLineItemDetails = z.infer<typeof labourLineItemDetailsSchema>

export function parseLabourLineItemDetails(
  detailsJson: string
): { ok: true; value: LabourLineItemDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = labourLineItemDetailsSchema.safeParse(parsed)
    if (!res.success) return { ok: false, error: res.error.issues.map((i) => i.message).join('; ') }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function labourLineItemDetailsToJson(details: LabourLineItemDetails): string {
  const res = labourLineItemDetailsSchema.safeParse(details)
  if (!res.success) throw new Error(res.error.issues.map((i) => i.message).join('; '))
  return JSON.stringify(res.data)
}
