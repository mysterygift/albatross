import { describe, expect, it } from 'vitest'
import { deriveChecklist } from './useOnboardingChecklist'

describe('deriveChecklist', () => {
  it('ticks only the production item when nothing exists', () => {
    const r = deriveChecklist({ script: 0, cast: 0, shootDays: 0, budget: 0 })
    expect(r.total).toBe(5)
    expect(r.doneCount).toBe(1)
    expect(r.allDone).toBe(false)
    expect(r.items.filter((i) => i.done).map((i) => i.id)).toEqual(['production'])
  })

  it('ticks items from counts and reports allDone', () => {
    const r = deriveChecklist({ script: 1, cast: 3, shootDays: 2, budget: 10 })
    expect(r.doneCount).toBe(5)
    expect(r.allDone).toBe(true)
  })

  it('marks null counts as loading and not done', () => {
    const r = deriveChecklist({ script: null, cast: 1, shootDays: 0, budget: null })
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]))
    expect(byId.script).toMatchObject({ done: false, loading: true })
    expect(byId.cast).toMatchObject({ done: true, loading: false })
    expect(byId.budget.loading).toBe(true)
    expect(r.doneCount).toBe(2)
  })

  it('links each item to its page', () => {
    const r = deriveChecklist({ script: 0, cast: 0, shootDays: 0, budget: 0 })
    expect(r.items.map((i) => i.to)).toEqual([
      '/productions',
      '/schedule/script-import',
      '/people/cast-manager',
      '/schedule/stripboard',
      '/budget',
    ])
  })
})
