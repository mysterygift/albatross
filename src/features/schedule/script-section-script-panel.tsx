import { useMemo, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildPageHighlightSegments,
  intersectTextSlices,
  rangeSliceOnPage,
  type TextOffsetSlice,
} from '@/lib/db/scriptSectionMatching'
import { parseLeadingPageNumber } from '@/lib/db/sidesBuilderService'
import type { ScriptPage, ScriptSection, ScriptSectionRange } from '@/lib/db/types'

/** Compact page/eighth label for a section's first range. */
export function formatScriptSectionRange(range: ScriptSectionRange | undefined): string {
  if (!range) return '—'
  const start = [range.start_page ? `p${range.start_page}` : null, range.start_eighth != null ? `${range.start_eighth}/8` : null]
    .filter(Boolean)
    .join(' ')
  const end = [range.end_page ? `p${range.end_page}` : null, range.end_eighth != null ? `${range.end_eighth}/8` : null]
    .filter(Boolean)
    .join(' ')
  if (!start && !end) return '—'
  if (!end || end === start) return start || '—'
  return `${start || '?'} – ${end}`
}

export function pageDisplayNumber(page: { page_number: string | null; page_index: number }): number | null {
  return parseLeadingPageNumber(page.page_number) ?? page.page_index + 1
}

/** Numeric page numbers covered by a section's first range (for text-panel highlighting). */
export function pagesForRange(range: ScriptSectionRange | undefined): Set<number> {
  const result = new Set<number>()
  if (!range) return result
  const start = parseLeadingPageNumber(range.start_page)
  const end = parseLeadingPageNumber(range.end_page ?? range.start_page)
  if (start != null && end != null && start <= end) {
    for (let p = start; p <= end; p++) result.add(p)
  } else if (start != null) {
    result.add(start)
  }
  return result
}

/** Renders page content with selected and conflict highlights. */
export function renderPageContentHighlights(
  content: string,
  pageNumber: string | null,
  selectedRange: ScriptSectionRange | undefined,
  conflictRanges: ScriptSectionRange[],
  variant: 'card' | 'dark' = 'card'
): ReactNode {
  const pageNum =
    parseLeadingPageNumber(pageNumber) ?? (pageNumber != null ? Number(pageNumber) : null)
  if (pageNum == null || !Number.isFinite(pageNum)) return content

  const len = content.length
  const selectedSlice = selectedRange ? rangeSliceOnPage(selectedRange, pageNum, len) : null
  const conflictSlices = conflictRanges
    .map((r) => rangeSliceOnPage(r, pageNum, len))
    .filter((s): s is TextOffsetSlice => s != null)

  const segments = buildPageHighlightSegments(len, selectedSlice, conflictSlices)
  if (segments.length === 0) return content

  const selectedMarkClass =
    variant === 'dark'
      ? 'rounded-sm bg-emerald-500/30 px-0.5 outline outline-1 outline-emerald-400/60'
      : 'rounded-sm bg-primary/25 px-0.5'

  const nodes: ReactNode[] = []
  let cursor = 0
  for (const seg of segments) {
    if (cursor < seg.start) nodes.push(content.slice(cursor, seg.start))
    const text = content.slice(seg.start, seg.end)
    if (seg.kind === 'overlap') {
      nodes.push(
        <mark
          key={`${seg.start}-${seg.end}`}
          className="rounded-sm bg-destructive/25 px-0.5 outline outline-2 outline-destructive"
        >
          {text}
        </mark>
      )
    } else if (seg.kind === 'conflict') {
      nodes.push(
        <mark
          key={`${seg.start}-${seg.end}`}
          className="rounded-sm bg-destructive/15 px-0.5 outline outline-2 outline-destructive"
        >
          {text}
        </mark>
      )
    } else {
      nodes.push(
        <mark key={`${seg.start}-${seg.end}`} className={selectedMarkClass}>
          {text}
        </mark>
      )
    }
    cursor = seg.end
  }
  if (cursor < len) nodes.push(content.slice(cursor))
  return <>{nodes}</>
}

export function pageHasConflictOverlap(
  page: { page_number: string | null; page_index: number; content: string | null },
  selectedRange: ScriptSectionRange | undefined,
  conflictRanges: ScriptSectionRange[]
): boolean {
  const pageNum = pageDisplayNumber(page)
  if (pageNum == null || !selectedRange) return false
  const len = (page.content ?? '').length
  const selectedSlice = rangeSliceOnPage(selectedRange, pageNum, len)
  if (!selectedSlice) return false
  return conflictRanges.some((r) => {
    const other = rangeSliceOnPage(r, pageNum, len)
    return other != null && intersectTextSlices(selectedSlice, other) != null
  })
}

export type ScriptSectionScriptPanelProps = {
  pages: ScriptPage[]
  previewSection: ScriptSection | null
  previewRange: ScriptSectionRange | undefined
  conflictRanges?: ScriptSectionRange[]
  variant?: 'card' | 'dark'
  maxHeightClass?: string
  title?: string
  subtitle?: string | null
  showCard?: boolean
}

export function ScriptSectionScriptPanel({
  pages,
  previewSection,
  previewRange,
  conflictRanges = [],
  variant = 'card',
  maxHeightClass = 'max-h-[60vh]',
  title = 'Script text',
  subtitle = null,
  showCard = true,
}: ScriptSectionScriptPanelProps) {
  const highlightedPages = useMemo(() => pagesForRange(previewRange), [previewRange])
  const selectedHasConflict = conflictRanges.length > 0

  const scriptTextPages = useMemo(() => {
    if (!previewSection) return pages
    const scenePages = pages.filter((p) => p.scene_id === previewSection.scene_id)
    return scenePages.length > 0 ? scenePages : pages
  }, [pages, previewSection])

  const isDark = variant === 'dark'
  const emptyTextClass = isDark ? 'text-sm text-zinc-500' : 'text-sm text-muted-foreground'
  const pageMetaClass = isDark ? 'text-xs text-zinc-400' : 'text-xs text-muted-foreground'
  const pageBorderInRange = isDark
    ? 'border-emerald-500/50 bg-emerald-500/10'
    : 'border-primary bg-primary/5'
  const pageBorderConflict = isDark
    ? 'border-red-500/50 bg-red-500/10 outline outline-2 outline-red-500/40'
    : 'border-destructive bg-destructive/5 outline outline-2 outline-destructive/50'
  const pageBorderDefault = isDark ? 'border-zinc-600' : 'border-border'
  const preClass = isDark
    ? 'whitespace-pre-wrap font-mono text-xs text-zinc-100'
    : 'whitespace-pre-wrap font-mono text-xs text-foreground'

  const body =
    scriptTextPages.length === 0 ? (
      <p className={emptyTextClass}>No page text available for this version.</p>
    ) : (
      <div className={`${maxHeightClass} space-y-3 overflow-y-auto`}>
        {scriptTextPages.map((page) => {
          const pageNum = pageDisplayNumber(page)
          const inRange = !!previewSection && pageNum != null && highlightedPages.has(pageNum)
          const hasConflictOnPage =
            selectedHasConflict &&
            pageHasConflictOverlap(page, previewRange, conflictRanges)
          const showHighlights = inRange || hasConflictOnPage
          return (
            <div
              key={page.id}
              className={`rounded-md border p-3 ${
                hasConflictOnPage
                  ? pageBorderConflict
                  : inRange
                    ? pageBorderInRange
                    : pageBorderDefault
              }`}
            >
              <div className={`mb-1 flex items-center gap-2 ${pageMetaClass}`}>
                <span>Page {page.page_number ?? page.page_index + 1}</span>
                {page.eighths != null && <span>· {page.eighths}/8</span>}
                {hasConflictOnPage && (
                  <span className={isDark ? 'text-red-400' : 'text-destructive'}>· overlapping range</span>
                )}
              </div>
              <pre className={preClass}>
                {showHighlights
                  ? renderPageContentHighlights(
                      page.content ?? '',
                      page.page_number,
                      previewRange,
                      conflictRanges,
                      variant
                    )
                  : (page.content ?? '')}
              </pre>
            </div>
          )
        })}
      </div>
    )

  if (!showCard) {
    return (
      <div className="flex min-h-0 flex-col">
        {(title || subtitle) && (
          <div className={`border-b py-2 ${isDark ? 'border-zinc-600' : 'border-border'}`}>
            <h4 className={`text-base font-semibold ${isDark ? 'text-zinc-100' : ''}`}>
              {title}
              {subtitle && (
                <span className={`ml-2 text-sm font-normal ${isDark ? 'text-zinc-400' : 'text-muted-foreground'}`}>
                  {subtitle}
                </span>
              )}
            </h4>
          </div>
        )}
        <div className="pt-4">{body}</div>
      </div>
    )
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border py-2">
        <CardTitle className="text-base">
          {title}
          {subtitle && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{subtitle}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">{body}</CardContent>
    </Card>
  )
}
