import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { isEighthStart, type SceneLine } from '@/lib/db/scriptSectionLayout'
import {
  SECTION_STATUS_NAME,
  type DerivedSectionStatus,
  type SectionStatusStep,
} from '@/lib/db/scriptSectionStatus'
import { STATUS_BADGE_CLASS } from './script-section-status-styles'

const STEP_TEXT_CLASS: Record<SectionStatusStep['key'], string> = {
  covered: 'text-slate-400',
  scheduled: 'text-violet-400',
  shot: 'text-primary',
}

const STEP_FILL_CLASS: Record<SectionStatusStep['key'], string> = {
  covered: 'bg-slate-400',
  scheduled: 'bg-violet-400',
  shot: 'bg-primary',
}

export function SectionStatusBadge({
  status,
  label,
  className,
}: {
  status: DerivedSectionStatus
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums',
        STATUS_BADGE_CLASS[status],
        className
      )}
    >
      {label ?? SECTION_STATUS_NAME[status]}
    </span>
  )
}

/** Covered → Scheduled → Shot, each with the reason it is (or isn't) reached. */
export function SectionStatusSteps({
  steps,
  orientation = 'horizontal',
}: {
  steps: SectionStatusStep[]
  orientation?: 'horizontal' | 'vertical'
}) {
  if (orientation === 'horizontal') {
    return (
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Section progress">
        {steps.map((step) => (
          <li key={step.key} className="grid gap-1">
            <div className="h-1 overflow-hidden rounded-full bg-border">
              <div
                className={cn('h-full', STEP_FILL_CLASS[step.key])}
                style={{ width: step.state === 'done' ? '100%' : step.state === 'partial' ? '50%' : '0%' }}
              />
            </div>
            <span
              className={cn(
                'text-xs font-semibold',
                step.state === 'todo' ? 'text-foreground' : STEP_TEXT_CLASS[step.key]
              )}
            >
              {step.name}
            </span>
            <span className="text-xs text-muted-foreground">{step.detail}</span>
          </li>
        ))}
      </ol>
    )
  }
  return (
    <ol className="grid" aria-label="Section progress">
      {steps.map((step, i) => (
        <li key={step.key} className="relative grid grid-cols-[18px_1fr] gap-2.5 pb-3 last:pb-0">
          {i < steps.length - 1 && (
            <span aria-hidden className="absolute bottom-0 left-2 top-5 w-0.5 bg-border" />
          )}
          <span
            aria-hidden
            className={cn(
              'mt-0.5 size-[18px] rounded-full border-2',
              step.state === 'todo' ? 'border-border bg-card' : `border-current ${STEP_TEXT_CLASS[step.key]}`,
              step.state === 'done' && STEP_FILL_CLASS[step.key]
            )}
            style={
              step.state === 'partial'
                ? { background: 'linear-gradient(90deg, currentColor 50%, transparent 50%)' }
                : undefined
            }
          />
          <div>
            <p
              className={cn(
                'text-sm font-semibold',
                step.state === 'todo' ? 'text-foreground' : STEP_TEXT_CLASS[step.key]
              )}
            >
              {step.name}
              <span className="sr-only">
                {step.state === 'done' ? ' (done)' : step.state === 'partial' ? ' (partly done)' : ' (not yet)'}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export type ScriptLineDecor = {
  /** Classes for the text cell (highlight tint). */
  textClassName?: string
  textStyle?: React.CSSProperties
  /** Classes for the 4px gutter band. */
  bandClassName?: string
  /** Gutter label replacing the eighth tick (e.g. a section code). */
  tag?: ReactNode
  dim?: boolean
}

type ScriptLinesProps = {
  lines: readonly SceneLine[]
  decorate?: (line: SceneLine) => ScriptLineDecor
  /** Adds data-line and pointer handlers so lines can be selected. */
  interactive?: boolean
  onLinePointerDown?: (line: SceneLine, event: React.PointerEvent<HTMLDivElement>) => void
  onLinePointerEnter?: (line: SceneLine, event: React.PointerEvent<HTMLDivElement>) => void
  onLineClick?: (line: SceneLine, event: React.MouseEvent<HTMLDivElement>) => void
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>

/** Script text rendered line by line with page headers, eighth ticks and a status/section gutter. */
export const ScriptLines = forwardRef<HTMLDivElement, ScriptLinesProps>(function ScriptLines(
  { lines, decorate, interactive, onLinePointerDown, onLinePointerEnter, onLineClick, className, ...rest },
  ref
) {
  return (
    <div ref={ref} className={cn('relative', className)} {...rest}>
      {lines.map((line, i) => {
        const decor = decorate?.(line) ?? {}
        const newPage = i === 0 || lines[i - 1]!.pageId !== line.pageId
        return (
          <div key={`${line.pageId}:${line.lineInPage}`}>
            {newPage && (
              <div className="flex items-center gap-2.5 px-3 pb-2 pt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground after:h-px after:flex-1 after:bg-border">
                Page {line.pageNumber}
              </div>
            )}
            <div
              data-line={line.index}
              className={cn(
                'grid min-h-[1.55em] grid-cols-[2.75rem_4px_minmax(0,1fr)] gap-x-2.5 pr-3',
                interactive && 'cursor-text select-none',
                decor.dim && 'opacity-40'
              )}
              onPointerDown={onLinePointerDown ? (e) => onLinePointerDown(line, e) : undefined}
              onPointerEnter={onLinePointerEnter ? (e) => onLinePointerEnter(line, e) : undefined}
              onClick={onLineClick ? (e) => onLineClick(line, e) : undefined}
            >
              <span className="text-right font-mono text-[10.5px] leading-[1.9] text-muted-foreground/80 tabular-nums">
                {decor.tag ?? (isEighthStart(lines, i) ? `${line.startEighth}/8` : '')}
              </span>
              <span className={cn(decor.bandClassName)} />
              <span
                className={cn(
                  'min-w-0 whitespace-pre-wrap px-1.5 font-mono text-[12.5px] leading-[1.55] text-foreground',
                  decor.textClassName
                )}
                style={decor.textStyle}
              >
                {line.text || ' '}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
})

/** Range, length, estimate tag and characters for a section row. */
export function SectionSummary({
  rangeText,
  lengthText,
  estimated,
  characters,
  cut,
  extra,
}: {
  rangeText: string
  lengthText: string | null
  estimated: boolean
  characters: string[]
  cut?: boolean
  extra?: ReactNode
}) {
  return (
    <span className="min-w-0 tabular-nums">
      <span className={cn(cut && 'text-muted-foreground line-through')}>{rangeText}</span>
      {lengthText && <span className="ml-1.5 text-xs text-muted-foreground">{lengthText}</span>}
      {estimated && (
        <span
          className="ml-1.5 rounded border border-dashed border-border px-1 font-mono text-[10px] text-muted-foreground"
          title="Generated from the import; boundaries are an estimate"
        >
          est.
        </span>
      )}
      {extra}
      {characters.length > 0 && (
        <span className="block text-xs tracking-wide text-muted-foreground">{characters.join(' · ')}</span>
      )}
    </span>
  )
}
