import { z } from 'zod'
import { roundMoney } from '@/lib/money/roundMoney'

export const POSITIVE_MONEY_MESSAGE = 'Enter a positive amount (up to 2 decimal places)'
export const NON_NEGATIVE_MONEY_MESSAGE = 'Enter an amount of 0 or more (up to 2 decimal places)'
export const POSITIVE_INTEGER_MESSAGE = 'Enter a whole number greater than 0'
export const PERCENTAGE_MESSAGE = 'Enter a percentage between 0 and 100'

/** Strip invalid characters and cap decimal places while typing. */
export function filterMoneyInput(raw: string, options?: { maxDecimals?: number }): string {
  const maxDecimals = options?.maxDecimals ?? 2
  let filtered = raw.replace(/[^\d.]/g, '')
  const dotIndex = filtered.indexOf('.')
  if (dotIndex !== -1) {
    const before = filtered.slice(0, dotIndex + 1)
    const after = filtered.slice(dotIndex + 1).replace(/\./g, '')
    filtered = before + after.slice(0, maxDecimals)
  }
  return filtered
}

/** Digits only for positive integer fields. */
export function filterPositiveIntegerInput(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Parse filtered money string; empty → null. */
export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '.') return null
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return null
  return num
}

/** Parse filtered integer string; empty → null. Rejects decimal strings. */
export function parsePositiveIntegerInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.includes('.')) return null
  const num = parseInt(trimmed, 10)
  if (!Number.isFinite(num)) return null
  return num
}

export function formatMoneyForInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return String(value)
}

export function formatIntegerForInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return String(Math.trunc(value))
}

/** True when value has at most 2 decimal places (after rounding). */
export function hasMaxTwoDecimalPlaces(value: number): boolean {
  return roundMoney(value) === value || Math.abs(roundMoney(value) - value) < 1e-9
}

export function moneyMaxTwoDecimalsRefine(value: number, ctx: z.RefinementCtx, path?: (string | number)[]): void {
  if (!hasMaxTwoDecimalPlaces(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Amount must have at most 2 decimal places',
      ...(path ? { path } : {}),
    })
  }
}

const emptyToUndefined = z.literal('').transform(() => undefined)

function coerceMoneyFromString(value: string): number | undefined {
  const parsed = parseMoneyInput(value)
  return parsed ?? undefined
}

/** Required positive money field (string input for RHF). */
export function requiredPositiveMoneyField(message = POSITIVE_MONEY_MESSAGE) {
  return z
    .string()
    .min(1, message)
    .transform(coerceMoneyFromString)
    .pipe(
      z
        .number({ message })
        .finite(message)
        .positive(message)
        .refine(hasMaxTwoDecimalPlaces, { message })
    )
}

/** Optional positive money: empty → null. */
export function optionalPositiveMoneyField(message = POSITIVE_MONEY_MESSAGE) {
  return z
    .union([z.literal(''), z.string()])
    .transform((v) => (v === '' ? null : parseMoneyInput(v)))
    .pipe(
      z
        .number()
        .finite(message)
        .positive(message)
        .refine(hasMaxTwoDecimalPlaces, { message })
        .nullable()
    )
}

/** Optional non-negative money: empty → null, 0 allowed. */
export function optionalNonNegativeMoneyField(message = NON_NEGATIVE_MONEY_MESSAGE) {
  return z
    .union([z.literal(''), z.string()])
    .transform((v) => (v === '' ? null : parseMoneyInput(v)))
    .pipe(
      z
        .number()
        .finite(message)
        .nonnegative(message)
        .refine(hasMaxTwoDecimalPlaces, { message })
        .nullable()
    )
}

/** Optional positive integer: empty → null. */
export function optionalPositiveIntegerField(message = POSITIVE_INTEGER_MESSAGE) {
  return z
    .union([z.literal(''), z.string()])
    .superRefine((v, ctx) => {
      if (v === '') return
      if (v.includes('.') || !/^\d+$/.test(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message })
        return
      }
      const num = parseInt(v, 10)
      if (!Number.isFinite(num) || num <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message })
      }
    })
    .transform((v) => (v === '' ? null : parseInt(v, 10)))
}

/** Zod schema for nullable positive money stored as number (domain schemas). */
export function nullablePositiveMoneySchema(message = POSITIVE_MONEY_MESSAGE) {
  return z
    .number()
    .finite(message)
    .positive(message)
    .refine(hasMaxTwoDecimalPlaces, { message })
    .nullable()
    .optional()
    .default(null)
}

/** Zod schema for nullable non-negative money stored as number. */
export function nullableNonNegativeMoneySchema(message = NON_NEGATIVE_MONEY_MESSAGE) {
  return z
    .number()
    .finite(message)
    .nonnegative(message)
    .refine(hasMaxTwoDecimalPlaces, { message })
    .nullable()
    .optional()
    .default(null)
}

/** Zod schema for nullable positive integer stored as number. */
export function nullablePositiveIntegerSchema(message = POSITIVE_INTEGER_MESSAGE) {
  return z
    .number()
    .finite(message)
    .int(message)
    .positive(message)
    .nullable()
    .optional()
    .default(null)
}

/** Percentage 0–100, max 1 decimal place; empty → null. */
export function optionalPercentageField(message = PERCENTAGE_MESSAGE) {
  return z
    .union([z.literal(''), z.string()])
    .transform((v) => {
      if (v === '') return null
      const filtered = filterMoneyInput(v, { maxDecimals: 1 })
      const parsed = parseMoneyInput(filtered)
      return parsed
    })
    .pipe(
      z
        .number()
        .finite(message)
        .min(0, message)
        .max(100, message)
        .nullable()
    )
}

export { emptyToUndefined }
