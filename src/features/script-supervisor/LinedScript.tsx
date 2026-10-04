import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquarePlus, PenLine } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { SlateShotType } from '@/lib/db/types'
import type { CellState, LinedScriptLayout, LiningCell, LiningRow } from '@/lib/script-supervisor/lining'
import { SEGMENT_STATE_LABEL, isLineableRow, nextSegmentState, orderedRange } from '@/lib/script-supervisor/liningEdit'
import { formatAnnotationChip, type AnnotationView } from '@/lib/script-supervisor/annotations'

/**
 * Tramline colours by shot type: the UK convention (red masters, blue singles, black multiples, green
 * inserts) tuned to Albatross tones so the lines read on the graphite page.
 */
export const TRAMLINE_COLOUR: Record<SlateShotType | 'none', string> = {
  master: 'var(--chart-5)',
  single: '#8EA7D6',
  multiple: 'var(--foreground)',
  insert: '#9DBBAA',
  other: 'var(--muted-foreground)',
  none: 'var(--muted-foreground)',
}

const LEGEND: Array<{ type: SlateShotType; label: string }> = [
  { type: 'master', label: 'Master / wide' },
  { type: 'single', label: 'Single' },
  { type: 'multiple', label: 'Multiple' },
  { type: 'insert', label: 'Insert / cutaway' },
]

const LONG_PRESS_MS = 500

/** Lining controls (SS7). Absent = read-only. */
export type LiningEditing = {
  /** Slate the draw lane lines for; null hides the draw lane. */
  activeSlateId: string | null
  activeLabel: string | null
  activeShotType: SlateShotType | null
  /** True when the active slate already has a tramline here (drawing then redraws it). */
  activeHasTramline: boolean
  busy: boolean
  onDraw: (startSortIndex: number, endSortIndex: number) => void
  onSetSegment: (laneIndex: number, row: LiningRow, state: CellState) => void
  onCharacterOff: (laneIndex: number, row: LiningRow) => void
  onDeleteTramline: (laneIndex: number) => void
}

export type LinedScriptProps = {
  layout: LinedScriptLayout | null
  isLoading: boolean
  /** False when the scene is not in any imported script. */
  hasScript: boolean
  sceneNumber: string | null
  currentSlateId: string | null
  touch: boolean
  editing?: LiningEditing
  /** Notes by script element id (SS8). */
  annotations?: ReadonlyMap<string, AnnotationView[]>
  /** Opens the add-note dialog for a line; absent = no add button. */
  onAnnotate?: (row: LiningRow) => void
  /** Opens a note for editing; absent = chips are plain text. */
  onEditAnnotation?: (annotation: AnnotationView, row: LiningRow) => void
}

function CellLine({ cell, colour, touch }: { cell: LiningCell; colour: string; touch: boolean }) {
  if (!cell.state || cell.state === 'not_covered') return null
  const width = touch ? 4 : 3
  return (
    <span
      aria-hidden
      className="flex justify-center self-stretch box-border pointer-events-none"
      style={{
        width: touch ? 28 : 16,
        borderTop: cell.isStart ? `${width}px solid ${colour}` : undefined,
        borderBottom: cell.isEnd ? `${width}px solid ${colour}` : undefined,
        marginTop: cell.isStart ? 6 : 0,
        marginBottom: cell.isEnd ? 6 : 0,
      }}
    >
      <span
        className="block"
        style={cell.state === 'on' ? { width, background: colour } : { width: 0, borderLeft: `${width}px dashed ${colour}` }}
      />
    </span>
  )
}

function ElementText({ row }: { row: LiningRow }) {
  const el = row.element
  if (el.element_type === 'scene_heading') return <p className="font-bold uppercase">{el.text}</p>
  if (el.element_type === 'transition') return <p className="text-right uppercase">{el.text}</p>
  if (el.element_type === 'dialogue') {
    return (
      <div className="pl-[18%] pr-[10%]">
        <p className="pl-[22%] uppercase">{el.character_name}</p>
        <p className="whitespace-pre-line">{el.text}</p>
      </div>
    )
  }
  return <p className="whitespace-pre-line">{el.text}</p>
}

function excerpt(row: LiningRow): string {
  const el = row.element
  const text = el.element_type === 'dialogue' ? `${el.character_name}: ${el.text}` : el.text
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat
}

function coverageDescription(coverage: number | null): string {
  if (coverage == null) return 'Scene heading'
  return `${coverage} ${coverage === 1 ? 'tramline' : 'tramlines'}`
}

type MenuState = { laneIndex: number; row: LiningRow; x: number; y: number }

function SegmentMenu({
  menu,
  label,
  canDelete,
  onClose,
  onChoose,
  onCharacterOff,
  onDelete,
}: {
  menu: MenuState
  label: string
  canDelete: boolean
  onClose: () => void
  onChoose: (state: CellState) => void
  onCharacterOff: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])

  const current = menu.row.cells[menu.laneIndex]?.state ?? 'on'
  const character = menu.row.element.element_type === 'dialogue' ? menu.row.element.character_name : null
  const item = 'w-full min-h-11 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${label}: ${excerpt(menu.row)}`}
      className="fixed z-50 w-64 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
      style={{ left: Math.min(menu.x, window.innerWidth - 272), top: Math.min(menu.y, window.innerHeight - 280) }}
    >
      <p className="px-3 pb-1 pt-1.5 text-xs text-muted-foreground">
        {label} · {excerpt(menu.row)}
      </p>
      {(['on', 'off', 'not_covered'] as CellState[]).map((s) => (
        <button key={s} type="button" role="menuitemradio" aria-checked={current === s} className={cn(item, current === s && 'bg-muted/40')} onClick={() => onChoose(s)}>
          {SEGMENT_STATE_LABEL[s]}
        </button>
      ))}
      {character && (
        <button type="button" role="menuitem" className={item} onClick={onCharacterOff}>
          Off camera for {character} to the end of this line
        </button>
      )}
      {canDelete && (
        <>
          <div className="my-1 h-px bg-border" />
          <button type="button" role="menuitem" className={cn(item, 'text-destructive')} onClick={onDelete}>
            Delete tramline {label}
          </button>
        </>
      )}
    </div>
  )
}

/** Marked-up script for one scene: script text with tramlines beside it; editable when `editing` is set (SS7). */
export function LinedScript({
  layout,
  isLoading,
  hasScript,
  sceneNumber,
  currentSlateId,
  touch,
  editing,
  annotations,
  onAnnotate,
  onEditAnnotation,
}: LinedScriptProps) {
  const [anchor, setAnchor] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const dragRef = useRef<{ from: number; to: number; moved: boolean; pointerId: number } | null>(null)
  const suppressClick = useRef(false)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (anchor == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAnchor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anchor])

  // A new active slate starts a fresh draw.
  useEffect(() => {
    setAnchor(null)
    setDrag(null)
  }, [editing?.activeSlateId])

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading script…</p>
  if (!hasScript || !layout) {
    return (
      <p className="text-sm text-muted-foreground">
        Scene {sceneNumber ?? ''} isn’t in an imported script yet. <Link to="/schedule/script-import">Import the script</Link>{' '}
        to see it here.
      </p>
    )
  }
  if (layout.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No script text found for scene {sceneNumber}.</p>
  }

  const laneWidth = touch ? 44 : 32
  const under = layout.rows.filter((r) => r.coverage != null && r.coverage < 2).length
  const firstPage = layout.rows[0]?.element.page_number
  const drawing = !!editing?.activeSlateId
  const activeColour = TRAMLINE_COLOUR[editing?.activeShotType ?? 'none']

  const commit = (a: number, b: number) => {
    const { start, end } = orderedRange(a, b)
    setAnchor(null)
    setDrag(null)
    editing?.onDraw(start, end)
  }

  const sortFromPoint = (x: number, y: number): number | null => {
    const hit = document.elementFromPoint?.(x, y)?.closest<HTMLElement>('[data-draw-sort]')
    const v = hit?.dataset.drawSort
    return v != null ? Number(v) : null
  }

  const onDrawPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, sort: number) => {
    if (editing?.busy || e.button > 0) return
    dragRef.current = { from: sort, to: sort, moved: false, pointerId: e.pointerId }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onDrawPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 14)
    else if (e.clientY < 60) window.scrollBy(0, -14)
    const sort = sortFromPoint(e.clientX, e.clientY)
    if (sort == null || sort === d.to) return
    d.to = sort
    d.moved = true
    setDrag({ from: d.from, to: d.to })
  }
  const onDrawPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.pointerId !== e.pointerId) return
    if (d.moved) {
      suppressClick.current = true
      commit(d.from, d.to)
    }
  }
  const onDrawClick = (sort: number) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (editing?.busy) return
    if (anchor == null) setAnchor(sort)
    else commit(anchor, sort)
  }

  const previewRange = drag ? orderedRange(drag.from, drag.to) : anchor != null ? { start: anchor, end: anchor } : null
  const inPreview = (sort: number) => !!previewRange && sort >= previewRange.start && sort <= previewRange.end

  const openMenu = (laneIndex: number, row: LiningRow, x: number, y: number) => setMenu({ laneIndex, row, x, y })
  const clearLongPress = () => {
    if (longPress.current != null) clearTimeout(longPress.current)
    longPress.current = null
  }

  return (
    <section aria-label={`Marked-up script, scene ${sceneNumber ?? ''}`} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {layout.columns.length} {layout.columns.length === 1 ? 'tramline' : 'tramlines'}
          {layout.columns.length > 0 && under > 0 ? ` · ${under} ${under === 1 ? 'block has' : 'blocks have'} fewer than two` : ''}
        </span>
        <span className="flex-1" />
        {LEGEND.map((l) => (
          <span key={l.type} className="flex items-center gap-1">
            <span aria-hidden className="h-[3px] w-3" style={{ background: TRAMLINE_COLOUR[l.type] }} />
            {l.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span aria-hidden className="h-0 w-3 border-t-[3px] border-dashed border-muted-foreground" />
          Off camera
        </span>
      </div>

      {drawing && (
        <p role="status" className="text-sm text-muted-foreground">
          {anchor != null
            ? `Now ${touch ? 'tap' : 'click'} the last line slate ${editing!.activeLabel} covers. Esc cancels.`
            : `${editing!.activeHasTramline ? 'Redraw' : 'Line'} slate ${editing!.activeLabel}: ${touch ? 'tap' : 'click'} the first and last lines in the right-hand lane, or drag down it.`}
        </p>
      )}

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <div className="min-w-[560px] pb-4 pr-3">
          <div className="flex items-end">
            <div className="w-6 shrink-0" />
            <div className="flex-1 min-w-0 px-5 pt-3 font-mono text-xs text-muted-foreground">{firstPage ? `Page ${firstPage}` : ''}</div>
            <div className="flex shrink-0 border-l border-border pl-1 pt-3" role="list" aria-label="Tramlines">
              {layout.columns.map((c) => (
                <div
                  key={c.tramlineId}
                  role="listitem"
                  className="flex flex-col items-center gap-1.5"
                  style={{ width: laneWidth }}
                  aria-current={c.slateId === currentSlateId || undefined}
                >
                  <span
                    className={cn(
                      'font-mono text-xs whitespace-nowrap [writing-mode:vertical-rl] rotate-180 max-h-32 overflow-hidden',
                      c.slateId === currentSlateId ? 'text-primary font-semibold' : 'text-foreground'
                    )}
                  >
                    {c.label}
                  </span>
                  <span
                    aria-hidden
                    className={cn('size-2.5 rounded-full', c.slateId === currentSlateId && 'ring-2 ring-primary ring-offset-2 ring-offset-card')}
                    style={{ background: TRAMLINE_COLOUR[c.shotType ?? 'none'] }}
                  />
                </div>
              ))}
            </div>
            {drawing && (
              <div className="flex shrink-0 flex-col items-center gap-1.5 border-l border-dashed border-primary/50 pt-3" style={{ width: laneWidth + 8 }}>
                <span className="font-mono text-xs text-primary font-semibold [writing-mode:vertical-rl] rotate-180">
                  Draw {editing!.activeLabel}
                </span>
                <span aria-hidden className="size-2.5 rounded-full ring-2 ring-primary ring-offset-2 ring-offset-card" style={{ background: activeColour }} />
              </div>
            )}
          </div>

          {layout.rows.map((row) => {
            const sort = row.element.sort_index
            const previewing = drawing && inPreview(sort)
            return (
              <div key={row.element.id}>
                {row.pageBreakBefore && (
                  <div className="flex items-center gap-2 py-1 pl-6 pr-1" aria-label={`Page ${row.element.page_number}`}>
                    <span className="flex-1 border-t border-dashed border-border" />
                    <span className="font-mono text-xs text-muted-foreground">Page {row.element.page_number}</span>
                  </div>
                )}
                <div className="flex items-stretch" data-testid={`lined-row-${sort}`}>
                  <div className="w-6 shrink-0 flex justify-center pl-2">
                    {row.coverage != null && (
                      <span
                        title={coverageDescription(row.coverage)}
                        className={cn(
                          'w-1 rounded-sm',
                          row.coverage >= 2 ? 'bg-primary/55' : 'bg-[repeating-linear-gradient(180deg,var(--foreground)_0_3px,transparent_3px_6px)]'
                        )}
                      />
                    )}
                  </div>
                  <div
                    className={cn(
                      'group relative flex-1 min-w-0 px-5 py-1.5 font-mono text-sm leading-5',
                      touch && 'text-[15px] leading-6',
                      row.coverage != null && row.coverage < 2 && layout.columns.length > 0 && 'bg-muted/40',
                      previewing && 'bg-primary/10'
                    )}
                  >
                    <ElementText row={row} />
                    <span className="sr-only">{coverageDescription(row.coverage)}</span>
                    {(annotations?.get(row.element.id) ?? []).length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5 font-sans" aria-label="Notes on this line">
                        {annotations!.get(row.element.id)!.map((a) => {
                          const chip = formatAnnotationChip(a)
                          return (
                            <li key={a.id}>
                              {onEditAnnotation ? (
                                <button
                                  type="button"
                                  onClick={() => onEditAnnotation(a, row)}
                                  aria-label={`Edit note: ${chip}`}
                                  className={cn(
                                    'inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-2.5 text-left text-xs text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                    touch ? 'min-h-9 py-1.5' : 'py-0.5'
                                  )}
                                >
                                  <PenLine className="size-3 shrink-0" aria-hidden />
                                  <span className="truncate">{chip}</span>
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                                  <PenLine className="size-3" aria-hidden />
                                  {chip}
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    {onAnnotate && isLineableRow(row) && (
                      <button
                        type="button"
                        onClick={() => onAnnotate(row)}
                        aria-label={`Add a note to “${excerpt(row)}”`}
                        className={cn(
                          'absolute right-1 top-1 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          touch ? 'size-10 opacity-100' : 'size-7 opacity-0 group-hover:opacity-100'
                        )}
                      >
                        <MessageSquarePlus className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  <div className="flex shrink-0 border-l border-border pl-1">
                    {row.cells.map((cell, i) => {
                      const column = layout.columns[i]!
                      const colour = TRAMLINE_COLOUR[column.shotType ?? 'none']
                      if (!editing || !cell.state) {
                        return (
                          <div key={column.tramlineId} aria-hidden className="flex justify-center" style={{ width: laneWidth }}>
                            <CellLine cell={cell} colour={colour} touch={touch} />
                          </div>
                        )
                      }
                      return (
                        <button
                          key={column.tramlineId}
                          type="button"
                          className="flex justify-center rounded-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
                          style={{ width: laneWidth }}
                          disabled={editing.busy}
                          aria-label={`${column.label}, ${excerpt(row)}: ${SEGMENT_STATE_LABEL[cell.state]}. Activate to change; context menu for more.`}
                          onPointerDown={(e) => {
                            if (e.pointerType === 'mouse') return
                            const { clientX, clientY } = e
                            clearLongPress()
                            longPress.current = setTimeout(() => {
                              suppressClick.current = true
                              openMenu(i, row, clientX, clientY)
                            }, LONG_PRESS_MS)
                          }}
                          onPointerUp={clearLongPress}
                          onPointerLeave={clearLongPress}
                          onPointerCancel={clearLongPress}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            const r = e.currentTarget.getBoundingClientRect()
                            openMenu(i, row, e.clientX || r.right, e.clientY || r.top)
                          }}
                          onClick={() => {
                            if (suppressClick.current) {
                              suppressClick.current = false
                              return
                            }
                            editing.onSetSegment(i, row, nextSegmentState(cell.state!))
                          }}
                        >
                          <CellLine cell={cell} colour={colour} touch={touch} />
                          {cell.state === 'not_covered' && <span aria-hidden className="self-center text-xs text-muted-foreground">·</span>}
                        </button>
                      )
                    })}
                  </div>
                  {drawing && (
                    <div className="flex shrink-0 justify-center border-l border-dashed border-primary/50" style={{ width: laneWidth + 8 }}>
                      {isLineableRow(row) && (
                        <button
                          type="button"
                          data-draw-sort={sort}
                          disabled={editing!.busy}
                          aria-pressed={anchor === sort}
                          aria-label={
                            anchor == null
                              ? `Slate ${editing!.activeLabel}: start at “${excerpt(row)}”`
                              : `Slate ${editing!.activeLabel}: end at “${excerpt(row)}”`
                          }
                          className={cn(
                            'flex w-full justify-center touch-none select-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                            previewing ? 'bg-primary/20' : 'hover:bg-primary/10'
                          )}
                          onPointerDown={(e) => onDrawPointerDown(e, sort)}
                          onPointerMove={onDrawPointerMove}
                          onPointerUp={onDrawPointerUp}
                          onPointerCancel={() => {
                            dragRef.current = null
                            setDrag(null)
                          }}
                          onClick={() => onDrawClick(sort)}
                        >
                          {previewing && (
                            <span aria-hidden className="my-0.5 self-stretch rounded-full" style={{ width: touch ? 4 : 3, background: activeColour }} />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {layout.columns.length === 0 && !drawing && (
            <p className="px-6 pt-3 text-sm text-muted-foreground">No coverage lined for this scene yet.</p>
          )}
        </div>
      </div>

      {menu && editing && (
        <SegmentMenu
          menu={menu}
          label={layout.columns[menu.laneIndex]?.label ?? ''}
          canDelete
          onClose={() => setMenu(null)}
          onChoose={(state) => {
            setMenu(null)
            editing.onSetSegment(menu.laneIndex, menu.row, state)
          }}
          onCharacterOff={() => {
            setMenu(null)
            editing.onCharacterOff(menu.laneIndex, menu.row)
          }}
          onDelete={() => {
            setMenu(null)
            editing.onDeleteTramline(menu.laneIndex)
          }}
        />
      )}
    </section>
  )
}
