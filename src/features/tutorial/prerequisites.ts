import { listCast } from '@/lib/db/repositories/person'
import { listScenesByProduction, listShootDaysByProduction, listShotsByProduction } from '@/lib/db/repositories/schedule'
import type { TutorialNeedKind } from './engine/types'
import type { TutorialSectionId } from './tutorialSections'

export type MissingNeed = {
  kind: TutorialNeedKind
  /** How the item is described to the user, e.g. "a scene". */
  label: string
  /** The section that creates it. */
  section: TutorialSectionId
}

const NEED_INFO: Record<TutorialNeedKind, Omit<MissingNeed, 'kind'>> = {
  scene: { label: 'a scene', section: 'schedule' },
  shot: { label: 'a shot', section: 'schedule' },
  shootDay: { label: 'a shoot day', section: 'schedule' },
  castMember: { label: 'a cast member', section: 'cast' },
}

async function countNeed(kind: TutorialNeedKind, productionId: string): Promise<number> {
  switch (kind) {
    case 'scene':
      return (await listScenesByProduction(productionId)).length
    case 'shot':
      return (await listShotsByProduction(productionId)).length
    case 'shootDay':
      return (await listShootDaysByProduction(productionId)).length
    case 'castMember':
      return (await listCast(productionId)).filter((p) => Boolean(p.is_cast)).length
  }
}

/** The first record the tutorial project is missing, in the order the step lists them. */
export async function findMissingNeed(needs: TutorialNeedKind[], productionId: string): Promise<MissingNeed | null> {
  for (const kind of needs) {
    if ((await countNeed(kind, productionId)) === 0) return { kind, ...NEED_INFO[kind] }
  }
  return null
}
