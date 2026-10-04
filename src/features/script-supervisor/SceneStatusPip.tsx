import { cn } from '@/lib/utils'
import { SCENE_STATUS_LABEL, type SceneProgressStatus } from '@/lib/script-supervisor/progress'

/**
 * Scene status marker: filled = complete, half = part shot, ring = not shot, dash = omitted.
 * Shape carries the meaning (not colour alone); the label is exposed to assistive tech.
 */
export function SceneStatusPip({ status, className }: { status: SceneProgressStatus; className?: string }) {
  const label = SCENE_STATUS_LABEL[status]
  if (status === 'omitted') {
    return <span role="img" aria-label={label} className={cn('inline-block h-0.5 w-2 bg-muted-foreground', className)} />
  }
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'inline-block size-2 shrink-0 rounded-full border-2 box-border',
        status === 'not_shot' ? 'border-muted-foreground' : 'border-primary',
        status === 'complete' && 'bg-primary',
        status === 'part_shot' && 'bg-[linear-gradient(90deg,var(--color-primary)_50%,transparent_50%)]',
        className
      )}
    />
  )
}
