import { useRef } from 'react'
import { RiskFactorPill } from '@/features/risk-assessments/RiskFactorPill'
import {
  RISK_BAND_COLORS,
  RISK_BAND_LABELS,
  RISK_SCALE,
  riskBand,
  riskFactor,
} from '@/lib/risk-assessments/riskMatrix'
import { cn } from '@/lib/utils'

export type RiskRating = { severity: number; probability: number }

export type RiskMatrixProps = {
  /** Accessible name of the group, e.g. "Risk before controls". */
  label: string
  value: RiskRating
  onChange?: (next: RiskRating) => void
  readOnly?: boolean
  className?: string
}

const clamp = (n: number) => Math.min(5, Math.max(1, n))

/**
 * 5x5 risk matrix: probability on the rows (5 at the top), severity on the columns. Each cell shows
 * its factor in its band colour; the selected cell is full strength with a ring, others are dimmed.
 * A `radiogroup`: arrow keys move the selection, and the band is also written out as text.
 */
export function RiskMatrix({ label, value, onChange, readOnly = false, className }: RiskMatrixProps) {
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  const factor = riskFactor(value.severity, value.probability)

  const select = (severity: number, probability: number, focus = false) => {
    const next = { severity: clamp(severity), probability: clamp(probability) }
    if (readOnly) return
    onChange?.(next)
    if (focus) cellRefs.current.get(`${next.severity}-${next.probability}`)?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent, severity: number, probability: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    select(severity + move[0], probability + move[1], true)
  }

  return (
    <div data-slot="risk-matrix" className={cn('inline-flex flex-col gap-1', className)}>
      <div className="flex items-stretch gap-1">
        <div className="flex items-center">
          <span
            className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Probability
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <div role="radiogroup" aria-label={label} className="flex flex-col gap-0.5">
            {[...RISK_SCALE].reverse().map((p) => (
              <div key={p} className="flex items-center gap-0.5">
                <span className="text-muted-foreground w-3 text-center text-[10px]" aria-hidden="true">
                  {p}
                </span>
                {RISK_SCALE.map((s) => {
                  const cellFactor = riskFactor(s, p)
                  const band = riskBand(cellFactor)
                  const selected = s === value.severity && p === value.probability
                  const colors = RISK_BAND_COLORS[band]
                  return (
                    <button
                      key={s}
                      ref={(el) => {
                        if (el) cellRefs.current.set(`${s}-${p}`, el)
                        else cellRefs.current.delete(`${s}-${p}`)
                      }}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`Severity ${s}, probability ${p}: risk ${cellFactor}, ${RISK_BAND_LABELS[band]}`}
                      tabIndex={selected ? 0 : -1}
                      disabled={readOnly}
                      onClick={() => select(s, p)}
                      onKeyDown={(e) => onKeyDown(e, s, p)}
                      className={cn(
                        'focus-visible:ring-ring size-9 rounded-sm text-xs font-semibold tabular-nums transition-opacity focus-visible:ring-2 focus-visible:outline-none',
                        selected
                          ? 'ring-foreground ring-offset-background z-10 opacity-100 ring-2 ring-offset-1'
                          : 'opacity-50 hover:opacity-80',
                        readOnly && 'cursor-default'
                      )}
                      style={{ background: colors.bg, color: colors.fg }}
                    >
                      {cellFactor}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-0.5 pl-3.5" aria-hidden="true">
            {RISK_SCALE.map((s) => (
              <span key={s} className="text-muted-foreground size-9 text-center text-[10px]">
                {s}
              </span>
            ))}
          </div>
          <span className="text-muted-foreground pl-3.5 text-center text-[10px] font-medium uppercase tracking-wide">
            Severity
          </span>
        </div>
      </div>
      <div className="flex justify-center pl-4">
        <RiskFactorPill factor={factor} className="px-3 py-1 text-sm" />
      </div>
    </div>
  )
}
