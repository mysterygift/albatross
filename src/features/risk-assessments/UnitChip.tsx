import { unitNameToKey } from '@/lib/schedule/unitKey'
import { cn } from '@/lib/utils'

/** Unit-coloured chip (`--unit-main` / `--unit-second`), matching the calendar. */
export function UnitChip({ name, className }: { name: string; className?: string }) {
  const isMain = unitNameToKey(name) === 'main'
  return (
    <span
      data-slot="unit-chip"
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', className)}
      style={{
        background: isMain ? 'var(--unit-main)' : 'var(--unit-second)',
        color: isMain ? 'var(--unit-main-foreground)' : 'var(--unit-second-foreground)',
      }}
    >
      {name}
    </span>
  )
}
