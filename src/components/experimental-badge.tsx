import { FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/** Marks a page as an experimental feature (see Settings → Developer → Experimental features). */
export function ExperimentalBadge() {
  return (
    <Badge variant="outline" data-slot="experimental-badge" className="gap-1 align-middle text-xs">
      <FlaskConical aria-hidden />
      Experimental
    </Badge>
  )
}
