import { cn } from '@/lib/utils'
import type { GuidebookChapter } from '@/lib/guidebook/guidebook'

interface GuidebookContentsProps {
  chapters: GuidebookChapter[]
  activeSlug: string
  activeHeadingId: string | null
  onSelectChapter: (slug: string) => void
  onSelectHeading: (slug: string, id: string) => void
}

const itemClass = 'block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors'

/** Chapter list; the open chapter expands to its sections. A select below `md`. */
export function GuidebookContents({
  chapters,
  activeSlug,
  activeHeadingId,
  onSelectChapter,
  onSelectHeading,
}: GuidebookContentsProps) {
  return (
    <>
      <div className="md:hidden">
        <label htmlFor="guidebook-chapter-select" className="sr-only">
          Guidebook chapter
        </label>
        <select
          id="guidebook-chapter-select"
          value={activeSlug}
          onChange={(e) => onSelectChapter(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        >
          {chapters.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <nav
        aria-label="Guidebook contents"
        className="hidden w-64 shrink-0 space-y-0.5 md:sticky md:top-0 md:block md:max-h-[calc(100vh-7rem)] md:self-start md:overflow-y-auto md:pr-2"
      >
        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Contents</p>
        {chapters.map((chapter) => {
          const active = chapter.slug === activeSlug
          return (
            <div key={chapter.slug}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelectChapter(chapter.slug)}
                className={cn(
                  itemClass,
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                {chapter.title}
              </button>
              {active && chapter.headings.length > 0 ? (
                <div className="animate-guidebook-sections grid grid-rows-[1fr]">
                  <ul className="my-1 ml-3 min-h-0 space-y-0.5 overflow-hidden border-l border-border pl-2">
                    {chapter.headings.map((h, i) => (
                      <li
                        key={h.id}
                        className="animate-guidebook-section"
                        style={{ animationDelay: `${Math.min(i, 12) * 30 + 60}ms` }}
                      >
                        <button
                          type="button"
                          aria-current={h.id === activeHeadingId ? 'location' : undefined}
                          onClick={() => onSelectHeading(chapter.slug, h.id)}
                          className={cn(
                            'block w-full rounded px-2 py-1 text-left text-xs transition-colors',
                            h.level === 3 && 'pl-5',
                            h.id === activeHeadingId
                              ? 'font-medium text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {h.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>
    </>
  )
}
