import { describe, expect, it } from 'vitest'
import {
  filterMoneyInput,
  filterPositiveIntegerInput,
  formatIntegerForInput,
  formatMoneyForInput,
  formatMoneyFixedForInput,
  optionalNonNegativeMoneyField,
  optionalPositiveIntegerField,
  optionalPositiveMoneyField,
  parseMoneyInput,
  parsePositiveIntegerInput,
  requiredPositiveMoneyField,
} from '@/lib/budget/fieldValidation'

describe('filterMoneyInput', () => {
  it('strips non-numeric characters', () => {
    expect(filterMoneyInput('abc12.34e-')).toBe('12.34')
  })

  it('caps decimal places at 2', () => {
    expect(filterMoneyInput('12.345')).toBe('12.34')
  })

  it('allows single decimal point', () => {
    expect(filterMoneyInput('1.2.3')).toBe('1.23')
  })
})

describe('filterPositiveIntegerInput', () => {
  it('strips non-digits', () => {
    expect(filterPositiveIntegerInput('12a3-')).toBe('123')
  })

  it('returns empty for non-numeric', () => {
    expect(filterPositiveIntegerInput('abc')).toBe('')
  })
})

describe('parseMoneyInput', () => {
  it('returns null for empty', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('.')).toBeNull()
  })

  it('parses valid amounts', () => {
    expect(parseMoneyInput('12.34')).toBe(12.34)
    expect(parseMoneyInput('0')).toBe(0)
  })
})

describe('parsePositiveIntegerInput', () => {
  it('returns null for empty', () => {
    expect(parsePositiveIntegerInput('')).toBeNull()
  })

  it('parses integers including leading zeros', () => {
    expect(parsePositiveIntegerInput('007')).toBe(7)
  })
})

describe('format helpers', () => {
  it('formatMoneyForInput handles null', () => {
    expect(formatMoneyForInput(null)).toBe('')
    expect(formatMoneyForInput(12.5)).toBe('12.5')
  })

  it('formatMoneyFixedForInput always shows 2dp', () => {
    expect(formatMoneyFixedForInput(null)).toBe('')
    expect(formatMoneyFixedForInput(1250)).toBe('1250.00')
    expect(formatMoneyFixedForInput(12.5)).toBe('12.50')
    expect(formatMoneyFixedForInput(1.005)).toBe('1.01')
  })

  it('formatIntegerForInput truncates', () => {
    expect(formatIntegerForInput(3.7)).toBe('3')
  })
})

describe('Zod field builders', () => {
  it('requiredPositiveMoneyField rejects empty', () => {
    const schema = requiredPositiveMoneyField()
    expect(schema.safeParse('').success).toBe(false)
  })

  it('requiredPositiveMoneyField accepts valid amount', () => {
    const schema = requiredPositiveMoneyField()
    const res = schema.safeParse('12.34')
    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBe(12.34)
  })

  it('money fields round to 2dp instead of rejecting extra decimals', () => {
    const res = requiredPositiveMoneyField().safeParse('12.345')
    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBe(12.35)
    const opt = optionalNonNegativeMoneyField().safeParse('0.1')
    expect(opt.success && opt.data).toBe(0.1)
  })

  it('requiredPositiveMoneyField rejects zero', () => {
    const schema = requiredPositiveMoneyField()
    expect(schema.safeParse('0').success).toBe(false)
  })

  it('optionalPositiveMoneyField allows empty', () => {
    const schema = optionalPositiveMoneyField()
    const res = schema.safeParse('')
    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBeNull()
  })

  it('optionalPositiveMoneyField rejects zero when entered', () => {
    const schema = optionalPositiveMoneyField()
    expect(schema.safeParse('0').success).toBe(false)
  })

  it('optionalNonNegativeMoneyField allows zero', () => {
    const schema = optionalNonNegativeMoneyField()
    const res = schema.safeParse('0')
    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBe(0)
  })

  it('optionalPositiveIntegerField rejects zero and decimals', () => {
    const schema = optionalPositiveIntegerField()
    expect(schema.safeParse('0').success).toBe(false)
    expect(schema.safeParse('1.5').success).toBe(false)
  })

  it('optionalPositiveIntegerField accepts valid integer', () => {
    const schema = optionalPositiveIntegerField()
    const res = schema.safeParse('5')
    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBe(5)
  })
})
