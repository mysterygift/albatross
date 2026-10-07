/**
 * Script Breakdown categories: label, highlight colour and keyboard shortcut, in sheet order. The tagging
 * page, the on-screen sheet and the PDFs all read from here. The first six colours follow the production's
 * paper breakdown template (Cast green, Props blue, Extras mauve, Costume salmon, Locations yellow,
 * Lighting red).
 */
import { BREAKDOWN_CATEGORY_VALUES, type BreakdownCategory } from '@/lib/db/types'

export type BreakdownCategoryInfo = {
  key: BreakdownCategory
  label: string
  /** Highlight colour (hex). Text highlights use it at the section editor's 40% tint. */
  colour: string
  /** Key that tags the current selection with this category. */
  shortcut: string
  /** The category has a production database to match elements against. */
  matchable: boolean
}

export const BREAKDOWN_CATEGORIES: readonly BreakdownCategoryInfo[] = [
  { key: 'cast', label: 'Cast', colour: '#6aa84f', shortcut: '1', matchable: true },
  { key: 'props', label: 'Props', colour: '#6d9eeb', shortcut: '2', matchable: false },
  { key: 'extras', label: 'Extras', colour: '#c27ba0', shortcut: '3', matchable: false },
  { key: 'costume', label: 'Costume', colour: '#e06666', shortcut: '4', matchable: false },
  { key: 'locations', label: 'Locations', colour: '#f1c232', shortcut: '5', matchable: true },
  { key: 'lighting', label: 'Lighting', colour: '#ff2d14', shortcut: '6', matchable: true },
  { key: 'foley_music', label: 'Foley/Music', colour: '#26a69a', shortcut: '7', matchable: true },
  { key: 'special_fx', label: 'Special FX', colour: '#f6892b', shortcut: '8', matchable: false },
  { key: 'stunts', label: 'Stunts/Choreography', colour: '#8e6cd1', shortcut: '9', matchable: false },
  { key: 'animals_children', label: 'Animals/Children', colour: '#a1724e', shortcut: '0', matchable: false },
  { key: 'vehicles', label: 'Vehicles', colour: '#8c99a6', shortcut: '-', matchable: false },
]

const BY_KEY = new Map(BREAKDOWN_CATEGORIES.map((c) => [c.key, c]))

export function breakdownCategory(key: BreakdownCategory): BreakdownCategoryInfo {
  return BY_KEY.get(key)!
}

export function isBreakdownCategory(value: string): value is BreakdownCategory {
  return (BREAKDOWN_CATEGORY_VALUES as readonly string[]).includes(value)
}

/** Sheet order index, for sorting. */
export function breakdownCategoryOrder(key: BreakdownCategory): number {
  return BREAKDOWN_CATEGORY_VALUES.indexOf(key)
}

export function categoryForShortcut(key: string): BreakdownCategoryInfo | null {
  return BREAKDOWN_CATEGORIES.find((c) => c.shortcut === key) ?? null
}

/** Name for a new element from the tagged words: whitespace collapsed; cast and locations upper-cased. */
export function elementNameFromText(category: BreakdownCategory, text: string): string {
  const name = text.replace(/\s+/g, ' ').trim()
  return category === 'cast' || category === 'locations' ? name.toUpperCase() : name
}
