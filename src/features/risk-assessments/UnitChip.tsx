import { unitColorVars, unitNameToKey } from '@/lib/schedule/unitKey'
import { cn } from '@/lib/utils'

/** Unit-coloured chip (`--unit-main` … `--unit-fifth`), matching the calendar. */
export function UnitChip({ name, className }: { name: string; className?: string }) {
  const colors = unitColorVars(unitNameToKey(name))
  return (
    <span
      data-slot="unit-chip"
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', className)}
      style={{ background: colors.background, color: colors.foreground }}
    >
      {name}
    </span>
  )
}
