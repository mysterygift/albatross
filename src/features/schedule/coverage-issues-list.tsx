import { AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { CoverageIssue, CoverageSeverity } from '@/lib/db/coverageAnalysisService'

const SEVERITY_ORDER: CoverageSeverity[] = ['blocking', 'warning', 'info']

const SEVERITY_LABEL: Record<CoverageSeverity, string> = {
  blocking: 'Blocking',
  warning: 'Warning',
  info: 'Info',
}

function severityStyles(severity: CoverageSeverity): {
  border: string
  bg: string
  icon: string
  text: string
} {
  if (severity === 'blocking') {
    return {
      border: 'border-destructive/40',
      bg: 'bg-destructive/10',
      icon: 'text-destructive',
      text: 'text-destructive',
    }
  }
  if (severity === 'info') {
    return {
      border: 'border-border/60',
      bg: 'bg-muted/50',
      icon: 'text-muted-foreground',
      text: 'text-muted-foreground',
    }
  }
  return {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
  }
}

function sortIssues(issues: CoverageIssue[]): CoverageIssue[] {
  return [...issues].sort((a, b) => {
    const ai = SEVERITY_ORDER.indexOf(a.severity)
    const bi = SEVERITY_ORDER.indexOf(b.severity)
    return ai - bi
  })
}

export function CoverageIssuesSummary({ issues }: { issues: CoverageIssue[] }) {
  if (issues.length === 0) {
    return <p className="text-xs text-muted-foreground">No issues detected.</p>
  }
  const blocking = issues.filter((i) => i.severity === 'blocking').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const info = issues.filter((i) => i.severity === 'info').length
  const parts: string[] = []
  if (blocking > 0) parts.push(`${blocking} blocking`)
  if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`)
  if (info > 0) parts.push(`${info} info`)
  const ready = blocking === 0 && warnings === 0
  return (
    <p className="text-xs text-muted-foreground">
      {parts.join(' · ')}
      {ready && info === 0 ? ' · Ready' : blocking === 0 && warnings === 0 ? ' · Ready for review' : ''}
    </p>
  )
}

export function CoverageIssuesList({
  issues,
  showSeverityLabels = true,
}: {
  issues: CoverageIssue[]
  showSeverityLabels?: boolean
}) {
  if (issues.length === 0) {
    return <p className="text-xs text-muted-foreground">No issues detected.</p>
  }

  const sorted = sortIssues(issues)

  return (
    <ul className="space-y-2">
      {sorted.map((issue, index) => {
        const styles = severityStyles(issue.severity)
        return (
          <li
            key={`${issue.code}-${issue.sectionId ?? issue.shotId ?? issue.sceneId ?? index}`}
            className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${styles.border} ${styles.bg}`}
          >
            <AlertTriangle className={`mt-0.5 size-3.5 shrink-0 ${styles.icon}`} />
            <div className="min-w-0 flex-1">
              {showSeverityLabels && (
                <Badge variant="outline" className="mb-1 text-[10px] font-normal">
                  {SEVERITY_LABEL[issue.severity]}
                </Badge>
              )}
              <p className={`text-xs ${styles.text}`}>{issue.message}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
