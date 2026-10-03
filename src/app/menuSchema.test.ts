import { describe, expect, it } from 'vitest'
import { getAcceleratorConflicts, resolveMenuSectionForPath, sectionMenuSpecs } from '@/app/menuSchema'

describe('resolveMenuSectionForPath', () => {
  it('maps routes to menu sections', () => {
    expect(resolveMenuSectionForPath('/tasks')).toBe('tasks')
    expect(resolveMenuSectionForPath('/readiness')).toBe('none')
    expect(resolveMenuSectionForPath('/schedule/calendar')).toBe('schedule')
    expect(resolveMenuSectionForPath('/schedule/script-import')).toBe('schedule')
    expect(resolveMenuSectionForPath('/people/bookings')).toBe('people')
    expect(resolveMenuSectionForPath('/equipment')).toBe('none')
  })

  it('has no accelerator conflicts in any section', () => {
    for (const spec of sectionMenuSpecs) {
      expect(getAcceleratorConflicts(spec.key)).toEqual([])
    }
    expect(getAcceleratorConflicts('none')).toEqual([])
  })
})
