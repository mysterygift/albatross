// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { RevisionReview as Review } from '@/lib/db/repositories/scriptRevisions'
import { RevisionReview, revisionSummary } from './RevisionReview'

const counts = (over: Partial<Record<'carried' | 'moved' | 'unmatched' | 'already_lined', number>> = {}) => ({
  carried: 0, moved: 0, unmatched: 0, already_lined: 0, ...over,
})

const review: Review = {
  toVersionId: 'v2',
  fromLabel: 'White',
  toLabel: 'Blue',
  totals: { tramlines: counts({ carried: 3, moved: 1, unmatched: 1 }), annotations: counts({ carried: 1 }) },
  relined: 0,
  items: [
    { id: 'r1', itemType: 'tramline', outcome: 'unmatched', label: '214 MCU Marcus', slateId: 's214', shootDayId: 'd', wasOn: 'MARCUS: Since lunch.', notes: ['None of the lines it covered are in the new draft'] },
    { id: 'r2', itemType: 'tramline', outcome: 'moved', label: '212 WS', slateId: 's212', shootDayId: 'd', wasOn: 'Monitors glow.', notes: ['1 new line inside its run is marked not covered'] },
  ],
}

describe('revision review (SS10)', () => {
  afterEach(() => cleanup())

  it('summarises what came across and lists items to check', async () => {
    const user = userEvent.setup()
    const onSelectSlate = vi.fn()
    const onReviewed = vi.fn()
    render(
      <RevisionReview review={review} touch={false} busy={false} daySlateIds={new Set(['s214'])} onSelectSlate={onSelectSlate} onReviewed={onReviewed} />
    )
    expect(revisionSummary(review)).toBe('Carried 4 tramlines and 1 note from White. 2 items need a look.')
    expect(screen.getByRole('status').textContent).toContain('Carried 4 tramlines and 1 note from White.')
    expect(screen.getByText('MARCUS: Since lunch.', { exact: false })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Select slate' }))
    expect(onSelectSlate).toHaveBeenCalledWith('s214')
    await user.click(screen.getByRole('button', { name: 'Dismiss: 214 MCU Marcus' }))
    expect(onReviewed).toHaveBeenCalledWith('r1')
    await user.click(screen.getByRole('button', { name: 'Mark checked: 212 WS' }))
    expect(onReviewed).toHaveBeenCalledWith('r2')
  })
})
