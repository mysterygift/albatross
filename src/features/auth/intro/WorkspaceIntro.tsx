import { AlbatrossLogo } from '@/components/AlbatrossLogo'

import './workspaceIntro.css'

/** Drives the handoff controller: `playMs` is the intro, `exitMs` is the iris opening onto the app. */
export const WORKSPACE_INTRO_TIMING = { playMs: 2400, exitMs: 800 } as const

type WorkspaceIntroProps = {
  /**
   * `false` while the intro plays, `true` once the exit starts. The app shell must already be
   * mounted at full opacity underneath when this flips: the exit cuts a hole in the overlay.
   */
  exiting: boolean
}

/** Tile traces itself, wordmark tracks in, then a circular iris opens onto the app. */
export function WorkspaceIntro({ exiting }: WorkspaceIntroProps) {
  return (
    <div className="wsi" data-testid="workspace-intro" data-exiting={exiting}>
      <div className="wsi__bg" />
      <div className="wsi__glow" aria-hidden />
      <div className="wsi__stack">
        <div className="wsi__tile">
          <svg className="wsi__outline" viewBox="0 0 100 100" aria-hidden>
            <rect
              x="0.5"
              y="0.5"
              width="99"
              height="99"
              rx="27"
              pathLength={1}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <AlbatrossLogo size="lg" className="wsi__logo" />
        </div>
        <h1 className="wsi__word">Albatross</h1>
        <p className="wsi__sub">Your production workspace</p>
      </div>
    </div>
  )
}
