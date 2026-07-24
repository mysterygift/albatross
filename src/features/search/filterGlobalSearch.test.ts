import { describe, it, expect } from 'vitest'

import {
  BROWSE_PREVIEW_PER_GROUP,
  MAX_RESULTS_PER_GROUP,
  filterGlobalSearch,
} from '@/features/search/filterGlobalSearch'
import type { GlobalSearchResult, GlobalSearchResultType } from '@/features/search/types'

function makeResult(
  type: GlobalSearchResultType,
  id: string,
  searchText: string
): GlobalSearchResult {
  return {
    id,
    type,
    title: searchText,
    subtitle: null,
    searchText: searchText.toLowerCase(),
    to: `/${type}/${id}`,
  }
}

describe('filterGlobalSearch', () => {
  it('matches results by case-insensitive substring against searchText', () => {
    const index = [
      makeResult('cast', 'c1', 'Jane Doe'),
      makeResult('crew', 'r1', 'John Gaffer'),
      makeResult('location', 'l1', 'Warehouse'),
    ]

    const grouped = filterGlobalSearch(index, 'jane')
    expect(grouped.get('cast')?.results.map((r) => r.id)).toEqual(['c1'])
    expect(grouped.has('crew')).toBe(false)
    expect(grouped.has('location')).toBe(false)
  })

  it('groups matches by type', () => {
    const index = [
      makeResult('cast', 'c1', 'Alpha'),
      makeResult('scene', 's1', 'Alpha scene'),
      makeResult('scene', 's2', 'Alpha again'),
    ]

    const grouped = filterGlobalSearch(index, 'alpha')
    expect(grouped.get('cast')?.results).toHaveLength(1)
    expect(grouped.get('scene')?.results).toHaveLength(2)
  })

  it('returns browse preview per group when query is empty', () => {
    const index = Array.from({ length: BROWSE_PREVIEW_PER_GROUP + 3 }, (_, i) =>
      makeResult('document', `d${i}`, `Doc ${i}`)
    )

    const grouped = filterGlobalSearch(index, '')
    const docs = grouped.get('document')!
    expect(docs.results).toHaveLength(BROWSE_PREVIEW_PER_GROUP)
    expect(docs.hiddenCount).toBe(0)
  })

  it('caps results per group and reports hiddenCount when searching', () => {
    const index = Array.from({ length: MAX_RESULTS_PER_GROUP + 4 }, (_, i) =>
      makeResult('purchase_order', `p${i}`, `PO match ${i}`)
    )

    const grouped = filterGlobalSearch(index, 'match')
    const pos = grouped.get('purchase_order')!
    expect(pos.results).toHaveLength(MAX_RESULTS_PER_GROUP)
    expect(pos.hiddenCount).toBe(4)
  })

  it('trims whitespace-only queries to the browse view', () => {
    const index = [makeResult('cast', 'c1', 'Zed')]
    const grouped = filterGlobalSearch(index, '   ')
    expect(grouped.get('cast')?.results).toHaveLength(1)
  })
})
