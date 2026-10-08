import { z } from 'zod'

/** local@domain.tld — e.g. john@gmail.org is valid, john@poe is not */
export const CONTACT_EMAIL_PATTERN = /^[a-z0-9._+-]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i
/** Digits only, with an optional leading + for a country code */
export const CONTACT_PHONE_PATTERN = /^\+?[0-9]+$/
export const CONTACT_PHONE_MAX_DIGITS = 17

export type ContactFieldResult = { ok: true } | { ok: false; message: string }

export function validateOptionalContactEmail(value: string): ContactFieldResult {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true }
  if (!CONTACT_EMAIL_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email (e.g. user@domain.com)' }
  }
  return { ok: true }
}

export function validateOptionalContactPhone(value: string): ContactFieldResult {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true }
  if (!CONTACT_PHONE_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Phone may only contain + and numbers' }
  }
  const digitCount = trimmed.replace(/\D/g, '').length
  if (digitCount > CONTACT_PHONE_MAX_DIGITS) {
    return { ok: false, message: `Phone number must be at most ${CONTACT_PHONE_MAX_DIGITS} digits` }
  }
  return { ok: true }
}

function optionalFieldFrom(validate: (value: string) => ContactFieldResult) {
  return z
    .string()
    .optional()
    .or(z.literal(''))
    .superRefine((value, ctx) => {
      const result = validate(value ?? '')
      if (!result.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message })
      }
    })
}

export const optionalContactEmailField = optionalFieldFrom(validateOptionalContactEmail)
export const optionalContactPhoneField = optionalFieldFrom(validateOptionalContactPhone)
