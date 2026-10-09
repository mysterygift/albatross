import { describe, expect, it } from 'vitest'
import { EQUIPMENT_CATALOG, catalogItem, defaultItemLabel, isArmGlyph, searchCatalog } from './catalog'
import { itemPrimitives } from './itemGeometry'
import { DEFAULT_UNITS_PER_METRE, itemReach } from './model'

describe('equipment catalogue', () => {
  it('has unique ids, a group and a real-world size for every item', () => {
    const ids = EQUIPMENT_CATALOG.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of EQUIPMENT_CATALOG) {
      expect(item.group, item.id).toBeTruthy()
      expect(item.width, item.id).toBeGreaterThan(0)
      expect(item.depth, item.id).toBeGreaterThan(0)
      // Nothing on a film set is wider than a truck or longer than a big crane's reach.
      expect(item.width, item.id).toBeLessThanOrEqual(12)
      expect(item.depth, item.id).toBeLessThanOrEqual(15)
    }
  })

  it('covers the kit people plan with', () => {
    for (const id of [
      'arri-t1',
      'arri-m18',
      'arrimax',
      'arri-skypanel-s360',
      'aputure-1200d',
      'astera-titan',
      'balloon-4k-hmi',
      'fisher-11',
      'peewee-4',
      'track-curved',
      'slider',
      'jimmy-jib',
      'technocrane-30',
      'flag-18x24',
      'floppy-4x4',
      'frame-20x20',
      'v-flat',
      'menace-arm',
      'easy-up-3x3',
      'video-village',
      'honeywagon',
      'crowd-barrier',
    ]) {
      expect(catalogItem(id), id).toBeDefined()
    }
  })

  it('draws every item without gaps in its geometry', () => {
    for (const item of EQUIPMENT_CATALOG) {
      const shapes = itemPrimitives({ type: item.id, width: item.width, depth: item.depth }, DEFAULT_UNITS_PER_METRE)
      expect(shapes.length, item.id).toBeGreaterThan(0)
      const numbers = shapes.flatMap((p) =>
        p.shape === 'rect' ? [p.x, p.y, p.w, p.h] : p.shape === 'circle' ? [p.cx, p.cy, p.r] : p.points.flatMap((pt) => [pt.x, pt.y])
      )
      expect(numbers.every(Number.isFinite), item.id).toBe(true)
    }
  })

  it('measures an arm by its reach from the base', () => {
    const crane = catalogItem('technocrane-30')!
    expect(isArmGlyph(crane.glyph)).toBe(true)
    expect(itemReach({ type: crane.id, width: crane.width, depth: crane.depth }, 10)).toBeCloseTo(119.5)
    const dolly = catalogItem('fisher-11')!
    expect(itemReach({ type: dolly.id, width: dolly.width, depth: dolly.depth }, 10)).toBeCloseTo(16)
  })

  it('finds items by brand, nickname, group and source', () => {
    expect(searchCatalog('skypanel').map((i) => i.id)).toEqual([
      'arri-skypanel-s30',
      'arri-skypanel-s60',
      'arri-skypanel-s120',
      'arri-skypanel-s360',
    ])
    expect(searchCatalog('technocrane').length).toBe(2)
    expect(searchCatalog('balloons').every((i) => i.light?.form === 'balloon')).toBe(true)
    expect(searchCatalog('hmi', 'lighting').every((i) => i.light?.source === 'hmi')).toBe(true)
    expect(searchCatalog('easy up', 'unit-base').length).toBe(3)
    expect(searchCatalog('m18', 'grip')).toEqual([])
  })

  it('labels lights with their source', () => {
    expect(defaultItemLabel(catalogItem('arri-m18')!)).toBe('M18 | HMI')
    expect(defaultItemLabel(catalogItem('honeywagon')!)).toBe('Honeywagon')
  })
})
