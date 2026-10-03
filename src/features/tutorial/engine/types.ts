import type { TutorialEventName, TutorialEvent } from './events'
import type { TutorialSectionId } from '../tutorialSections'

/** Records the tutorial project must already contain before a step can be done. */
export type TutorialNeedKind = 'scene' | 'shot' | 'shootDay' | 'castMember'

/**
 * What validates a step. Steps never submit forms or type for the user; the real saved change is observed.
 * - `view`: the target is on screen (orientation steps). Next enables on arrival.
 * - `click`: the user clicks the highlighted target.
 * - `event`: a domain write for the tutorial project succeeded (optionally matched against its payload).
 */
export type TutorialRequirement =
  | { kind: 'view' }
  | { kind: 'click' }
  | { kind: 'event'; event: TutorialEventName; match?: (event: TutorialEvent) => boolean }

export type TutorialStep = {
  id: string
  title: string
  /** Why this matters, shown above the instruction. */
  body: string
  /** What to do now, e.g. "Click Add shot day". */
  instruction: string
  /** Matches `data-tutorial="..."` on the page. Omit for a centred card with no spotlight. */
  target?: string
  /** Overrides the section route for this step (e.g. the stripboard lives under /schedule/stripboard). */
  route?: string
  /** Stripboard and similar pages keep their view in the URL. The engine sets this param before the step. */
  view?: { param: string; value: string }
  requires: TutorialRequirement
  /** Shown when the user goes off-step. */
  hint?: string
  /** Records that must already exist in the tutorial project. Next stays disabled until they do. */
  needs?: TutorialNeedKind[]
  /** Allows "Skip step" without the requirement. */
  optional?: boolean
}

export type TutorialFlow = {
  sectionId: TutorialSectionId
  title: string
  /** Default route for the section. */
  route: string
  steps: TutorialStep[]
}
