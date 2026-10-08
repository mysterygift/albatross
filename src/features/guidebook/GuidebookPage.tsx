import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { openInSystem } from '@/lib/files'
import {
  findChapter,
  guidebookChapters,
  guidebookPath,
  GUIDEBOOK_INDEX_SLUG,
} from '@/lib/guidebook/guidebook'
import { GuidebookContents } from '@/features/guidebook/GuidebookContents'
import { GuidebookMarkdown } from '@/features/guidebook/GuidebookMarkdown'

function scrollToId(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ block: 'start' })
  return true
}

/** Nearest ancestor that scrolls vertically (the app's `<main>`), if any. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/** Guidebook: the `GUIDEBOOK/` markdown rendered in the app, with a contents sidebar. */
export function GuidebookPage() {
  const { chapter: chapterParam } = useParams<{ chapter?: string }>()
  const { hash } = useLocation()
  const navigate = useNavigate()
  const articleRef = useRef<HTMLElement>(null)
  const [activeHeading, setActiveHeading] = useState<{ slug: string; id: string } | null>(null)

  const chapter = findChapter(chapterParam)
  const slug = chapter?.slug

  // A newly opened chapter always starts at the very top of the page (before paint, so there is no flash
  // of the previous chapter's scroll position). Jumping to a section within it is handled below.
  useLayoutEffect(() => {
    const scroller = scrollParent(articleRef.current)
    if (scroller) scroller.scrollTop = 0
    window.scrollTo(0, 0)
  }, [slug])

  // Scroll to a section whenever the hash changes.
  useEffect(() => {
    const id = hash ? decodeURIComponent(hash.slice(1)) : ''
    if (id) scrollToId(id)
  }, [slug, hash])

  // Highlight the section currently at the top of the page.
  useEffect(() => {
    const article = articleRef.current
    if (!article || typeof IntersectionObserver === 'undefined') return
    const headings = Array.from(article.querySelectorAll<HTMLElement>('h2[id], h3[id]'))
    if (headings.length === 0) return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        const first = headings.find((h) => visible.has(h.id))
        if (first && slug) setActiveHeading({ slug, id: first.id })
      },
      { rootMargin: '0px 0px -75% 0px' }
    )
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [slug])
  const activeHeadingId = activeHeading && activeHeading.slug === slug ? activeHeading.id : null

  const openChapter = useCallback(
    (target: string, targetHash = '') => navigate(guidebookPath(target, targetHash)),
    [navigate]
  )
  const jumpToAnchor = useCallback(
    (id: string) => {
      if (slug) navigate(guidebookPath(slug, `#${id}`), { replace: true })
    },
    [navigate, slug]
  )
  const openExternal = useCallback((url: string) => {
    void Promise.resolve()
      .then(() => openInSystem(url))
      .catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer')
      })
  }, [])

  if (!chapter) return <Navigate to={guidebookPath(GUIDEBOOK_INDEX_SLUG)} replace />

  const index = guidebookChapters.findIndex((c) => c.slug === chapter.slug)
  const prev = index > 0 ? guidebookChapters[index - 1] : undefined
  const next = index < guidebookChapters.length - 1 ? guidebookChapters[index + 1] : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title="Guidebook"
        description="How to use Albatross, chapter by chapter."
      />
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <GuidebookContents
          chapters={guidebookChapters}
          activeSlug={chapter.slug}
          activeHeadingId={activeHeadingId}
          onSelectChapter={(s) => openChapter(s)}
          onSelectHeading={(s, id) => openChapter(s, `#${id}`)}
        />
        <article ref={articleRef} className="min-w-0 max-w-3xl flex-1 pb-10">
          <GuidebookMarkdown
            markdown={chapter.markdown}
            onOpenChapter={openChapter}
            onJumpToAnchor={jumpToAnchor}
            onOpenExternal={openExternal}
          />
          <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-4">
            {prev ? (
              <Button variant="outline" size="sm" onClick={() => openChapter(prev.slug)}>
                <ChevronLeft className="size-4" />
                {prev.title}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button variant="outline" size="sm" onClick={() => openChapter(next.slug)}>
                {next.title}
                <ChevronRight className="size-4" />
              </Button>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  )
}
