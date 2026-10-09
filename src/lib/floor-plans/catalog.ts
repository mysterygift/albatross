/**
 * Equipment that can be placed on a floor plan: lights, grip, camera support and unit base.
 * Sizes are the item's footprint seen from above, in metres: `width` across, `depth` along the
 * way it faces (for a light, along the beam). Items are drawn to the plan's scale.
 *
 * Lights are coloured by source (tungsten, HMI, LED) and shaped by form (fresnel, panel...), so a
 * plan reads at a glance; every item also carries a text label.
 */

export type EquipmentCategory = 'lighting' | 'grip' | 'camera-support' | 'unit-base'

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  lighting: 'Lights',
  grip: 'Grip',
  'camera-support': 'Camera support',
  'unit-base': 'Unit base',
}

export type LightSource = 'tungsten' | 'hmi' | 'led'

export const LIGHT_SOURCE_LABELS: Record<LightSource, string> = {
  tungsten: 'Tungsten',
  hmi: 'HMI',
  led: 'LED',
}

/** How a light is drawn. */
export type LightForm = 'fresnel' | 'open-face' | 'par' | 'cob' | 'panel' | 'tube' | 'balloon' | 'practical'

/** How a non-light item is drawn. */
export type ItemGlyph =
  | 'light'
  | 'dolly'
  | 'track'
  | 'curved-track'
  | 'slider'
  | 'jib'
  | 'crane'
  | 'tripod'
  | 'flag'
  | 'frame'
  | 'stand'
  | 'tent'
  | 'vehicle'
  | 'generator'
  | 'monitor'
  | 'box'

export type CatalogItem = {
  id: string
  name: string
  /** Default label shown beside the item on the plan. */
  short: string
  category: EquipmentCategory
  glyph: ItemGlyph
  /** Footprint in metres: across, and along the way it faces. */
  width: number
  depth: number
  /** Width and depth can be changed on the plan (track length, tent size, frame size). */
  resizable?: boolean
  light?: { source: LightSource; form: LightForm; /** Full beam angle in degrees. */ beam: number }
  /** Extra words for search (brand, model, nicknames). */
  keywords?: string
}

const light = (
  id: string,
  name: string,
  short: string,
  source: LightSource,
  form: LightForm,
  width: number,
  depth: number,
  beam: number,
  keywords = ''
): CatalogItem => ({ id, name, short, category: 'lighting', glyph: 'light', width, depth, light: { source, form, beam }, keywords })

export const EQUIPMENT_CATALOG: CatalogItem[] = [
  // Lighting
  light('arri-650-plus', 'ARRI 650 Plus fresnel', '650', 'tungsten', 'fresnel', 0.26, 0.3, 40, 'arri tungsten fresnel 650w'),
  light('arri-2k-fresnel', 'ARRI 2K fresnel', '2K', 'tungsten', 'fresnel', 0.4, 0.38, 40, 'arri tungsten fresnel 2000w blonde'),
  light('arri-m18', 'ARRI M18 HMI', 'M18', 'hmi', 'open-face', 0.47, 0.54, 40, 'arri hmi 1800w daylight'),
  light('arri-skypanel-s60', 'ARRI SkyPanel S60-C', 'S60', 'led', 'panel', 0.65, 0.14, 110, 'arri skypanel led panel'),
  light('aputure-600d', 'Aputure LS 600d Pro', '600d', 'led', 'cob', 0.3, 0.3, 55, 'aputure cob led daylight'),
  light('astera-titan', 'Astera Titan Tube', 'Titan', 'led', 'tube', 1.04, 0.05, 180, 'astera tube led'),
  light('balloon-2k', 'Balloon light 2K', 'Balloon', 'tungsten', 'balloon', 1.2, 1.2, 360, 'airstar balloon'),
  light('practical', 'Practical lamp', 'Practical', 'tungsten', 'practical', 0.3, 0.3, 360, 'practical bulb lamp'),
  // Camera support
  { id: 'fisher-11', name: 'Fisher 11 dolly', short: 'Fisher 11', category: 'camera-support', glyph: 'dolly', width: 0.66, depth: 1.14, keywords: 'dolly fisher' },
  { id: 'doorway-dolly', name: 'Doorway dolly', short: 'Doorway', category: 'camera-support', glyph: 'dolly', width: 0.76, depth: 1.22, keywords: 'dolly doorway' },
  { id: 'track-straight', name: 'Dolly track', short: 'Track', category: 'camera-support', glyph: 'track', width: 0.62, depth: 3.6, resizable: true, keywords: 'track rails dolly' },
  { id: 'slider', name: 'Slider', short: 'Slider', category: 'camera-support', glyph: 'slider', width: 0.15, depth: 1, resizable: true, keywords: 'slider' },
  { id: 'tripod', name: 'Tripod', short: 'Sticks', category: 'camera-support', glyph: 'tripod', width: 0.9, depth: 0.9, keywords: 'sticks tripod legs' },
  // Grip
  { id: 'flag-18x24', name: 'Flag 18x24', short: '18x24', category: 'grip', glyph: 'flag', width: 0.61, depth: 0.03, keywords: 'flag cutter solid' },
  { id: 'floppy-4x4', name: 'Floppy 4x4', short: '4x4 floppy', category: 'grip', glyph: 'flag', width: 1.22, depth: 0.03, keywords: 'floppy flag solid' },
  { id: 'c-stand', name: 'C-stand', short: 'C-stand', category: 'grip', glyph: 'stand', width: 0.9, depth: 0.9, keywords: 'century stand' },
  { id: 'frame-12x12', name: 'Frame 12x12', short: '12x12', category: 'grip', glyph: 'frame', width: 3.66, depth: 3.66, resizable: true, keywords: 'butterfly overhead silk diffusion frame' },
  // Unit base
  { id: 'easy-up-3x3', name: 'Easy-up 3 x 3 m', short: 'Easy-up', category: 'unit-base', glyph: 'tent', width: 3, depth: 3, resizable: true, keywords: 'gazebo tent pop up easy up' },
  { id: 'easy-up-6x3', name: 'Easy-up 6 x 3 m', short: 'Easy-up', category: 'unit-base', glyph: 'tent', width: 6, depth: 3, resizable: true, keywords: 'gazebo tent pop up easy up' },
  { id: 'video-village', name: 'Video village', short: 'Video village', category: 'unit-base', glyph: 'monitor', width: 1.2, depth: 0.6, keywords: 'monitor cart vtr' },
  { id: 'generator', name: 'Generator', short: 'Genny', category: 'unit-base', glyph: 'generator', width: 1.1, depth: 2.4, keywords: 'genny power' },
  { id: 'trailer', name: 'Trailer', short: 'Trailer', category: 'unit-base', glyph: 'vehicle', width: 2.5, depth: 7, keywords: 'honeywagon trailer truck' },
]

const byId = new Map(EQUIPMENT_CATALOG.map((item) => [item.id, item]))

export function catalogItem(id: string): CatalogItem | undefined {
  return byId.get(id)
}

/** Default label for a new item: the short name, plus the source for a light (`M18 | HMI`). */
export function defaultItemLabel(item: CatalogItem): string {
  return item.light ? `${item.short} | ${LIGHT_SOURCE_LABELS[item.light.source]}` : item.short
}

/** Items matching every word of `query` (name, short name, keywords, category). */
export function searchCatalog(query: string, category?: EquipmentCategory | null): CatalogItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return EQUIPMENT_CATALOG.filter((item) => {
    if (category && item.category !== category) return false
    const haystack = [item.name, item.short, item.keywords ?? '', EQUIPMENT_CATEGORY_LABELS[item.category], item.light ? LIGHT_SOURCE_LABELS[item.light.source] : '']
      .join(' ')
      .toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}
