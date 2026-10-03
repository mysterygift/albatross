/** Settings key (key-value `settings` table) that stores the chosen UI look. */
export const UI_THEME_SETTING_KEY = 'ui_theme'

export const UI_THEMES = [
  {
    id: 'albatross-mint',
    label: 'Albatross Mint',
    description: 'Graphite charcoal with a single mint accent.',
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'Cream paper with tomato, ultramarine and sun-yellow blocks, heavy type and hard shadows.',
  },
  {
    id: 'yuzu',
    label: 'Yuzu',
    description: 'Near-white with hairline ink grids, acid lime and lilac accents, and square corners.',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm paper with navy, teal and pink, overprinted dot screens and pill shapes.',
  },
  {
    id: 'signal',
    label: 'Signal',
    description: 'Dark ops palette with mono labels, hairline grids and a single signal-yellow accent.',
  },
  {
    id: 'ledger',
    label: 'Ledger',
    description: 'Serif headings, double rules and an oxblood accent on paper, like a printed ledger.',
  },
  {
    id: 'clay',
    label: 'Clay',
    description: 'Soft pastel blocks, rounded shapes and a tactile bottom-edge shadow, with no outlines.',
  },
] as const

export type UiThemeId = (typeof UI_THEMES)[number]['id']

export const DEFAULT_UI_THEME: UiThemeId = 'albatross-mint'

/** Ids that were renamed or retired; a stored value of one of these resolves to its replacement. */
const RETIRED_UI_THEME_IDS: Record<string, UiThemeId> = {
  'albatross-bold': 'bold',
}

export function isUiThemeId(value: unknown): value is UiThemeId {
  return UI_THEMES.some((theme) => theme.id === value)
}

/** Resolve a stored value to a known theme, falling back to the default for anything else. */
export function resolveUiTheme(value: string | null | undefined): UiThemeId {
  if (value && value in RETIRED_UI_THEME_IDS) return RETIRED_UI_THEME_IDS[value]!
  return isUiThemeId(value) ? value : DEFAULT_UI_THEME
}

/** Sets the attribute that the scoped theme stylesheets key off (see src/styles/themes). */
export function applyUiTheme(id: UiThemeId): void {
  document.documentElement.dataset.uiTheme = id
}
