import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronDown, Lightbulb } from 'lucide-react'
import type { Location, Scene, ShootDay, Shot, StripboardStrip } from '@/lib/db/types'
import {
  computeSmartSchedulingInsights,
  type InsightDayGroup,
  type SmartSchedulingInsight,
} from '@/lib/schedule/smartSchedulingInsights'
import { cn } from '@/lib/utils'

const MAX_SHOTS_PER_DAY_IN_UI = 8

export type SmartSchedulingInsightsPanelProps = {
  strips: StripboardStrip[]
  shots: Shot[]
  scenes: Scene[]
  shootDays: ShootDay[]
  locations: Location[]
  castPersonIdsByShotId: Map<string, string[]>
  isLoading?: boolean
  className?: string
  /** localStorage key for remembering open/closed per viewer. Omit to start collapsed without persisting. */
  storageKey?: string
}

/** Per-viewer convenience only. Storage can be unavailable, so the read is guarded. */
function readStoredOpen(storageKey: string | undefined): boolean {
  if (!storageKey) return false
  try {
    return window.localStorage.getItem(storageKey) === 'true'
  } catch {
    /* storage unavailable: start collapsed */
    return false
  }
}

function scopeCaption(shootDayCount: number): string {
  if (shootDayCount === 0) {
    return 'Analyzing scheduled shot strips for this production (no shoot days yet).'
  }
  return `Analyzing ${shootDayCount} shoot day${shootDayCount === 1 ? '' : 's'} and every scheduled shot strip in this production.`
}

function DayShotBlock({ group }: { group: InsightDayGroup }) {
  const visible = group.shots.slice(0, MAX_SHOTS_PER_DAY_IN_UI)
  const hidden = group.shots.length - visible.length

  return (
    <div className="rounded-md border border-border/60 bg-background/30 px-2.5 py-2">
      <p className="text-xs font-medium text-foreground/90 mb-1.5">{group.dayLabel}</p>
      <ul className="list-none m-0 p-0 space-y-1">
        {visible.map((row) => (
          <li key={`${row.stripId}-${row.shotId}`} className="text-xs text-foreground/85 leading-snug pl-2 border-l border-primary/25">
            <span className="text-muted-foreground">
              Scene {row.sceneNumber} / Shot {row.shotNumber}
            </span>
            <span className="text-foreground/90"> — {row.label}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground mt-1.5 pl-2">
          …and {hidden} more on this day
        </p>
      )}
    </div>
  )
}

function InsightOpportunityRow({
  insight,
  expanded,
  onToggle,
}: {
  insight: SmartSchedulingInsight
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <li className="rounded-md border border-border/70 bg-background/20 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-start gap-2 text-left px-3 py-2.5 transition-colors',
          'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
        )}
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            'size-4 shrink-0 mt-0.5 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm text-foreground/90 leading-snug font-medium">{insight.summary}</p>
          {!expanded && (
            <p className="text-xs text-muted-foreground">
              {insight.distinctDayCount} shoot days · {insight.shotIds.length} shots — expand for detail
            </p>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-border/50 bg-muted/10">
          {insight.suggestion && (
            <div className="pt-2 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/90 mb-1">
                Suggestion
              </p>
              <p className="text-sm text-foreground/90 leading-snug">{insight.suggestion}</p>
            </div>
          )}
          {insight.planningNote && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Context
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">{insight.planningNote}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Shots by day
            </p>
            <div className="space-y-2 max-h-[min(320px,45vh)] overflow-y-auto pr-1">
              {insight.byDay.map((g) => (
                <DayShotBlock key={g.shootDayId} group={g} />
              ))}
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

export function SmartSchedulingInsightsPanel({
  strips,
  shots,
  scenes,
  shootDays,
  locations,
  castPersonIdsByShotId,
  isLoading,
  className,
  storageKey,
}: SmartSchedulingInsightsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [open, setOpen] = useState(() => readStoredOpen(storageKey))

  useEffect(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, String(open))
    } catch {
      /* storage unavailable: the choice simply won't persist */
    }
  }, [open, storageKey])

  const locationNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const loc of locations) {
      m.set(loc.id, loc.name)
    }
    return m
  }, [locations])

  const result = useMemo(
    () =>
      computeSmartSchedulingInsights({
        strips,
        shots,
        scenes,
        shootDays,
        locationNameById,
        castPersonIdsByShotId,
      }),
    [strips, shots, scenes, shootDays, locationNameById, castPersonIdsByShotId]
  )

  let body: ReactNode
  if (isLoading) {
    body = (
      <div role="status" aria-label="Loading insights" className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  } else if (result.state === 'empty_insufficient') {
    body = (
      <p className="text-sm text-muted-foreground">
        Not enough scheduled shot data yet to generate setup insights.
      </p>
    )
  } else if (result.state === 'empty_no_patterns') {
    body = (
      <p className="text-sm text-muted-foreground">
        No cross-day setup patterns detected from support, shot size, location, time of day, or shot-level
        cast. Insights will appear when similar shots land on different shoot days.
      </p>
    )
  } else {
    body = (
      <ul className="space-y-2 list-none m-0 p-0">
        {result.insights.map((insight) => {
          const expanded = expandedId === insight.id
          return (
            <InsightOpportunityRow
              key={insight.id}
              insight={insight}
              expanded={expanded}
              onToggle={() => setExpandedId(expanded ? null : insight.id)}
            />
          )
        })}
      </ul>
    )
  }

  const insightCount = result.insights.length
  const countLabel = isLoading
    ? 'Analyzing…'
    : result.state === 'ready'
      ? `${insightCount} ${insightCount === 1 ? 'opportunity' : 'opportunities'}`
      : result.state === 'empty_no_patterns'
        ? 'No setup patterns detected yet'
        : 'Not enough scheduled shot data yet'
  const headingId = 'smart-scheduling-insights-heading'
  const regionId = 'smart-scheduling-insights-content'

  return (
    <section
      className={cn('overflow-hidden rounded-lg border border-border/80 bg-card/40 shadow-sm', className)}
    >
      <h2 id={headingId} className="m-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={regionId}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Lightbulb className="size-4 shrink-0 text-primary/80" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tracking-tight text-foreground">
              Smart Scheduling Insights
            </span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{countLabel}</span>
          </span>
          {!open && !isLoading && result.state === 'ready' && insightCount > 0 && (
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {insightCount}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              'size-5 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
      </h2>
      <div
        id={regionId}
        role="region"
        aria-labelledby={headingId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">{scopeCaption(shootDays.length)}</p>
            {body}
          </div>
        </div>
      </div>
    </section>
  )
}
