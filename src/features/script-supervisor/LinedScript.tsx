import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'
import type { SlateShotType } from '@/lib/db/types'
import type { LinedScriptLayout, LiningCell, LiningRow } from '@/lib/script-supervisor/lining'

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

export type LinedScriptProps = {
  layout: LinedScriptLayout | null
  isLoading: boolean
  /** False when the scene is not in any imported script. */
  hasScript: boolean
  sceneNumber: string | null
  currentSlateId: string | null
  touch: boolean
}

function CellLine({ cell, colour, touch }: { cell: LiningCell; colour: string; touch: boolean }) {
  if (!cell.state || cell.state === 'not_covered') return null
  const width = touch ? 4 : 3
  return (
    <span
      aria-hidden
      className="flex justify-center self-stretch box-border"
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
        style={
          cell.state === 'on'
            ? { width, background: colour }
            : { width: 0, borderLeft: `${width}px dashed ${colour}` }
        }
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

function coverageDescription(coverage: number | null): string {
  if (coverage == null) return 'Scene heading'
  return `${coverage} ${coverage === 1 ? 'tramline' : 'tramlines'}`
}

/** Read-only marked-up script for one scene (SS6): script text with tramlines beside it. */
export function LinedScript({ layout, isLoading, hasScript, sceneNumber, currentSlateId, touch }: LinedScriptProps) {
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

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <div className="min-w-[560px] pb-4 pr-3">
          <div className="flex items-end">
            <div className="w-6 shrink-0" />
            <div className="flex-1 min-w-0 px-5 pt-3 font-mono text-xs text-muted-foreground">
              {firstPage ? `Page ${firstPage}` : ''}
            </div>
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
          </div>

          {layout.rows.map((row) => (
            <div key={row.element.id}>
              {row.pageBreakBefore && (
                <div className="flex items-center gap-2 py-1 pl-6 pr-1" aria-label={`Page ${row.element.page_number}`}>
                  <span className="flex-1 border-t border-dashed border-border" />
                  <span className="font-mono text-xs text-muted-foreground">Page {row.element.page_number}</span>
                </div>
              )}
              <div className="flex items-stretch" data-testid={`lined-row-${row.element.sort_index}`}>
                <div className="w-6 shrink-0 flex justify-center pl-2">
                  {row.coverage != null && (
                    <span
                      title={coverageDescription(row.coverage)}
                      className={cn(
                        'w-1 rounded-sm',
                        row.coverage >= 2
                          ? 'bg-primary/55'
                          : 'bg-[repeating-linear-gradient(180deg,var(--foreground)_0_3px,transparent_3px_6px)]'
                      )}
                    />
                  )}
                </div>
                <div
                  className={cn(
                    'flex-1 min-w-0 px-5 py-1.5 font-mono text-sm leading-5',
                    touch && 'text-[15px] leading-6',
                    row.coverage != null && row.coverage < 2 && layout.columns.length > 0 && 'bg-muted/40'
                  )}
                >
                  <ElementText row={row} />
                  <span className="sr-only">{coverageDescription(row.coverage)}</span>
                </div>
                <div className="flex shrink-0 border-l border-border pl-1" aria-hidden>
                  {row.cells.map((cell, i) => (
                    <div key={layout.columns[i]!.tramlineId} className="flex justify-center" style={{ width: laneWidth }}>
                      <CellLine cell={cell} colour={TRAMLINE_COLOUR[layout.columns[i]!.shotType ?? 'none']} touch={touch} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {layout.columns.length === 0 && (
            <p className="px-6 pt-3 text-sm text-muted-foreground">No coverage lined for this scene yet.</p>
          )}
        </div>
      </div>
    </section>
  )
}
