import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'
import type { Location, Scene, ShootDay, Shot, StripboardStrip } from '@/lib/db/types'
import {
  computeSmartSchedulingInsights,
  type InsightDayGroup,
  type SharedSetupCharacteristics,
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
}

function scopeCaption(shootDayCount: number): string {
  if (shootDayCount === 0) {
    return 'Analyzing scheduled shot strips for this production (no shoot days yet).'
  }
  return `Analyzing ${shootDayCount} shoot day${shootDayCount === 1 ? '' : 's'} and every scheduled shot strip in this production.`
}

function formatDayInvolvedLine(insight: SmartSchedulingInsight): string {
  const labels = insight.byDay.map((g) => g.dayLabel)
  if (labels.length <= 3) {
    return labels.join(' · ')
  }
  return `${labels.slice(0, 2).join(' · ')} · +${labels.length - 2} more`
}

function SharedAttributes({ shared }: { shared: SharedSetupCharacteristics }) {
  const rows: { label: string; value: string }[] = []
  if (shared.groupScope === 'scene' && shared.sceneNumber) {
    rows.push({ label: 'Grouped by', value: `Scene ${shared.sceneNumber}` })
  } else if (shared.groupScope === 'location' && shared.location) {
    rows.push({ label: 'Grouped by', value: `Location · ${shared.location}` })
  }
  if (shared.support) rows.push({ label: 'Support', value: shared.support })
  if (shared.shotSize) rows.push({ label: 'Shot size', value: shared.shotSize })
  if (shared.dayNight) rows.push({ label: 'Scene time', value: shared.dayNight })
  if (shared.location && shared.groupScope !== 'location') {
    rows.push({ label: 'Location', value: shared.location })
  }
  if (shared.castNote) rows.push({ label: 'Cast', value: shared.castNote })

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No extra shared fields beyond the summary (metadata is sparse on these shots).
      </p>
    )
  }

  return (
    <dl className="grid gap-1.5 text-xs m-0">
      {rows.map((r) => (
        <div key={r.label} className="flex gap-2 flex-wrap">
          <dt className="text-muted-foreground shrink-0 font-medium">{r.label}</dt>
          <dd className="m-0 text-foreground/90">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
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
          <div className="pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Summary
            </p>
            <p className="text-sm text-foreground/85 leading-snug">{insight.summary}</p>
          </div>
          {insight.suggestion && (
            <div className="rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2">
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
              Shared setup
            </p>
            <SharedAttributes shared={insight.shared} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Days involved ({insight.distinctDayCount})
            </p>
            <p className="text-xs text-foreground/85">{formatDayInvolvedLine(insight)}</p>
          </div>
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
}: SmartSchedulingInsightsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
      <p className="text-sm text-muted-foreground">
        Loading shot and cast metadata for insights…
      </p>
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

  return (
    <section
      className={cn(
        'rounded-lg border border-border/80 bg-card/40 px-4 py-3 shadow-sm',
        className
      )}
      aria-labelledby="smart-scheduling-insights-heading"
    >
      <div className="flex items-start gap-2.5">
        <Lightbulb
          className="size-4 shrink-0 mt-0.5 text-primary/80"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2
              id="smart-scheduling-insights-heading"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              Smart Scheduling Insights
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{scopeCaption(shootDays.length)}</p>
          </div>
          {body}
          {!isLoading && result.state === 'ready' && result.insights.length > 0 && (
            <p className="text-xs text-muted-foreground pt-0.5">
              For planning only — review strips on the board; nothing here changes the schedule.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
