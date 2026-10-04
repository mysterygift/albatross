import { describe, expect, it } from 'vitest'
import {
  derivePoApproval,
  isPoApproved,
  isPoAwaitingApproval,
} from '@/lib/budget/vendors/poStatus'

describe('poStatus', () => {
  it('derives approval from status', () => {
    expect(derivePoApproval('draft')).toBe(0)
    expect(derivePoApproval('issued')).toBe(0)
    expect(derivePoApproval('approved')).toBe(1)
    expect(derivePoApproval('closed')).toBe(1)
    expect(derivePoApproval('cancelled')).toBe(0)
  })

  it('classifies statuses', () => {
    expect(isPoApproved({ status: 'approved' })).toBe(true)
    expect(isPoApproved({ status: 'issued' })).toBe(false)
    expect(isPoAwaitingApproval({ status: 'draft' })).toBe(true)
    expect(isPoAwaitingApproval({ status: 'issued' })).toBe(true)
    expect(isPoAwaitingApproval({ status: 'cancelled' })).toBe(false)
    expect(isPoAwaitingApproval({ status: 'closed' })).toBe(false)
  })
})
