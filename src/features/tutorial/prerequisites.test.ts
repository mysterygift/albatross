import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findMissingNeed } from './prerequisites'

const data = vi.hoisted(() => ({
  scenes: [] as unknown[],
  shots: [] as unknown[],
  days: [] as unknown[],
  cast: [] as unknown[],
}))

vi.mock('@/lib/db/repositories/schedule', () => ({
  listScenesByProduction: vi.fn(async () => data.scenes),
  listShotsByProduction: vi.fn(async () => data.shots),
  listShootDaysByProduction: vi.fn(async () => data.days),
}))

vi.mock('@/lib/db/repositories/person', () => ({
  listCast: vi.fn(async () => data.cast),
}))

describe('findMissingNeed', () => {
  beforeEach(() => {
    data.scenes = []
    data.shots = []
    data.days = []
    data.cast = []
  })

  it('reports the first missing record, in the order the step lists them', async () => {
    data.scenes = [{ id: 's1' }]
    const missing = await findMissingNeed(['scene', 'shot'], 'p1')
    expect(missing).toEqual({ kind: 'shot', label: 'a shot', section: 'schedule' })
  })

  it('returns null when every record exists', async () => {
    data.scenes = [{ id: 's1' }]
    data.shots = [{ id: 'sh1' }]
    data.days = [{ id: 'd1' }]
    expect(await findMissingNeed(['scene', 'shot', 'shootDay'], 'p1')).toBeNull()
  })

  it('only counts cast members for castMember, not crew', async () => {
    data.cast = [{ id: 'c1', is_cast: 0 }]
    expect(await findMissingNeed(['castMember'], 'p1')).toEqual({
      kind: 'castMember',
      label: 'a cast member',
      section: 'cast',
    })
    data.cast = [{ id: 'c2', is_cast: 1 }]
    expect(await findMissingNeed(['castMember'], 'p1')).toBeNull()
  })
})
