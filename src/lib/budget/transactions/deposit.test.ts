import { describe, expect, it } from 'vitest'
import {
  depositDetailsSchema,
  depositDetailsToJson,
  parseDepositDetails,
} from '@/lib/budget/transactions/deposit'

describe('depositDetailsSchema', () => {
  it('accepts valid deposit details', () => {
    const res = depositDetailsSchema.safeParse({
      deposit_description: 'Location hold',
      refundable_status: 'refundable',
      amount: 500,
      vendor_id: null,
      location_id: null,
      notes: null,
    })
    expect(res.success).toBe(true)
  })

  it('rejects missing description', () => {
    const res = depositDetailsSchema.safeParse({
      deposit_description: '',
      refundable_status: 'refundable',
      amount: 100,
    })
    expect(res.success).toBe(false)
  })

  it('rejects missing refundable status', () => {
    const res = depositDetailsSchema.safeParse({
      deposit_description: 'Kit deposit',
      amount: 100,
    })
    expect(res.success).toBe(false)
  })

  it('rejects non-positive amount', () => {
    const res = depositDetailsSchema.safeParse({
      deposit_description: 'Kit deposit',
      refundable_status: 'non_refundable',
      amount: 0,
    })
    expect(res.success).toBe(false)
  })
})

describe('parseDepositDetails', () => {
  it('round-trips via depositDetailsToJson', () => {
    const details = {
      deposit_description: 'Permit deposit',
      refundable_status: 'refundable' as const,
      amount: 250.5,
      vendor_id: 'v-1',
      location_id: null,
      notes: 'Due on wrap',
    }
    const json = depositDetailsToJson(details)
    const parsed = parseDepositDetails(json)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value).toEqual(details)
    }
  })
})
