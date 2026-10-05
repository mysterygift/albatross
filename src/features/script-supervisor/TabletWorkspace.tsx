import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { useWorkspaceBox } from './useWorkspaceBox'

/** Scene rail (104px) + deck (392px) + gaps + the lined script's 560px minimum, so the tramline lanes stay in view. */
const WIDE_MIN_WIDTH = 1080
/** Below this height (landscape with the sidebar open) the docked deck drops its takes row to leave room for the script. */
const SHORT_MAX_HEIGHT = 800

export type TabletArrangement = 'wide' | 'narrow'

/**
 * Tablet (touch) Line & log workspace. It fills the window height and each pane scrolls on its own, so the
 * roll and mark controls never scroll away.
 *
 * - Wide (landscape, sidebar hidden): scene rail | workbench | slate deck, side by side.
 * - Narrow (portrait, or the sidebar open): scene strip on top, workbench, slate deck docked at the bottom.
 *
 * The arrangement follows the workspace's own width rather than the window's, so the sidebar is accounted for.
 */
export function TabletWorkspace({
  scenes,
  workbench,
  deck,
}: {
  scenes: (arrangement: TabletArrangement) => ReactNode
  workbench: ReactNode
  deck: (arrangement: TabletArrangement, short: boolean) => ReactNode
}) {
  const [ref, box] = useWorkspaceBox()
  const arrangement: TabletArrangement = (box?.width ?? 0) >= WIDE_MIN_WIDTH ? 'wide' : 'narrow'

  return (
    <div
      ref={ref}
      data-arrangement={arrangement}
      style={box ? { height: box.height } : undefined}
      className={cn(
        'grid gap-3',
        arrangement === 'wide'
          ? 'grid-cols-[104px_minmax(0,1fr)_392px] grid-rows-[minmax(0,1fr)]'
          : 'grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]'
      )}
    >
      {scenes(arrangement)}
      <div className="flex min-h-0 min-w-0 flex-col gap-3">{workbench}</div>
      {deck(arrangement, (box?.height ?? Infinity) < SHORT_MAX_HEIGHT)}
    </div>
  )
}
