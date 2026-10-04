import { describe, expect, it } from 'vitest'
import { getMovementPinCodes, parseMovementPins, serializeMovementPins, type MovementPin } from './pins'

const pin = (over: Partial<MovementPin>): MovementPin => ({
  id: 'p1',
  kind: 'parking',
  label: 'Mill Lane bays',
  notes: 'Permit 4471',
  lat: 51.5,
  lng: -0.12,
  ...over,
})

describe('movement pins JSON', () => {
  it('round-trips pins', () => {
    const pins = [pin({}), pin({ id: 'p2', kind: 'unit_base', label: 'Base', notes: null })]
    expect(parseMovementPins(serializeMovementPins(pins))).toEqual(pins)
  })

  it('serialises an empty list to null so the column is cleared', () => {
    expect(serializeMovementPins([])).toBeNull()
  })

  it('drops malformed, duplicate and out-of-range entries', () => {
    const parsed = parseMovementPins(
      JSON.stringify([
        { id: 'a', kind: 'parking', label: 'ok', lat: 1, lng: 2 },
        { id: 'a', kind: 'parking', label: 'dup', lat: 1, lng: 2 },
        { id: 'b', kind: 'helipad', lat: 1, lng: 2 },
        { id: 'c', kind: 'other', lat: 120, lng: 2 },
        { id: 'd', kind: 'other', lat: 'x', lng: 2 },
        { kind: 'other', lat: 1, lng: 2 },
        null,
      ])
    )
    expect(parsed.map((p) => p.id)).toEqual(['a'])
    expect(parseMovementPins('{not json')).toEqual([])
    expect(parseMovementPins('{"a":1}')).toEqual([])
    expect(parseMovementPins(null)).toEqual([])
  })
})

describe('getMovementPinCodes', () => {
  it('uses B for a lone unit base and numbers repeats per kind', () => {
    expect(
      getMovementPinCodes([
        pin({ id: '1', kind: 'unit_base' }),
        pin({ id: '2', kind: 'parking' }),
        pin({ id: '3', kind: 'parking' }),
        pin({ id: '4', kind: 'other' }),
      ])
    ).toEqual(['B', 'P1', 'P2', 'X1'])
    expect(
      getMovementPinCodes([pin({ id: '1', kind: 'unit_base' }), pin({ id: '2', kind: 'unit_base' })])
    ).toEqual(['B1', 'B2'])
  })
})
