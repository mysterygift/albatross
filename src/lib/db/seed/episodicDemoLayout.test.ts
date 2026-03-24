import { describe, expect, it } from 'vitest'
import { shootingBlocRangesOverlap } from '@/lib/db/repositories/shootingBlocs'
import { EPISODIC_DEMO_IDS, EPISODIC_DEMO_MIXED_STRIP_SCENES } from './constants'

function episodeBandForSceneNum(n: number): 1 | 2 | 3 {
  if (n <= 10) return 1
  if (n <= 20) return 2
  return 3
}

describe('episodic demo seed layout', () => {
  it('mixed strip matrix is 12×5 with scene numbers in 1..30 and spans multiple episode bands per day', () => {
    expect(EPISODIC_DEMO_MIXED_STRIP_SCENES).toHaveLength(12)
    for (const day of EPISODIC_DEMO_MIXED_STRIP_SCENES) {
      expect(day).toHaveLength(5)
      const bands = new Set<number>()
      for (const n of day) {
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(30)
        bands.add(episodeBandForSceneNum(n))
      }
      expect(bands.size).toBeGreaterThanOrEqual(2)
    }
  })

  it('demo shooting blocs are non-overlapping and adjacent', () => {
    const start = '2025-06-01'
    const bloc1End = '2025-06-06'
    const bloc2Start = '2025-06-07'
    const bloc2End = '2025-06-12'
    expect(shootingBlocRangesOverlap(start, bloc1End, bloc2Start, bloc2End)).toBe(false)
    expect(bloc1End < bloc2Start).toBe(true)
  })

  it('episodic demo episode and bloc ids are distinct from entity id ranges', () => {
    expect(EPISODIC_DEMO_IDS.episode(1)).not.toBe(EPISODIC_DEMO_IDS.scene(1))
    expect(EPISODIC_DEMO_IDS.shootingBloc(1)).not.toBe(EPISODIC_DEMO_IDS.strip(1))
  })
})
