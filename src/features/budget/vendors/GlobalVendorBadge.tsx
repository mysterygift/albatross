import { Globe } from 'lucide-react'

export function GlobalVendorBadge({ className }: { className?: string }) {
  return (
    <span title="Shared across all projects" className="inline-flex">
      <Globe
        className={`size-3 shrink-0 text-muted-foreground ${className ?? ''}`}
        aria-label="Shared across all projects"
      />
    </span>
  )
}
