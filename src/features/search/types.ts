export type GlobalSearchResultType =
  | 'cast'
  | 'crew'
  | 'scene'
  | 'location'
  | 'document'
  | 'purchase_order'
  | 'vendor'
  | 'equipment'

/** A single label/value pair shown in a result's preview overview. */
export type PreviewField = { label: string; value: string }

/** Tailored, type-specific overview shown in the anchored preview card. */
export type GlobalSearchPreview = {
  heading: string
  subheading: string | null
  fields: PreviewField[]
}

export type GlobalSearchResult = {
  /** Underlying entity id. */
  id: string
  type: GlobalSearchResultType
  /** Primary label shown in the result row. */
  title: string
  /** Secondary muted line shown under the title. */
  subtitle: string | null
  /** Pre-joined, lower-cased searchable text used for filtering. */
  searchText: string
  /** Route (with any query params) to navigate to on select. */
  to: string
  /** Tailored overview shown when the row's preview is opened. */
  preview: GlobalSearchPreview
}

/** Section metadata for grouping/labeling results in the UI. */
export const GLOBAL_SEARCH_SECTIONS: Array<{
  type: GlobalSearchResultType
  label: string
}> = [
  { type: 'cast', label: 'Cast' },
  { type: 'crew', label: 'Crew' },
  { type: 'scene', label: 'Scenes' },
  { type: 'location', label: 'Locations' },
  { type: 'equipment', label: 'Equipment' },
  { type: 'document', label: 'Documents' },
  { type: 'vendor', label: 'Vendors' },
  { type: 'purchase_order', label: 'Purchase Orders' },
]

export type GlobalSearchCommandGroup = 'go' | 'create' | 'general'

export type GlobalSearchCommandContext = {
  navigate: (to: string) => void
  openShortcuts?: () => void
}

/** A palette command (navigate or create), as opposed to an entity search result. */
export type GlobalSearchCommand = {
  id: string
  label: string
  group: GlobalSearchCommandGroup
  /** Secondary muted text (e.g. the navigation group label). */
  subtitle?: string
  keywords: string[]
  /** Menu accelerator (e.g. `CmdOrCtrl+B`), shown as a shortcut hint. */
  accelerator?: string
  /** Disabled (with a hint) while no production is selected. */
  requiresProduction?: boolean
  run: (ctx: GlobalSearchCommandContext) => void
}
