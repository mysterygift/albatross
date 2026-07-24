import type { GlobalSearchResult, GlobalSearchResultType } from '@/features/search/types'

/** Max results shown per group while actively searching. */
export const MAX_RESULTS_PER_GROUP = 8
/** Number of results shown per group in the empty-query browse view. */
export const BROWSE_PREVIEW_PER_GROUP = 5

export type GlobalSearchGroup = {
  type: GlobalSearchResultType
  results: GlobalSearchResult[]
  /** Number of matches hidden by the per-group cap (0 when none). */
  hiddenCount: number
}

/**
 * Filters and groups the global search index for display.
 *
 * - Empty query: returns the first {@link BROWSE_PREVIEW_PER_GROUP} of each
 *   group as a lightweight browse view.
 * - Non-empty query: case-insensitive substring match against `searchText`,
 *   capped at {@link MAX_RESULTS_PER_GROUP} per group with a `hiddenCount`.
 */
export function filterGlobalSearch(
  index: GlobalSearchResult[],
  query: string
): Map<GlobalSearchResultType, GlobalSearchGroup> {
  const q = query.trim().toLowerCase()

  const matched = q
    ? index.filter((r) => r.searchText.includes(q))
    : index

  const perGroupLimit = q ? MAX_RESULTS_PER_GROUP : BROWSE_PREVIEW_PER_GROUP

  const grouped = new Map<GlobalSearchResultType, GlobalSearchResult[]>()
  for (const result of matched) {
    const list = grouped.get(result.type) ?? []
    list.push(result)
    grouped.set(result.type, list)
  }

  const out = new Map<GlobalSearchResultType, GlobalSearchGroup>()
  for (const [type, results] of grouped) {
    const capped = results.slice(0, perGroupLimit)
    // Only surface a "more results" hint while actively searching; the browse
    // view (empty query) is intentionally a preview and shows no hint.
    const hiddenCount = q ? Math.max(0, results.length - capped.length) : 0
    out.set(type, {
      type,
      results: capped,
      hiddenCount,
    })
  }
  return out
}
