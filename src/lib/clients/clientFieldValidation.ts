import { z } from 'zod'

/** local@domain.tld — lowercase local part, domain, and TLD */
export const CLIENT_EMAIL_PATTERN = /^[a-z0-9._+-]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/
export const CLIENT_PHONE_PATTERN = /^\+?[0-9]+$/
export const CLIENT_PHONE_MAX_DIGITS = 17

export function validateOptionalClientEmail(
  value: string
): { ok: true } | { ok: false; message: string } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true }
  if (trimmed !== trimmed.toLowerCase()) {
    return { ok: false, message: 'Email must be lowercase (e.g. user@domain.com)' }
  }
  if (!CLIENT_EMAIL_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email (e.g. user@domain.com)' }
  }
  return { ok: true }
}

export function validateOptionalClientPhone(
  value: string
): { ok: true } | { ok: false; message: string } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true }
  if (!CLIENT_PHONE_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Phone may only contain + and numbers' }
  }
  const digitCount = trimmed.replace(/\D/g, '').length
  if (digitCount > CLIENT_PHONE_MAX_DIGITS) {
    return { ok: false, message: `Phone number must be at most ${CLIENT_PHONE_MAX_DIGITS} digits` }
  }
  return { ok: true }
}

export const optionalClientEmailField = z
  .string()
  .optional()
  .or(z.literal(''))
  .superRefine((value, ctx) => {
    const result = validateOptionalClientEmail(value ?? '')
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message })
    }
  })

export const optionalClientPhoneField = z
  .string()
  .optional()
  .or(z.literal(''))
  .superRefine((value, ctx) => {
    const result = validateOptionalClientPhone(value ?? '')
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message })
    }
  })

export const clientDraftSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  email: optionalClientEmailField,
  phone: optionalClientPhoneField,
})

export type ClientDraftForm = z.infer<typeof clientDraftSchema>

export function normalizeClientEmail(trimmed: string): string | null {
  return trimmed ? trimmed.toLowerCase() : null
}

export function normalizeClientPhone(trimmed: string): string | null {
  return trimmed || null
}

/** Map clientDraftSchema output to repository create/update payload. */
export function clientDraftToRepoFields(draft: ClientDraftForm): {
  name: string
  email: string | null
  phone: string | null
} {
  const emailTrimmed = (draft.email ?? '').trim()
  const phoneTrimmed = (draft.phone ?? '').trim()
  return {
    name: draft.name.trim(),
    email: normalizeClientEmail(emailTrimmed),
    phone: normalizeClientPhone(phoneTrimmed),
  }
}
