import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { suggestSceneTags, type TagSuggestion } from '@/lib/breakdown/autoTag'
import { BREAKDOWN_CATEGORIES, breakdownCategory, categoryForShortcut } from '@/lib/breakdown/categories'
import { BREAKDOWN_STATUS_LABEL, type ElementMatch } from '@/lib/breakdown/matching'
import { domRangeToPageRange, rangeText, snapRangeToWords, tidyTagText, type PageTextRange } from '@/lib/breakdown/selection'
import { layoutTagsOnLines } from '@/lib/breakdown/tagLayout'
import {
  createBreakdownTag,
  createBreakdownTags,
  deleteBreakdownTag,
  moveBreakdownTag,
  moveBreakdownTagToNewElement,
} from '@/lib/db/repositories/scriptBreakdown'
import type { SceneLayout } from '@/lib/db/scriptSectionLayout'
import type { BreakdownCategory, BreakdownElement, BreakdownTag, ScriptPage } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { invalidateBreakdown } from './script-breakdown-data'
import { ScriptLines, type ScriptLineSegment } from './script-section-ui'
import { BreakdownStatusDot } from './script-breakdown-ui'

type Anchor = { x: number; y: number }
type PendingSelection = { range: PageTextRange; text: string; anchor: Anchor }
type OpenTags = { tagIds: string[]; anchor: Anchor }

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function BreakdownScriptPanel({
  scriptVersionId,
  sceneId,
  layout,
  tags,
  elements,
  elementsById,
  matchesByElementId,
  hiddenCategories,
  readOnly,
}: {
  scriptVersionId: string
  sceneId: string
  layout: SceneLayout<ScriptPage>
  tags: readonly BreakdownTag[]
  elements: readonly BreakdownElement[]
  elementsById: ReadonlyMap<string, BreakdownElement>
  matchesByElementId: ReadonlyMap<string, ElementMatch>
  hiddenCategories: ReadonlySet<BreakdownCategory>
  /** Older drafts are shown but not tagged. */
  readOnly: boolean
}) {
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [openTags, setOpenTags] = useState<OpenTags | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)

  const pageTexts = useMemo(() => layout.pages.map((p) => ({ id: p.id, content: p.content ?? '' })), [layout.pages])
  const categoryOfTag = useCallback((t: BreakdownTag) => elementsById.get(t.element_id)?.category ?? null, [elementsById])

  const tagLayout = useMemo(() => {
    const placed = tags.flatMap((t) => {
      const category = categoryOfTag(t)
      return category && !hiddenCategories.has(category) ? [{ ...t, category }] : []
    })
    return layoutTagsOnLines(layout.lines, placed)
  }, [tags, categoryOfTag, hiddenCategories, layout.lines])

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  const anchorFor = (rect: DOMRect): Anchor | null => {
    const box = scrollRef.current
    if (!box) return null
    const boxRect = box.getBoundingClientRect()
    return {
      x: Math.min(Math.max(rect.left - boxRect.left + rect.width / 2, 120), Math.max(boxRect.width - 120, 120)),
      y: rect.bottom - boxRect.top + box.scrollTop + 6,
    }
  }

  const readSelection = () => {
    if (readOnly) return
    const sel = window.getSelection()
    const container = linesRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) {
      setPending(null)
      return
    }
    const domRange = sel.getRangeAt(0)
    if (!container.contains(domRange.commonAncestorContainer)) return
    const raw = domRangeToPageRange(domRange, container)
    const snapped = raw ? snapRangeToWords(pageTexts, raw) : null
    // jsdom has no Range rects; fall back to the element the selection ends in.
    const rectSource = typeof domRange.getBoundingClientRect === 'function' ? domRange : domRange.endContainer.parentElement
    const anchor = rectSource ? anchorFor(rectSource.getBoundingClientRect()) : null
    if (!snapped || !anchor) {
      setPending(null)
      return
    }
    setOpenTags(null)
    setPending({ range: snapped, text: rangeText(pageTexts, snapped), anchor })
  }

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges()
    setPending(null)
  }

  const tagMutation = useMutation({
    mutationFn: (category: BreakdownCategory) =>
      createBreakdownTag({ scriptVersionId, sceneId, category, range: pending!.range, text: pending!.text }),
    onSuccess: (created, category) => {
      clearSelection()
      invalidateBreakdown(queryClient)
      const el = created.createdElement ? null : elementsById.get(created.elementId)
      toast.success(
        el ? `Tagged as ${breakdownCategory(category).label} › ${el.name}` : `New ${breakdownCategory(category).label} element added`
      )
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const tagWith = useCallback(
    (category: BreakdownCategory) => {
      if (pending && !tagMutation.isPending) tagMutation.mutate(category)
    },
    [pending, tagMutation]
  )

  useEffect(() => {
    if (!pending && !openTags) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenTags(null)
        clearSelection()
        return
      }
      if (!pending || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const category = categoryForShortcut(e.key)
      if (category) {
        e.preventDefault()
        tagWith(category.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, openTags, tagWith])

  const onSegmentClick = (segment: ScriptLineSegment, e: React.MouseEvent<HTMLElement>) => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    const tagIds = segment.key.split('|')[1]?.split(',').filter(Boolean) ?? []
    const anchor = anchorFor(e.currentTarget.getBoundingClientRect())
    if (tagIds.length === 0 || !anchor) return
    setPending(null)
    setOpenTags({ tagIds, anchor })
  }

  const suggestions = useMemo(() => {
    const taggedNames = new Map<BreakdownCategory, Set<string>>()
    for (const t of tags) {
      const el = elementsById.get(t.element_id)
      if (!el) continue
      const set = taggedNames.get(el.category) ?? new Set<string>()
      set.add(el.name)
      set.add(tidyTagText(t.tagged_text))
      taggedNames.set(el.category, set)
    }
    return suggestSceneTags(layout.lines, taggedNames)
  }, [tags, elementsById, layout.lines])

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? 'Older draft: tags are shown for reference. Switch to the latest draft to tag.'
            : 'Highlight words in the script, then pick a category (or press its number).'}
        </p>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={() => setSuggestOpen(true)} disabled={suggestions.length === 0}>
            <Sparkles className="size-4" aria-hidden />
            Suggest cast &amp; location{suggestions.length > 0 ? ` (${suggestions.length})` : ''}
          </Button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="relative max-h-[62vh] overflow-y-auto bg-background/40 pb-4"
        onMouseUp={readSelection}
        onKeyUp={(e) => {
          if (e.shiftKey) readSelection()
        }}
      >
        <ScriptLines
          ref={linesRef}
          lines={layout.lines}
          aria-label="Script text"
          decorate={(line) => {
            const placed = tagLayout.get(line.index)
            if (!placed) return {}
            return {
              bandColours: placed.bandColours,
              segments: placed.segments.map((s) => ({
                start: s.start,
                end: s.end,
                colours: s.colours,
                key: `${line.index}:${s.start}|${s.tagIds.join(',')}`,
                title: s.tagIds
                  .map((id) => {
                    const el = elementsById.get(tagById.get(id)?.element_id ?? '')
                    return el ? `${breakdownCategory(el.category).label}: ${el.name}` : null
                  })
                  .filter(Boolean)
                  .join('\n'),
              })),
            }
          }}
          onSegmentClick={(_, segment, e) => onSegmentClick(segment, e)}
        />

        {pending && (
          <CategoryToolbar
            anchor={pending.anchor}
            text={tidyTagText(pending.text)}
            busy={tagMutation.isPending}
            onPick={tagWith}
            onClose={clearSelection}
          />
        )}
        {openTags && (
          <TagPopover
            anchor={openTags.anchor}
            tags={openTags.tagIds.map((id) => tagById.get(id)).filter((t): t is BreakdownTag => t != null)}
            elements={elements}
            elementsById={elementsById}
            matchesByElementId={matchesByElementId}
            readOnly={readOnly}
            onClose={() => setOpenTags(null)}
          />
        )}
      </div>

      {suggestOpen && (
        <SuggestDialog
          onClose={() => setSuggestOpen(false)}
        suggestions={suggestions}
          scriptVersionId={scriptVersionId}
          sceneId={sceneId}
        />
      )}
    </div>
  )
}

function Floating({ anchor, children, label }: { anchor: Anchor; children: React.ReactNode; label: string }) {
  return (
    <div
      role="dialog"
      aria-label={label}
      className="absolute z-20 w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-lg"
      style={{ left: anchor.x, top: anchor.y }}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

function CategoryToolbar({
  anchor,
  text,
  busy,
  onPick,
  onClose,
}: {
  anchor: Anchor
  text: string
  busy: boolean
  onPick: (category: BreakdownCategory) => void
  onClose: () => void
}) {
  return (
    <Floating anchor={anchor} label="Tag selection">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm">
          Tag <span className="font-mono font-semibold">“{text}”</span> as
        </p>
        <button type="button" aria-label="Cancel" className="text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {BREAKDOWN_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={busy}
            onClick={() => onPick(c.key)}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary disabled:opacity-50"
          >
            <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: c.colour }} />
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            <kbd className="font-mono text-[11px] text-muted-foreground">{c.shortcut}</kbd>
          </button>
        ))}
      </div>
    </Floating>
  )
}

function TagPopover({
  anchor,
  tags,
  elements,
  elementsById,
  matchesByElementId,
  readOnly,
  onClose,
}: {
  anchor: Anchor
  tags: BreakdownTag[]
  elements: readonly BreakdownElement[]
  elementsById: ReadonlyMap<string, BreakdownElement>
  matchesByElementId: ReadonlyMap<string, ElementMatch>
  readOnly: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [newNameFor, setNewNameFor] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const onDone = () => invalidateBreakdown(queryClient)
  const onError = (e: unknown) => toast.error(errorMessage(e))
  const move = useMutation({ mutationFn: (v: { tagId: string; elementId: string }) => moveBreakdownTag(v.tagId, v.elementId), onSuccess: onDone, onError })
  const moveNew = useMutation({
    mutationFn: (v: { tagId: string; name: string }) => moveBreakdownTagToNewElement(v.tagId, v.name),
    onSuccess: () => {
      setNewNameFor(null)
      onDone()
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (tagId: string) => deleteBreakdownTag(tagId),
    onSuccess: () => {
      if (tags.length <= 1) onClose()
      onDone()
    },
    onError,
  })

  if (tags.length === 0) return null
  return (
    <Floating anchor={anchor} label="Tags on this text">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {tags.length === 1 ? 'Tag' : `${tags.length} tags`}
        </p>
        <button type="button" aria-label="Close" className="text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <ul className="grid gap-2.5">
        {tags.map((tag) => {
          const el = elementsById.get(tag.element_id)
          if (!el) return null
          const info = breakdownCategory(el.category)
          const match = matchesByElementId.get(el.id)
          const siblings = elements.filter((e) => e.category === el.category)
          return (
            <li key={tag.id} className="grid gap-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: info.colour }} />
                <span className="font-medium">{info.label}</span>
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">“{tidyTagText(tag.tagged_text)}”</span>
              </div>
              {match && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BreakdownStatusDot status={match.status} />
                  {BREAKDOWN_STATUS_LABEL[match.status]} · {match.detail}
                </p>
              )}
              {!readOnly && (
                <div className="flex items-center gap-1.5">
                  <Select
                    value={el.id}
                    onValueChange={(value) => {
                      if (value === '__new__') {
                        setNewNameFor(tag.id)
                        setNewName(tidyTagText(tag.tagged_text))
                      } else if (value !== el.id) move.mutate({ tagId: tag.id, elementId: value })
                    }}
                  >
                    <SelectTrigger className="h-8 flex-1 bg-input text-sm" aria-label={`${info.label} element`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {siblings.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">New element…</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${info.label} tag`}
                    title="Remove tag"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(tag.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
              {newNameFor === tag.id && (
                <form
                  className="flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    moveNew.mutate({ tagId: tag.id, name: newName })
                  }}
                >
                  <Input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8 text-sm"
                    aria-label="New element name"
                  />
                  <Button type="submit" size="sm" disabled={!newName.trim() || moveNew.isPending}>
                    Move
                  </Button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </Floating>
  )
}

/** Mounted only while open, so every opening starts with all suggestions ticked. */
function SuggestDialog({
  onClose,
  suggestions,
  scriptVersionId,
  sceneId,
}: {
  onClose: () => void
  suggestions: TagSuggestion[]
  scriptVersionId: string
  sceneId: string
}) {
  const queryClient = useQueryClient()
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const chosen = suggestions.filter((s) => !unchecked.has(s.key))
  const add = useMutation({
    mutationFn: () =>
      createBreakdownTags(chosen.map((s) => ({ scriptVersionId, sceneId, category: s.category, range: s.range, text: s.text }))),
    onSuccess: (created) => {
      invalidateBreakdown(queryClient)
      toast.success(`${created.length} ${created.length === 1 ? 'tag' : 'tags'} added`)
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Suggested tags</DialogTitle>
          <DialogDescription>
            Speaking characters and the heading location in this scene that are not tagged yet.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-72 gap-1 overflow-y-auto">
          {suggestions.map((s) => {
            const info = breakdownCategory(s.category)
            const checked = !unchecked.has(s.key)
            return (
              <li key={s.key}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-secondary">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) =>
                      setUnchecked((prev) => {
                        const next = new Set(prev)
                        if (c === true) next.delete(s.key)
                        else next.add(s.key)
                        return next
                      })
                    }
                  />
                  <span aria-hidden className="size-3 rounded-sm" style={{ background: info.colour }} />
                  <span className="text-muted-foreground">{info.label}</span>
                  <span className="font-mono">{s.text}</span>
                </label>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={chosen.length === 0 || add.isPending} onClick={() => add.mutate()}>
            Add {chosen.length} {chosen.length === 1 ? 'tag' : 'tags'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Category chips that show and hide highlights, with how many tags each has in scope. */
export function CategoryLegend({
  counts,
  hidden,
  onToggle,
}: {
  counts: ReadonlyMap<BreakdownCategory, number>
  hidden: ReadonlySet<BreakdownCategory>
  onToggle: (category: BreakdownCategory) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show categories">
      {BREAKDOWN_CATEGORIES.map((c) => {
        const shown = !hidden.has(c.key)
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={shown}
            onClick={() => onToggle(c.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs transition-colors hover:bg-secondary',
              !shown && 'opacity-45'
            )}
          >
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: c.colour }} />
            {c.label}
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{counts.get(c.key) ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
