import { Globe } from 'lucide-react'

export function GlobalVendorBadge({ className }: { className?: string }) {
  return (
    <Globe
      className={`size-3 shrink-0 text-muted-foreground ${className ?? ''}`}
      aria-label="Shared across all projects"
      title="Shared across all projects"
    />
  )
}
