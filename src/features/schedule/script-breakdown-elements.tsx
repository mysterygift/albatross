import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FileDown, Link2, Link2Off, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { BREAKDOWN_CATEGORIES, breakdownCategory } from '@/lib/breakdown/categories'
import { BREAKDOWN_STATUS_LABEL, LINKED_ENTITY_LABEL, type BreakdownStatus, type ElementMatch } from '@/lib/breakdown/matching'
import {
  deleteBreakdownElement,
  mergeBreakdownElements,
  updateBreakdownElement,
} from '@/lib/db/repositories/scriptBreakdown'
import type { BreakdownCategory, BreakdownElement, Scene } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { usePhoneWidth } from '@/hooks/use-is-phone'
import { invalidateBreakdown } from './script-breakdown-data'
import { BreakdownStatusBadge, CategoryLabel } from './script-breakdown-ui'

const ALL = '__all__'

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export type ElementRow = {
  element: BreakdownElement
  match: ElementMatch
  scenes: Scene[]
}

/**
 * Elements by category across the script: what each department has to source. Keyed by `focusElementId` in the
 * page, so opening an element from the sheet starts with the filters cleared and that element expanded.
 */
export function BreakdownElementsPanel({
  rows,
  focusElementId,
  readOnly,
  exporting,
  onOpenScene,
  onExport,
}: {
  rows: ElementRow[]
  focusElementId: string | null
  readOnly: boolean
  exporting: boolean
  onOpenScene: (sceneId: string) => void
  onExport: (category: BreakdownCategory | null) => void
}) {
  const [category, setCategory] = useState<BreakdownCategory | typeof ALL>(ALL)
  const [status, setStatus] = useState<BreakdownStatus | typeof ALL>(ALL)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(focusElementId)

  useEffect(() => {
    if (!focusElementId) return
    const frame = requestAnimationFrame(() => {
      document.querySelector(`[data-element="${focusElementId}"]`)?.scrollIntoView?.({ block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusElementId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (category === ALL || r.element.category === category) &&
        (status === ALL || r.match.status === status) &&
        (!q || r.element.name.toLowerCase().includes(q) || (r.element.notes ?? '').toLowerCase().includes(q))
    )
  }, [rows, category, status, search])

  const groups = BREAKDOWN_CATEGORIES.map((info) => ({
    info,
    rows: filtered.filter((r) => r.element.category === info.key),
    total: rows.filter((r) => r.element.category === info.key),
  })).filter((g) => g.rows.length > 0)

  return (
    <div className="grid gap-3 p-3 sm:p-4">
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <div className="min-w-0 sm:min-w-[180px]">
          <label className="mb-1.5 block text-sm text-muted-foreground" htmlFor="bd-category">
            Department
          </label>
          <Select value={category} onValueChange={(v) => setCategory(v as BreakdownCategory | typeof ALL)}>
            <SelectTrigger id="bd-category" className="w-full bg-input sm:w-52" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {BREAKDOWN_CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm text-muted-foreground" htmlFor="bd-status">
            Status
          </label>
          <Select value={status} onValueChange={(v) => setStatus(v as BreakdownStatus | typeof ALL)}>
            <SelectTrigger id="bd-status" className="w-full bg-input sm:w-40" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {(['needed', 'partial', 'sourced'] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {BREAKDOWN_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search elements and notes"
          aria-label="Search elements"
          className="col-span-2 h-9 w-full sm:w-56"
        />
        <div className="col-span-2 sm:ml-auto">
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" disabled={exporting} onClick={() => onExport(category === ALL ? null : category)}>
            <FileDown className="size-4" aria-hidden />
            {category === ALL ? 'Export department list' : `Export ${breakdownCategory(category).label} list`}
          </Button>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing tagged yet. Highlight words on the Script tab to start the breakdown.
        </p>
      )}
      {rows.length > 0 && groups.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No elements match these filters.</p>
      )}

      {groups.map(({ info, rows: groupRows, total }) => {
        const sourced = total.filter((r) => r.match.status === 'sourced').length
        return (
          <section key={info.key} aria-label={info.label} className="overflow-hidden rounded-lg border border-border">
            <header className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2">
              <CategoryLabel category={info.key} />
              <span className="text-xs text-muted-foreground tabular-nums">
                {sourced} of {total.length} sourced
              </span>
            </header>
            <ul>
              {groupRows.map((row) => (
                <ElementRowView
                  // A saved change (from here or elsewhere) refreshes the row's draft name and notes.
                  key={`${row.element.id}:${row.element.updated_at}`}
                  row={row}
                  siblings={total.map((r) => r.element).filter((e) => e.id !== row.element.id)}
                  expanded={expanded === row.element.id}
                  focused={focusElementId === row.element.id}
                  readOnly={readOnly}
                  onToggle={() => setExpanded((cur) => (cur === row.element.id ? null : row.element.id))}
                  onOpenScene={onOpenScene}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function ElementRowView({
  row,
  siblings,
  expanded,
  focused,
  readOnly,
  onToggle,
  onOpenScene,
}: {
  row: ElementRow
  siblings: BreakdownElement[]
  expanded: boolean
  focused: boolean
  readOnly: boolean
  onToggle: () => void
  onOpenScene: (sceneId: string) => void
}) {
  const queryClient = useQueryClient()
  const phone = usePhoneWidth()
  const { element, match, scenes } = row
  const [name, setName] = useState(element.name)
  const [notes, setNotes] = useState(element.notes ?? '')
  const [mergeTarget, setMergeTarget] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const onError = (e: unknown) => toast.error(errorMessage(e))
  const update = useMutation({
    mutationFn: (patch: Parameters<typeof updateBreakdownElement>[1]) => updateBreakdownElement(element.id, patch),
    onSuccess: () => invalidateBreakdown(queryClient),
    onError,
  })
  const merge = useMutation({
    mutationFn: (targetId: string) => mergeBreakdownElements([element.id], targetId),
    onSuccess: () => {
      invalidateBreakdown(queryClient)
      toast.success('Elements merged')
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: () => deleteBreakdownElement(element.id),
    onSuccess: () => invalidateBreakdown(queryClient),
    onError,
  })

  const linkable = match.source === 'auto' && match.entity
  return (
    <li data-element={element.id} className={cn('border-b border-border last:border-b-0', focused && 'bg-primary/5')}>
      <div
        className={cn(
          'grid items-center gap-3 py-2',
          phone ? 'grid-cols-[auto_minmax(0,1fr)_auto] gap-y-1.5 px-2' : 'grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto] px-3'
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Hide' : 'Show'} details for ${element.name}`}
          className="flex items-center justify-center text-muted-foreground hover:text-foreground pointer-coarse:size-10"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="min-w-0">
          <p className="truncate font-medium">{element.name}</p>
          <p className="truncate text-xs text-muted-foreground">{match.detail}</p>
        </div>
        <div className={cn('flex min-w-0 flex-wrap gap-1', phone && 'order-last col-span-3 pl-12')} aria-label="Scenes">
          {scenes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenScene(s.id)}
              className="rounded border border-border bg-secondary px-1.5 font-mono text-xs hover:border-foreground/40 pointer-coarse:min-h-9 pointer-coarse:min-w-9 pointer-coarse:px-2 pointer-coarse:text-sm"
              title={`Open scene ${s.scene_number}`}
            >
              {s.scene_number}
            </button>
          ))}
        </div>
        <BreakdownStatusBadge status={match.status} />
      </div>

      {expanded && (
        <div className={cn('grid gap-3 border-t border-dashed border-border bg-background/40 py-3 text-sm', phone ? 'px-3' : 'px-10')}>
          <div className="flex flex-wrap items-center gap-2">
            {match.entity ? (
              <span className="inline-flex items-center gap-1.5">
                <Link2 className="size-4 text-muted-foreground" aria-hidden />
                {match.source === 'linked' ? 'Linked to' : 'Matches'} {LINKED_ENTITY_LABEL[match.entity.type]} ›{' '}
                <span className="font-medium">{match.entity.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{match.detail}</span>
            )}
            {!readOnly && linkable && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => update.mutate({ linkedEntityType: match.entity!.type, linkedEntityId: match.entity!.id })}
              >
                Confirm link
              </Button>
            )}
            {!readOnly && match.source === 'linked' && (
              <Button type="button" size="sm" variant="ghost" onClick={() => update.mutate({ linkedEntityType: null, linkedEntityId: null })}>
                <Link2Off className="size-4" aria-hidden />
                Unlink
              </Button>
            )}
            {!readOnly &&
              match.suggestions.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => update.mutate({ linkedEntityType: s.type, linkedEntityId: s.id })}
                >
                  Link to {s.name}
                </Button>
              ))}
          </div>

          {!readOnly && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Marked</span>
                <Button
                  type="button"
                  size="sm"
                  variant={element.manual_status === 'sourced' ? 'default' : 'outline'}
                  aria-pressed={element.manual_status === 'sourced'}
                  onClick={() => update.mutate({ manualStatus: element.manual_status === 'sourced' ? 'needed' : 'sourced' })}
                >
                  {element.manual_status === 'sourced' ? 'Sourced ✓' : 'Mark sourced'}
                </Button>
              </div>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (name.trim() && name !== element.name) update.mutate({ name })
                }}
              >
                <label className="text-muted-foreground" htmlFor={`name-${element.id}`}>
                  Name
                </label>
                <Input id={`name-${element.id}`} value={name} onChange={(e) => setName(e.target.value)} className="h-8 min-w-0 flex-1 sm:w-64 sm:flex-none" />
                <Button type="submit" size="sm" variant="outline" disabled={!name.trim() || name === element.name}>
                  Rename
                </Button>
              </form>
              <div className="grid gap-1.5">
                <label className="text-muted-foreground" htmlFor={`notes-${element.id}`}>
                  Notes for the department
                </label>
                <Textarea
                  id={`notes-${element.id}`}
                  value={notes}
                  rows={2}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => {
                    if (notes !== (element.notes ?? '')) update.mutate({ notes })
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {siblings.length > 0 && (
                  <>
                    <span className="text-muted-foreground">Merge into</span>
                    <Select value={mergeTarget} onValueChange={setMergeTarget}>
                      <SelectTrigger className="h-8 w-full bg-input sm:w-56" aria-label="Merge into">
                        <SelectValue placeholder={`Another ${breakdownCategory(element.category).label} element`} />
                      </SelectTrigger>
                      <SelectContent>
                        {siblings.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" variant="outline" disabled={!mergeTarget || merge.isPending} onClick={() => merge.mutate(mergeTarget)}>
                      Merge
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete element
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${element.name}?`}
        description="This removes the element and every highlight tagged with it, in every scene."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutate()}
      />
    </li>
  )
}
