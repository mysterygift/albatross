import type { ReactElement } from 'react'

import { formatAccelerator, isMacPlatform } from '@/app/menuSchema'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Small `<kbd>` showing a menu accelerator (or a literal key such as `?`). */
export function ShortcutHint({
  accelerator,
  keys,
  className,
}: {
  /** Menu accelerator, e.g. `CmdOrCtrl+B`. */
  accelerator?: string
  /** Literal text to show instead (e.g. `?`). */
  keys?: string
  className?: string
}) {
  const text = keys ?? (accelerator ? formatAccelerator(accelerator, isMacPlatform()) : '')
  if (!text) return null
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground',
        className,
      )}
    >
      {text}
    </kbd>
  )
}

/** Wraps a single trigger element in a tooltip showing `label` plus its shortcut. */
export function ShortcutTooltip({
  label,
  accelerator,
  keys,
  side = 'bottom',
  children,
}: {
  label: string
  accelerator?: string
  keys?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span className="flex items-center gap-2">
          {label}
          <ShortcutHint
            accelerator={accelerator}
            keys={keys}
            className="border-background/30 bg-background/10 text-background"
          />
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
