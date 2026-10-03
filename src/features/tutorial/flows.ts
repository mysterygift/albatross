import { TUTORIAL_SECTIONS, type TutorialSectionId } from './tutorialSections'
import type { TutorialFlow } from './engine/types'
import { dashboardFlow } from './sections/dashboardTutorial'
import { scheduleFlow } from './sections/scheduleTutorial'
import { budgetFlow } from './sections/budgetTutorial'
import { crewFlow } from './sections/crewTutorial'
import { castFlow } from './sections/castTutorial'
import { equipmentFlow } from './sections/equipmentTutorial'
import { locationsFlow } from './sections/locationsTutorial'
import { callSheetsFlow } from './sections/callSheetsTutorial'
import { movementOrdersFlow } from './sections/movementOrdersTutorial'
import { tasksFlow } from './sections/tasksTutorial'
import { deliverablesFlow } from './sections/deliverablesTutorial'
import { musicArchiveFlow } from './sections/musicArchiveTutorial'

/** Every interactive flow, keyed by section. Section order is TUTORIAL_SECTION_IDS. */
export const TUTORIAL_FLOWS: Record<TutorialSectionId, TutorialFlow> = {
  dashboard: dashboardFlow,
  schedule: scheduleFlow,
  budget: budgetFlow,
  crew: crewFlow,
  cast: castFlow,
  equipment: equipmentFlow,
  locations: locationsFlow,
  call_sheets: callSheetsFlow,
  movement_orders: movementOrdersFlow,
  tasks: tasksFlow,
  deliverables: deliverablesFlow,
  music_archive: musicArchiveFlow,
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
