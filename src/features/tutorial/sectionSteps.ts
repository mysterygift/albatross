import type { TutorialStep } from './SectionTutorialPanel'
import { TUTORIAL_SECTIONS, type TutorialSectionId } from './tutorialSections'
import { dashboardTutorialSteps } from './sections/dashboardTutorial'
import { scheduleTutorialSteps } from './sections/scheduleTutorial'
import { budgetTutorialSteps } from './sections/budgetTutorial'
import { crewTutorialSteps } from './sections/crewTutorial'
import { castTutorialSteps } from './sections/castTutorial'
import { equipmentTutorialSteps } from './sections/equipmentTutorial'
import { locationsTutorialSteps } from './sections/locationsTutorial'
import { callSheetsTutorialSteps } from './sections/callSheetsTutorial'
import { movementOrdersTutorialSteps } from './sections/movementOrdersTutorial'
import { tasksTutorialSteps } from './sections/tasksTutorial'
import { deliverablesTutorialSteps } from './sections/deliverablesTutorial'
import { musicArchiveTutorialSteps } from './sections/musicArchiveTutorial'

export const SECTION_STEPS: Record<TutorialSectionId, TutorialStep[]> = {
  dashboard: dashboardTutorialSteps,
  schedule: scheduleTutorialSteps,
  budget: budgetTutorialSteps,
  crew: crewTutorialSteps,
  cast: castTutorialSteps,
  equipment: equipmentTutorialSteps,
  locations: locationsTutorialSteps,
  call_sheets: callSheetsTutorialSteps,
  movement_orders: movementOrdersTutorialSteps,
  tasks: tasksTutorialSteps,
  deliverables: deliverablesTutorialSteps,
  music_archive: musicArchiveTutorialSteps,
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** Maps a router pathname to the tutorial section that covers it, or null when none does. */
export function resolveTutorialSection(pathname: string): TutorialSectionId | null {
  if (pathname === '/' || pathname === '') return 'dashboard'
  if (matchesPrefix(pathname, '/schedule')) return 'schedule'
  if (matchesPrefix(pathname, '/tasks') || matchesPrefix(pathname, '/readiness')) return 'tasks'
  for (const section of TUTORIAL_SECTIONS) {
    if (section.route === '/') continue
    if (matchesPrefix(pathname, section.route)) return section.id
  }
  return null
}
