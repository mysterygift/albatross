import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { SECTION_BADGE, SECTION_ICON } from '@/features/search/sectionMeta'
import type { GlobalSearchResult } from '@/features/search/types'

const CARD_WIDTH = 288
const GAP = 8
const MARGIN = 8
/** Enter/exit transition length; keep in sync with the `duration-150` class. */
const ANIMATION_MS = 150

type GlobalSearchResultPreviewProps = {
  result: GlobalSearchResult | null
  anchorEl: HTMLElement | null
}

/**
 * Read-only overview card anchored to the right of the highlighted search row.
 * Portaled to the body so it escapes the dialog's overflow/transform clipping;
 * repositions on scroll of the results list and on window resize. Fades and
 * slides in from the left on appear, and reverses on disappear (the last
 * result is retained during the exit transition before unmounting).
 */
export function GlobalSearchResultPreview({
  result,
  anchorEl,
}: GlobalSearchResultPreviewProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  // Retain the last non-null result/anchor so the exit animation can play out.
  const [rendered, setRendered] = useState<{
    result: GlobalSearchResult
    anchorEl: HTMLElement
  } | null>(null)
  const [entered, setEntered] = useState(false)

  const isOpen = !!(result && anchorEl)

  // Store the latest shown item during render (React's "adjust state on prop
  // change" pattern); on close we keep the last one until the exit timer fires.
  if (isOpen && rendered?.result !== result) {
    setRendered({ result, anchorEl })
  }
  // Reset the enter flag once closed so the next open re-animates.
  if (!isOpen && entered) {
    setEntered(false)
  }

  // Flip to the entered state one frame after opening so the enter transition
  // plays. On close, `visible` drops synchronously (isOpen is false during
  // render), so the exit transition starts immediately and finishes exactly as
  // the unmount timer fires — avoiding a cut-off/stutter.
  useEffect(() => {
    if (!isOpen) return
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [isOpen])

  // After the exit transition, drop the retained item so the card unmounts.
  useEffect(() => {
    if (isOpen) return
    const timer = setTimeout(() => setRendered(null), ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [isOpen])

  const visible = isOpen && entered
  const activeAnchor = rendered?.anchorEl ?? null

  useLayoutEffect(() => {
    if (!activeAnchor) return

    const compute = () => {
      if (!activeAnchor.isConnected) return
      const rect = activeAnchor.getBoundingClientRect()
      const cardHeight = cardRef.current?.offsetHeight ?? 240

      let left = rect.right + GAP
      if (left + CARD_WIDTH > window.innerWidth - MARGIN) {
        left = rect.left - GAP - CARD_WIDTH
      }
      left = Math.max(MARGIN, left)

      let top = rect.top
      top = Math.min(top, window.innerHeight - cardHeight - MARGIN)
      top = Math.max(MARGIN, top)

      setPosition({ top, left })
    }

    compute()

    const scrollParent = activeAnchor.closest('[data-slot="command-list"]')
    scrollParent?.addEventListener('scroll', compute)
    window.addEventListener('resize', compute)
    return () => {
      scrollParent?.removeEventListener('scroll', compute)
      window.removeEventListener('resize', compute)
    }
  }, [activeAnchor])

  if (!rendered) return null

  const Icon = SECTION_ICON[rendered.result.type]

  return createPortal(
    <div
      ref={cardRef}
      data-search-preview
      role="region"
      aria-label={`${rendered.result.title} overview`}
      className={cn(
        'fixed z-[60] flex max-h-[70vh] w-72 flex-col overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md',
        'transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
        visible ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'
      )}
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
      }}
    >
      <div className="border-b px-3 py-2.5">
        <div className="mb-1 flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <Badge variant="secondary" className="shrink-0">
            {SECTION_BADGE[rendered.result.type]}
          </Badge>
        </div>
        <p className="truncate text-sm font-medium">{rendered.result.preview.heading}</p>
        {rendered.result.preview.subheading && (
          <p className="truncate text-xs text-muted-foreground">
            {rendered.result.preview.subheading}
          </p>
        )}
      </div>
      {rendered.result.preview.fields.length > 0 ? (
        <dl className="divide-y">
          {rendered.result.preview.fields.map((field) => (
            <div key={field.label} className="px-3 py-2">
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="text-sm break-words">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-3 py-3 text-sm text-muted-foreground">No additional details.</p>
      )}
    </div>,
    document.body
  )
}
