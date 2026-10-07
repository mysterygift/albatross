import { describe, expect, it } from 'vitest'
import type { Deliverable } from '@/lib/db/types'
import {
  getDeliverableReviewRows,
  getDeliverablesReadiness,
  getDeliverableWrapStatus,
} from './deliverablesReadiness'

function make(status: string, id = status): Deliverable {
  return { id, status } as unknown as Deliverable
}

describe('getDeliverableWrapStatus', () => {
  it('treats delivered as done', () => {
    expect(getDeliverableWrapStatus('delivered')).toBe('signed_off')
  })

  it.each(['not_started', 'preparing', 'qc', 'ready'])('treats %s as pending', (s) => {
    expect(getDeliverableWrapStatus(s)).toBe('pending')
  })

  it.each(['signed_off', 'Signed Off', 'complete', 'completed', 'done'])(
    'keeps legacy done value %s working',
    (s) => {
      expect(getDeliverableWrapStatus(s)).toBe('signed_off')
    }
  )

  it('keeps legacy pending working', () => {
    expect(getDeliverableWrapStatus('pending')).toBe('pending')
  })

  it('is case and whitespace insensitive', () => {
    expect(getDeliverableWrapStatus('  Delivered ')).toBe('signed_off')
    expect(getDeliverableWrapStatus('QC')).toBe('pending')
  })

  it('returns unknown for unrecognised or empty values', () => {
    expect(getDeliverableWrapStatus('whatever')).toBe('unknown')
    expect(getDeliverableWrapStatus('')).toBe('unknown')
  })
})

describe('getDeliverablesReadiness', () => {
  it('is ready when every deliverable is delivered', () => {
    const r = getDeliverablesReadiness([make('delivered', 'a'), make('delivered', 'b')])
    expect(r).toEqual({
      status: 'ready',
      signedOffCount: 2,
      pendingCount: 0,
      unknownCount: 0,
      totalCount: 2,
    })
  })

  it('needs review when any deliverable is ready-but-not-delivered', () => {
    const r = getDeliverablesReadiness([make('delivered', 'a'), make('ready', 'b')])
    expect(r.status).toBe('needs_review')
    expect(r.signedOffCount).toBe(1)
    expect(r.pendingCount).toBe(1)
  })

  it('counts every real status', () => {
    const r = getDeliverablesReadiness(
      ['not_started', 'preparing', 'qc', 'ready', 'delivered', 'bogus'].map((s) => make(s))
    )
    expect(r).toMatchObject({ signedOffCount: 1, pendingCount: 4, unknownCount: 1, totalCount: 6 })
    expect(r.status).toBe('needs_review')
  })

  it('needs review with no deliverables', () => {
    expect(getDeliverablesReadiness([]).status).toBe('needs_review')
  })
})

describe('getDeliverableReviewRows', () => {
  it('maps each deliverable to its wrap status', () => {
    const rows = getDeliverableReviewRows([make('delivered'), make('qc')])
    expect(rows.map((r) => r.wrapStatus)).toEqual(['signed_off', 'pending'])
  })
})
