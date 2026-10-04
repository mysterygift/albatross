import {
  RISK_BAND_COLORS,
  formatRiskFactor,
  riskBand,
} from '@/lib/risk-assessments/riskMatrix'
import { cn } from '@/lib/utils'

/** `12 | Severe` in the band's fixed colours (text label means it is never colour-only). */
export function RiskFactorPill({ factor, className }: { factor: number; className?: string }) {
  const c = RISK_BAND_COLORS[riskBand(factor)]
  return (
    <span
      data-slot="risk-factor-pill"
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', className)}
      style={{ background: c.bg, color: c.fg }}
    >
      {formatRiskFactor(factor)}
    </span>
  )
}
