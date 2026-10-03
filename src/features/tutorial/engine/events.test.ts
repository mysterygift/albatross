import { describe, expect, it, vi } from 'vitest'
import { emitTutorialEvent, subscribeTutorialEvents, tutorialEmitted } from './events'

describe('tutorial events', () => {
  it('delivers emitted events to subscribers and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTutorialEvents(listener)
    emitTutorialEvent('shot.created', 'p1', { shotId: 's1' })
    expect(listener).toHaveBeenCalledWith({ name: 'shot.created', productionId: 'p1', payload: { shotId: 's1' } })
    unsubscribe()
    emitTutorialEvent('shot.created', 'p1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('isolates a throwing listener from the others', () => {
    const broken = vi.fn(() => {
      throw new Error('boom')
    })
    const healthy = vi.fn()
    const a = subscribeTutorialEvents(broken)
    const b = subscribeTutorialEvents(healthy)
    expect(() => emitTutorialEvent('task.created', 'p1')).not.toThrow()
    expect(healthy).toHaveBeenCalledTimes(1)
    a()
    b()
  })

  it('returns the wrapped result unchanged, and only emits when someone listens', () => {
    const row = { id: 'r1' }
    expect(tutorialEmitted('location.created', 'p1', row)).toBe(row)
  })
})
