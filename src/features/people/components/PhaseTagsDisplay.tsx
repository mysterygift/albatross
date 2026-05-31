import { Badge } from '@/components/ui/badge'
import { formatPhaseLabel, parsePhases } from '@/lib/people/productionPhases'

export function PhaseTagsDisplay({ phases }: { phases: string | null | undefined }) {
  const parsed = parsePhases(phases)

  if (parsed.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {parsed.map((phase) => (
        <Badge key={phase} variant="secondary">
          {formatPhaseLabel(phase)}
        </Badge>
      ))}
    </div>
  )
}
