import { z } from 'zod'
import { SHOT_SIZE_VALUES, CAMERA_MOVEMENT_VALUES } from '@/lib/db/types'

export const shotSubjectSchema = z.string().max(500).nullable()
export const shotDescriptionSchema = z.string().max(2000).nullable()
export const shotNotesSchema = z.string().max(5000).nullable()

export const shotSizeSchema = z.enum(SHOT_SIZE_VALUES).nullable()
export const shotMovementSchema = z.enum(CAMERA_MOVEMENT_VALUES).nullable()

/** Duration in seconds; must be >= 0. Used for duration_seconds. */
export const shotDurationSecondsSchema = z
  .number()
  .int()
  .min(0)
  .nullable()

/** Estimated shoot minutes; must be >= 0. Used by stripboard. */
export const shotEstMinutesSchema = z
  .number()
  .int()
  .min(0)
  .nullable()

export const shotLensSchema = z.string().max(200).nullable()
export const shotSupportSchema = z.string().max(200).nullable()

export function parseEstMinutes(value: string): z.infer<typeof shotEstMinutesSchema> {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = parseInt(trimmed, 10)
  if (Number.isNaN(n)) return null
  const result = shotEstMinutesSchema.safeParse(n)
  return result.success ? result.data : null
}

export function parseDurationSeconds(value: string): z.infer<typeof shotDurationSecondsSchema> {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = parseInt(trimmed, 10)
  if (Number.isNaN(n)) return null
  const result = shotDurationSecondsSchema.safeParse(n)
  return result.success ? result.data : null
}

/** Parse mm:ss to seconds. */
export function parseDurationMmSs(value: string): z.infer<typeof shotDurationSecondsSchema> {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parts = trimmed.split(':')
  if (parts.length === 1) {
    const n = parseInt(parts[0]!, 10)
    if (Number.isNaN(n)) return null
    return shotDurationSecondsSchema.safeParse(n).success ? n : null
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0]!, 10)
    const s = parseInt(parts[1]!, 10)
    if (Number.isNaN(m) || Number.isNaN(s)) return null
    const total = m * 60 + s
    return shotDurationSecondsSchema.safeParse(total).success ? total : null
  }
  return null
}
