export type GlobalSearchResultType =
  | 'cast'
  | 'crew'
  | 'scene'
  | 'location'
  | 'document'
  | 'purchase_order'
  | 'vendor'
  | 'equipment'

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
