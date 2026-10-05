import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { useWorkspaceBox } from './useWorkspaceBox'

/** Scene rail (104px) + deck (392px) + gaps + the lined script's 560px minimum, so the tramline lanes stay in view. */
const WIDE_MIN_WIDTH = 1080
/** Below this height (landscape with the sidebar open) the docked deck drops its takes row to leave room for the script. */
const SHORT_MAX_HEIGHT = 800
/** Below this width (a phone held upright) the docked deck stacks its controls and the toolbars wrap. */
const COMPACT_MAX_WIDTH = 640
/**
 * A phone on its side: too short to dock the deck under the workbench, so the panes sit side by side
 * like the wide arrangement, with a narrower deck.
 */
const PHONE_LANDSCAPE_MAX_HEIGHT = 500
const PHONE_LANDSCAPE_MIN_WIDTH = 760

export type TabletArrangement = 'wide' | 'narrow'

export type TabletLayout = {
  arrangement: TabletArrangement
  /** Little height to spare. */
  short: boolean
  /** Phone width: controls stack instead of sitting in one row. */
  compact: boolean
  /** Phone on its side: panes side by side but very short, so the deck scrolls as a whole. */
  phoneLandscape: boolean
}

/**
 * Tablet (touch) Line & log workspace. It fills the window height and each pane scrolls on its own, so the
 * roll and mark controls never scroll away.
 *
 * - Wide (landscape, sidebar hidden; or a phone on its side): scene rail | workbench | slate deck, side by side.
 * - Narrow (portrait, or the sidebar open): scene strip on top, workbench, slate deck docked at the bottom.
 *   On a phone held upright it is also compact: the deck and toolbars stack their controls.
 *
 * The arrangement follows the workspace's own width rather than the window's, so the sidebar is accounted for.
 */
export function TabletWorkspace({
  scenes,
  workbench,
  deck,
}: {
  scenes: (arrangement: TabletArrangement) => ReactNode
  workbench: (layout: TabletLayout) => ReactNode
  deck: (layout: TabletLayout) => ReactNode
}) {
  const [ref, box] = useWorkspaceBox()
  const width = box?.width ?? 0
  const phoneLandscape =
    typeof window !== 'undefined' && window.innerHeight < PHONE_LANDSCAPE_MAX_HEIGHT && width >= PHONE_LANDSCAPE_MIN_WIDTH
  const arrangement: TabletArrangement = width >= WIDE_MIN_WIDTH || phoneLandscape ? 'wide' : 'narrow'
  const layout: TabletLayout = {
    arrangement,
    short: (box?.height ?? Infinity) < SHORT_MAX_HEIGHT,
    // jsdom lays out at zero width; treat that as unmeasured rather than as a phone.
    compact: arrangement === 'narrow' && width > 0 && width < COMPACT_MAX_WIDTH,
    phoneLandscape: arrangement === 'wide' && phoneLandscape,
  }

  return (
    <div
      ref={ref}
      data-arrangement={arrangement}
      data-compact={layout.compact || undefined}
      style={box ? { height: box.height } : undefined}
      className={cn(
        'grid',
        layout.compact ? 'gap-2' : 'gap-3',
        arrangement === 'wide'
          ? phoneLandscape && width < WIDE_MIN_WIDTH
            ? 'grid-cols-[88px_minmax(0,1fr)_320px] grid-rows-[minmax(0,1fr)]'
            : 'grid-cols-[104px_minmax(0,1fr)_392px] grid-rows-[minmax(0,1fr)]'
          : 'grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]'
      )}
    >
      {scenes(arrangement)}
      <div className={cn('flex min-h-0 min-w-0 flex-col', layout.compact ? 'gap-2' : 'gap-3')}>{workbench(layout)}</div>
      {deck(layout)}
    </div>
  )
}
