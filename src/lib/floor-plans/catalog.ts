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
  | 'boom'
  | 'tripod'
  | 'rig'
  | 'flag'
  | 'board'
  | 'vflat'
  | 'frame'
  | 'stand'
  | 'ladder'
  | 'tent'
  | 'vehicle'
  | 'generator'
  | 'monitor'
  | 'barrier'
  | 'cone'
  | 'area'
  | 'box'

export type CatalogItem = {
  id: string
  name: string
  /** Default label shown beside the item on the plan. */
  short: string
  category: EquipmentCategory
  /** Heading the item sits under in the library (Tungsten, Dollies, Trucks and trailers...). */
  group: string
  glyph: ItemGlyph
  /**
   * Footprint in metres: across, and along the way it faces. For an arm (jib, crane, menace arm)
   * `depth` is the reach from the base to the tip.
   */
  width: number
  depth: number
  /** Width and depth can be changed on the plan (track length, tent size, frame size, arm reach). */
  resizable?: boolean
  light?: { source: LightSource; form: LightForm; /** Full beam angle in degrees. */ beam: number }
  /** Extra words for search (brand, model, nicknames). */
  keywords?: string
}

/** Items drawn as an arm reaching out from a base: `depth` is the reach, not a footprint. */
export function isArmGlyph(glyph: ItemGlyph | undefined): boolean {
  return glyph === 'jib' || glyph === 'crane' || glyph === 'boom'
}

const light = (
  id: string,
  name: string,
  short: string,
  group: string,
  source: LightSource,
  form: LightForm,
  width: number,
  depth: number,
  beam: number,
  keywords = '',
  resizable = false
): CatalogItem => ({
  id,
  name,
  short,
  category: 'lighting',
  group,
  glyph: 'light',
  width,
  depth,
  light: { source, form, beam },
  keywords,
  ...(resizable ? { resizable } : {}),
})

const thing =
  (category: Exclude<EquipmentCategory, 'lighting'>, group: string) =>
  (
    id: string,
    name: string,
    short: string,
    glyph: ItemGlyph,
    width: number,
    depth: number,
    keywords = '',
    resizable = false
  ): CatalogItem => ({ id, name, short, category, group, glyph, width, depth, keywords, ...(resizable ? { resizable } : {}) })

const dollies = thing('camera-support', 'Dollies')
const track = thing('camera-support', 'Track and sliders')
const legs = thing('camera-support', 'Legs and rigs')
const arms = thing('camera-support', 'Jibs and cranes')
const cars = thing('camera-support', 'Camera vehicles')
const flags = thing('grip', 'Flags and cutters')
const frames = thing('grip', 'Frames and overheads')
const bounce = thing('grip', 'Bounce')
const stands = thing('grip', 'Stands and arms')
const rigging = thing('grip', 'Rigging and access')
const effects = thing('grip', 'Effects')
const tents = thing('unit-base', 'Tents')
const village = thing('unit-base', 'Village and carts')
const power = thing('unit-base', 'Power')
const trucks = thing('unit-base', 'Trucks and trailers')
const facilities = thing('unit-base', 'Facilities')
const site = thing('unit-base', 'Site')

/*
 * Sizes are taken from makers' and rental houses' spec sheets where they publish them (ARRI,
 * Aputure, Creamsource, Litepanels, K5600, Chapman, Panavision, Matthews; see
 * DOCS/features/floor-plans.md), and are typical sizes otherwise. Lights are measured with
 * their yoke, seen from above; flags, cutters and boards stand on edge, so their depth is thin.
 */
export const EQUIPMENT_CATALOG: CatalogItem[] = [
  // Lights | Tungsten
  light('dedo-150', 'Dedolight 150', 'Dedo', 'Tungsten', 'tungsten', 'fresnel', 0.1, 0.2, 30, 'dedolight dlh4 150w'),
  light('arri-150', 'ARRI 150 fresnel', '150', 'Tungsten', 'tungsten', 'fresnel', 0.14, 0.17, 40, 'arri inky 150w'),
  light('arri-300-plus', 'ARRI 300 Plus fresnel', '300', 'Tungsten', 'tungsten', 'fresnel', 0.2, 0.22, 40, 'arri tweenie pepper 300w'),
  light('arri-650-plus', 'ARRI 650 Plus fresnel', '650', 'Tungsten', 'tungsten', 'fresnel', 0.26, 0.3, 40, 'arri tweenie 650w'),
  light('arri-t1', 'ARRI True Blue T1 1K fresnel', '1K', 'Tungsten', 'tungsten', 'fresnel', 0.32, 0.22, 40, 'arri baby 1000w 1k'),
  light('arri-2k-fresnel', 'ARRI True Blue T2 2K fresnel', '2K', 'Tungsten', 'tungsten', 'fresnel', 0.46, 0.39, 40, 'arri junior 2000w 2k'),
  light('arri-t5', 'ARRI True Blue T5 5K fresnel', '5K', 'Tungsten', 'tungsten', 'fresnel', 0.45, 0.5, 40, 'arri senior 5000w 5k'),
  light('arri-t12', '10K fresnel', '10K', 'Tungsten', 'tungsten', 'fresnel', 0.62, 0.66, 40, 'arri t12 mole tenner 10000w 12k'),
  light('redhead', 'Redhead 800W', 'Redhead', 'Tungsten', 'tungsten', 'open-face', 0.2, 0.25, 60, 'open face 800w'),
  light('blonde', 'Blonde 2K', 'Blonde', 'Tungsten', 'tungsten', 'open-face', 0.3, 0.35, 60, 'open face 2000w mighty mole'),
  light('par-64', 'PAR 64 can', 'PAR 64', 'Tungsten', 'tungsten', 'par', 0.24, 0.38, 25, 'par can 1000w'),
  light('maxi-brute', 'Maxi-Brute 9-light', 'Maxi', 'Tungsten', 'tungsten', 'open-face', 0.65, 0.35, 50, 'maxibrute 9 light par dino'),
  light('space-light', 'Space light 6K', 'Space', 'Tungsten', 'tungsten', 'balloon', 0.75, 0.75, 360, 'spacelight skirt overhead'),
  light('china-ball', 'China ball', 'China ball', 'Tungsten', 'tungsten', 'balloon', 0.6, 0.6, 360, 'chinese lantern paper', true),
  light('practical', 'Practical lamp', 'Practical', 'Tungsten', 'tungsten', 'practical', 0.3, 0.3, 360, 'practical bulb lamp'),
  // Lights | HMI
  light('joker-800', 'K5600 Joker-Bug 800', 'Joker 800', 'HMI', 'hmi', 'par', 0.23, 0.33, 30, 'k5600 joker bug 800w'),
  light('joker-1600', 'K5600 Joker-Bug 1600', 'Joker 1600', 'HMI', 'hmi', 'par', 0.28, 0.45, 30, 'k5600 joker bug 1600w'),
  light('arri-d5', 'ARRI 575 fresnel', '575', 'HMI', 'hmi', 'fresnel', 0.3, 0.35, 40, 'arri true blue d5 575w'),
  light('arrisun-12', 'ARRISUN 12 PAR 1.2K', '1.2K PAR', 'HMI', 'hmi', 'par', 0.4, 0.4, 30, 'arri arrisun 1200w par'),
  light('arri-m18', 'ARRI M18', 'M18', 'HMI', 'hmi', 'open-face', 0.39, 0.39, 40, 'arri 1800w daylight'),
  light('hmi-4k-fresnel', '4K HMI fresnel', '4K', 'HMI', 'hmi', 'fresnel', 0.5, 0.6, 40, 'arri compact 4000w true blue d40'),
  light('hmi-4k-par', '4K HMI PAR', '4K PAR', 'HMI', 'hmi', 'par', 0.6, 0.6, 30, 'arrisun 40 25 4000w'),
  light('arri-m40', 'ARRI M40', 'M40', 'HMI', 'hmi', 'open-face', 0.51, 0.47, 40, 'arri 4000w'),
  light('hmi-6k-fresnel', '6K HMI fresnel', '6K', 'HMI', 'hmi', 'fresnel', 0.55, 0.65, 40, 'arri compact 6000w'),
  light('arri-m90', 'ARRI M90', 'M90', 'HMI', 'hmi', 'open-face', 0.71, 0.72, 40, 'arri 9000w'),
  light('hmi-12k-fresnel', '12K HMI fresnel', '12K', 'HMI', 'hmi', 'fresnel', 0.75, 0.85, 40, 'arri 12000w'),
  light('hmi-18k-fresnel', '18K HMI fresnel', '18K', 'HMI', 'hmi', 'fresnel', 0.85, 0.95, 40, 'arri 18000w'),
  light('arrimax', 'ARRIMAX 18/12', 'ARRIMAX', 'HMI', 'hmi', 'open-face', 0.78, 0.94, 40, 'arri max 18k 12k'),
  // Lights | LED panels
  light('arri-skypanel-s30', 'ARRI SkyPanel S30-C', 'S30', 'LED panels', 'led', 'panel', 0.43, 0.13, 110, 'arri skypanel'),
  light('arri-skypanel-s60', 'ARRI SkyPanel S60-C', 'S60', 'LED panels', 'led', 'panel', 0.83, 0.13, 110, 'arri skypanel'),
  light('arri-skypanel-s120', 'ARRI SkyPanel S120-C', 'S120', 'LED panels', 'led', 'panel', 1.47, 0.13, 110, 'arri skypanel'),
  light('arri-skypanel-s360', 'ARRI SkyPanel S360-C', 'S360', 'LED panels', 'led', 'panel', 1.4, 0.32, 110, 'arri skypanel'),
  light('gemini-1x1', 'Litepanels Gemini 1x1', 'Gemini 1x1', 'LED panels', 'led', 'panel', 0.38, 0.15, 100, 'litepanels'),
  light('gemini-2x1', 'Litepanels Gemini 2x1', 'Gemini 2x1', 'LED panels', 'led', 'panel', 0.63, 0.18, 100, 'litepanels'),
  light('vortex4', 'Creamsource Vortex4', 'Vortex4', 'LED panels', 'led', 'panel', 0.38, 0.12, 60, 'creamsource 1x1'),
  light('vortex8', 'Creamsource Vortex8', 'Vortex8', 'LED panels', 'led', 'panel', 0.76, 0.12, 60, 'creamsource 2x1'),
  light('nova-p300c', 'Aputure Nova P300c', 'P300c', 'LED panels', 'led', 'panel', 0.65, 0.1, 110, 'aputure nova'),
  light('nova-p600c', 'Aputure Nova P600c', 'P600c', 'LED panels', 'led', 'panel', 0.93, 0.13, 110, 'aputure nova'),
  light('kino-celeb-450', 'Kino Flo Celeb 450', 'Celeb', 'LED panels', 'led', 'panel', 1.21, 0.13, 100, 'kino flo kinoflo 4ft'),
  light('led-mat-2x2', 'LED mat 2x2', 'Mat', 'LED panels', 'led', 'panel', 0.61, 0.05, 120, 'litegear litemat flexible fabric', true),
  light('led-mat-4x4', 'LED mat 4x4', 'Mat', 'LED panels', 'led', 'panel', 1.22, 0.05, 120, 'litegear litemat flexible fabric', true),
  // Lights | COB and LED fresnels
  light('aputure-300d', 'Aputure LS 300d II', '300d', 'COB and LED fresnels', 'led', 'cob', 0.25, 0.3, 55, 'aputure cob'),
  light('aputure-600d', 'Aputure LS 600d Pro', '600d', 'COB and LED fresnels', 'led', 'cob', 0.3, 0.3, 55, 'aputure cob'),
  light('aputure-1200d', 'Aputure LS 1200d Pro', '1200d', 'COB and LED fresnels', 'led', 'cob', 0.33, 0.54, 55, 'aputure cob'),
  light('nanlite-forza-500', 'Nanlite Forza 500', 'Forza 500', 'COB and LED fresnels', 'led', 'cob', 0.2, 0.32, 55, 'nanlite cob'),
  light('arri-orbiter', 'ARRI Orbiter', 'Orbiter', 'COB and LED fresnels', 'led', 'cob', 0.3, 0.45, 50, 'arri'),
  light('arri-l5', 'ARRI L5-C', 'L5', 'COB and LED fresnels', 'led', 'fresnel', 0.2, 0.28, 40, 'arri l series led fresnel'),
  light('arri-l7', 'ARRI L7-C', 'L7', 'COB and LED fresnels', 'led', 'fresnel', 0.28, 0.36, 40, 'arri l series led fresnel'),
  light('arri-l10', 'ARRI L10-C', 'L10', 'COB and LED fresnels', 'led', 'fresnel', 0.5, 0.56, 40, 'arri l series led fresnel'),
  // Lights | Tubes
  light('astera-helios', 'Astera Helios Tube', 'Helios', 'Tubes', 'led', 'tube', 0.52, 0.05, 180, 'astera tube 2ft'),
  light('astera-titan', 'Astera Titan Tube', 'Titan', 'Tubes', 'led', 'tube', 1.04, 0.05, 180, 'astera tube 4ft'),
  light('quasar-4ft', 'Quasar Science 4 ft', 'Quasar 4', 'Tubes', 'led', 'tube', 1.22, 0.05, 180, 'quasar tube'),
  light('quasar-8ft', 'Quasar Science 8 ft', 'Quasar 8', 'Tubes', 'led', 'tube', 2.44, 0.05, 180, 'quasar tube'),
  light('infinibar-pb12', 'Aputure INFINIBAR PB12', 'PB12', 'Tubes', 'led', 'tube', 1.2, 0.05, 180, 'aputure infinibar pixel bar'),
  // Lights | Balloons
  light('balloon-2k', 'Balloon light 2K', 'Balloon 2K', 'Balloons', 'tungsten', 'balloon', 1.3, 1.3, 360, 'airstar balloon', true),
  light('balloon-4k-hmi', 'Balloon light 4K HMI', 'Balloon 4K', 'Balloons', 'hmi', 'balloon', 1.6, 1.6, 360, 'airstar balloon', true),
  light('balloon-led', 'Balloon light LED 2 m', 'Balloon', 'Balloons', 'led', 'balloon', 2, 2, 360, 'airstar crystal balloon', true),

  // Camera support
  dollies('fisher-10', 'Fisher 10 dolly', 'Fisher 10', 'dolly', 0.66, 1.17, 'dolly fisher'),
  dollies('fisher-11', 'Fisher 11 dolly', 'Fisher 11', 'dolly', 0.65, 1.02, 'dolly fisher'),
  dollies('peewee-3', 'Chapman Super PeeWee III', 'PeeWee', 'dolly', 0.51, 0.88, 'dolly chapman peewee'),
  dollies('peewee-4', 'Chapman Super PeeWee IV', 'PeeWee IV', 'dolly', 0.64, 0.88, 'dolly chapman peewee'),
  dollies('hybrid-4', 'Chapman Hybrid IV', 'Hybrid', 'dolly', 0.69, 1.17, 'dolly chapman hybrid'),
  dollies('doorway-dolly', 'Doorway dolly', 'Doorway', 'dolly', 0.76, 1.22, 'dolly doorway'),
  dollies('western-dolly', 'Western dolly', 'Western', 'dolly', 1.22, 1.93, 'dolly western'),
  track('track-straight', 'Dolly track', 'Track', 'track', 0.62, 2.44, 'track rails straight 8ft', true),
  track('track-curved', 'Curved track 90°', 'Curve', 'curved-track', 0.62, 3.05, 'track rails curve curved round', true),
  track('dana-dolly', 'Dana Dolly', 'Dana', 'track', 0.6, 2.4, 'dana dolly pipe', true),
  track('slider-60', 'Slider 60 cm', 'Slider', 'slider', 0.15, 0.6, 'slider', true),
  track('slider', 'Slider 1 m', 'Slider', 'slider', 0.15, 1, 'slider', true),
  legs('tripod', 'Tripod', 'Sticks', 'tripod', 0.9, 0.9, 'sticks tripod legs'),
  legs('baby-legs', 'Baby legs', 'Baby legs', 'tripod', 0.6, 0.6, 'sticks short tripod'),
  legs('hi-hat', 'Hi-hat', 'Hi-hat', 'tripod', 0.35, 0.35, 'high hat low'),
  legs('steadicam', 'Steadicam', 'Steadicam', 'rig', 0.6, 0.6, 'steadicam operator vest'),
  legs('handheld', 'Handheld / gimbal', 'Handheld', 'rig', 0.5, 0.5, 'handheld ronin gimbal shoulder easyrig'),
  arms('porta-jib', 'Porta-Jib Traveller', 'Jib', 'jib', 0.9, 1.8, 'portajib jib arm', true),
  arms('jimmy-jib', 'Jimmy Jib', 'Jimmy Jib', 'jib', 1.2, 6, 'jib arm crane remote head', true),
  arms('technocrane-15', 'Supertechno 15', 'Techno 15', 'crane', 0.78, 6.04, 'technocrane telescopic crane', true),
  arms('technocrane-30', 'Supertechno 30', 'Techno 30', 'crane', 1.49, 11.95, 'technocrane telescopic crane', true),
  cars('russian-arm', 'Russian arm car', 'Arm car', 'vehicle', 2, 5, 'russian arm u-crane tracking vehicle camera car'),
  cars('process-trailer', 'Low loader', 'Low loader', 'vehicle', 2.5, 6, 'process trailer low loader tow'),
  cars('drone', 'Drone', 'Drone', 'box', 0.7, 0.7, 'drone uav aerial inspire'),

  // Grip
  flags('flag-12x18', 'Flag 12x18', '12x18', 'flag', 0.3, 0.03, 'flag solid'),
  flags('flag-18x24', 'Flag 18x24', '18x24', 'flag', 0.46, 0.03, 'flag solid'),
  flags('flag-24x36', 'Flag 24x36', '24x36', 'flag', 0.61, 0.03, 'flag solid'),
  flags('solid-4x4', 'Solid 4x4', '4x4', 'flag', 1.22, 0.03, 'flag solid'),
  flags('floppy-4x4', 'Floppy 4x4', '4x4 floppy', 'flag', 1.22, 0.03, 'floppy flag solid'),
  flags('cutter-10x42', 'Cutter 10x42', '10x42', 'flag', 1.07, 0.03, 'cutter flag'),
  flags('cutter-18x48', 'Cutter 18x48', '18x48', 'flag', 1.22, 0.03, 'cutter flag'),
  flags('cutter-24x72', 'Cutter 24x72', '24x72', 'flag', 1.83, 0.03, 'cutter flag'),
  frames('frame-4x4', 'Frame 4x4', '4x4', 'frame', 1.22, 1.22, 'silk diffusion net frame', true),
  frames('frame-6x6', 'Frame 6x6', '6x6', 'frame', 1.83, 1.83, 'butterfly silk diffusion frame', true),
  frames('frame-8x8', 'Frame 8x8', '8x8', 'frame', 2.44, 2.44, 'butterfly silk diffusion frame', true),
  frames('frame-12x12', 'Frame 12x12', '12x12', 'frame', 3.66, 3.66, 'butterfly overhead silk diffusion frame', true),
  frames('frame-20x20', 'Frame 20x20', '20x20', 'frame', 6.1, 6.1, 'overhead silk diffusion frame', true),
  bounce('polyboard', 'Polyboard 8x4', 'Poly', 'board', 1.22, 0.05, 'poly bounce board polystyrene'),
  bounce('bounce-4x4', 'Bounce board 4x4', 'Bounce', 'board', 1.22, 0.03, 'bounce foamcore beadboard'),
  bounce('v-flat', 'V-flat', 'V-flat', 'vflat', 1.6, 0.6, 'v flat bounce negative fill'),
  stands('c-stand', 'C-stand', 'C-stand', 'stand', 0.7, 0.7, 'century stand'),
  stands('baby-stand', 'Baby stand', 'Stand', 'stand', 0.9, 0.9, 'light stand baby'),
  stands('combo-stand', 'Combo stand', 'Combo', 'stand', 1.1, 1.1, 'combo stand junior'),
  stands('roller-stand', 'Roller stand', 'Roller', 'stand', 1.2, 1.2, 'roller rolling stand mombo'),
  stands('wind-up-stand', 'Wind-up stand', 'Wind-up', 'stand', 1.5, 1.5, 'wind up crank stand'),
  stands('menace-arm', 'Menace arm', 'Menace', 'boom', 1.2, 3.6, 'menace arm boom overhead', true),
  rigging('apple-box', 'Apple box', 'Apple', 'box', 0.51, 0.3, 'apple box full half pancake'),
  rigging('sandbag', 'Sandbag', 'Bag', 'box', 0.45, 0.25, 'sand bag shot bag weight'),
  rigging('ladder', 'Step ladder', 'Ladder', 'ladder', 0.6, 1.2, 'ladder steps'),
  rigging('scaffold-tower', 'Scaffold tower', 'Tower', 'frame', 1.45, 2.5, 'scaffold tower boss', true),
  rigging('scissor-lift', 'Scissor lift', 'Scissor', 'vehicle', 0.81, 1.83, 'scissor lift genie mewp'),
  rigging('cherry-picker', 'Cherry picker', 'Cherry picker', 'crane', 2.3, 12, 'cherry picker boom lift condor mewp', true),
  effects('wind-machine', 'Wind machine', 'Wind', 'box', 0.8, 0.5, 'fan wind machine ritter'),
  effects('hazer', 'Hazer', 'Haze', 'box', 0.3, 0.5, 'hazer smoke fog'),

  // Unit base
  tents('easy-up-3x3', 'Easy-up 3 x 3 m', 'Easy-up', 'tent', 3, 3, 'gazebo tent pop up easy up', true),
  tents('easy-up-3x4.5', 'Easy-up 3 x 4.5 m', 'Easy-up', 'tent', 4.5, 3, 'gazebo tent pop up easy up', true),
  tents('easy-up-6x3', 'Easy-up 6 x 3 m', 'Easy-up', 'tent', 6, 3, 'gazebo tent pop up easy up', true),
  tents('marquee', 'Marquee 6 x 12 m', 'Marquee', 'tent', 12, 6, 'marquee tent dining', true),
  village('video-village', 'Video village', 'Video village', 'monitor', 1.2, 0.6, 'monitor vtr'),
  village('dit-cart', 'DIT cart', 'DIT', 'monitor', 1, 0.6, 'dit data cart'),
  village('sound-cart', 'Sound cart', 'Sound', 'box', 1, 0.6, 'sound recordist cart mixer'),
  village('magliner', 'Magliner cart', 'Cart', 'box', 0.53, 1.21, 'magliner cart trolley'),
  village('directors-chair', "Director's chair", 'Chair', 'box', 0.55, 0.55, 'chair directors'),
  village('table-6ft', 'Table 6 ft', 'Table', 'box', 1.83, 0.76, 'trestle table'),
  power('generator-small', 'Generator 7 kVA', 'Genny', 'generator', 0.7, 1.2, 'genny power suitcase honda'),
  power('generator', 'Generator 60 kVA', 'Genny', 'generator', 1.1, 2.4, 'genny power towable'),
  power('generator-large', 'Generator 200 kVA', 'Genny', 'generator', 2.5, 6, 'genny power truck mounted'),
  power('distro', 'Distro box', 'Distro', 'box', 0.4, 0.6, 'distribution power box'),
  trucks('camera-truck', 'Camera truck', 'Camera truck', 'vehicle', 2.5, 8, 'truck camera 7.5t'),
  trucks('grip-truck', 'Grip truck', 'Grip truck', 'vehicle', 2.55, 10, 'truck grip 18t'),
  trucks('lighting-truck', 'Lighting truck', 'Lighting truck', 'vehicle', 2.55, 10, 'truck sparks lighting 18t'),
  trucks('trailer', 'Artist trailer', 'Artist', 'vehicle', 2.5, 7, 'trailer two way honeywagon cast'),
  trucks('makeup-trailer', 'Make-up trailer', 'Make-up', 'vehicle', 2.55, 10, 'trailer hair make up'),
  trucks('costume-trailer', 'Costume trailer', 'Costume', 'vehicle', 2.55, 10, 'trailer wardrobe costume'),
  trucks('honeywagon', 'Honeywagon', 'Honeywagon', 'vehicle', 2.55, 12, 'trailer toilets dressing rooms'),
  trucks('catering-truck', 'Catering truck', 'Catering', 'vehicle', 2.5, 8, 'catering food truck'),
  trucks('dining-bus', 'Dining bus', 'Dining', 'vehicle', 2.55, 12, 'dining bus double decker'),
  trucks('van', 'Van', 'Van', 'vehicle', 2, 6, 'van sprinter splitter'),
  trucks('minibus', 'Minibus', 'Minibus', 'vehicle', 2, 7, 'minibus unit transport'),
  trucks('car', 'Car', 'Car', 'vehicle', 1.8, 4.7, 'car unit'),
  facilities('toilet-block', 'Toilet block', 'Toilets', 'vehicle', 2.4, 6, 'toilets loos welfare'),
  facilities('portaloo', 'Portable toilet', 'WC', 'box', 1.1, 1.2, 'portaloo toilet loo'),
  site('crowd-barrier', 'Crowd barrier', 'Barrier', 'barrier', 2.3, 0.6, 'barrier fence crowd control', true),
  site('cone', 'Traffic cone', 'Cone', 'cone', 0.38, 0.38, 'cone traffic'),
  site('parking-bay', 'Parking bay', 'Parking', 'area', 2.5, 5, 'parking bay space area zone', true),
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
    const haystack = [item.name, item.short, item.group, item.keywords ?? '', EQUIPMENT_CATEGORY_LABELS[item.category], item.light ? LIGHT_SOURCE_LABELS[item.light.source] : '']
      .join(' ')
      .toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}
