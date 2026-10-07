import { FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * Marks a page as an experimental feature (see Settings → Developer → Experimental features).
 * `compact` shows only the flask, for toolbars on a phone where the word would squeeze the controls.
 */
export function ExperimentalBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge
      variant="outline"
      data-slot="experimental-badge"
      className="gap-1 align-middle text-xs"
      title={compact ? 'Experimental' : undefined}
    >
      <FlaskConical aria-hidden />
      {compact ? <span className="sr-only">Experimental</span> : 'Experimental'}
    </Badge>
  )
}
