/**
 * Demo seed ID source: provides entity IDs for seeding demo-style content.
 * Used by (1) singleton demo production (DEMO_SLUG) via makeDemoSeedIdSourceFromIDS,
 * and (2) user-created Demo template productions via buildDemoSeedIdSourceWithUuid.
 * Keeps the two flows separate and avoids collision with DEMO_SLUG.
 */

import { uuid } from '../client'
import { IDS } from './constants'
import { DEMO_BUDGET_ITEMS, DEMO_EXPENSES } from './demoBudgetSeed'
import { DEMO_LINKS } from './demoReconciliationSeed'

export type DemoSeedIdSource = {
  unitMain: string
  unitSecond: string
  shootDay: (n: number) => string
  shootDayUnit: (dayIdx: number, unitIdx: number) => string
  scene: (n: number) => string
  shot: (n: number) => string
  person: (n: number) => string
  location: (n: number) => string
  equipmentTerm: (n: number) => string
  sceneCast: (n: number) => string
  shotCast: (n: number) => string
  availability: (n: number) => string
  locationScene: (n: number) => string
  budgetItem: (n: number) => string
  expense: (n: number) => string
  keyContact: (n: number) => string
  strip: (n: number) => string
  document: (n: number) => string
  musicTrack: (n: number) => string
  clearance: (n: number) => string
  cueSheet: string
  booking: (n: number) => string
  taskSection: (n: number) => string
  task: (n: number) => string
  deliverable: (n: number) => string
  technicalSpec: (n: number) => string
  reconciliationLink: (n: number) => string
}

/** ID source for the singleton demo production (DEMO_SLUG). Uses fixed IDS. */
export function makeDemoSeedIdSourceFromIDS(): DemoSeedIdSource {
  return {
    unitMain: IDS.unitMain,
    unitSecond: IDS.unitSecond,
    shootDay: IDS.shootDay,
    shootDayUnit: IDS.shootDayUnit,
    scene: IDS.scene,
    shot: IDS.shot,
    person: IDS.person,
    location: IDS.location,
    equipmentTerm: IDS.equipmentTerm,
    sceneCast: IDS.sceneCast,
    shotCast: IDS.shotCast,
    availability: IDS.availability,
    locationScene: IDS.locationScene,
    budgetItem: IDS.budgetItem,
    expense: IDS.expense,
    keyContact: IDS.keyContact,
    strip: IDS.strip,
    document: IDS.document,
    musicTrack: IDS.musicTrack,
    clearance: IDS.clearance,
    cueSheet: IDS.cueSheet,
    booking: IDS.booking,
    taskSection: IDS.taskSection,
    task: IDS.task,
    deliverable: IDS.deliverable,
    technicalSpec: IDS.technicalSpec,
    reconciliationLink: IDS.reconciliationLink,
  }
}

/** ID source for a user-created Demo template production. Uses uuid() so no collision with singleton. */
export function buildDemoSeedIdSourceWithUuid(): DemoSeedIdSource {
  const n = (count: number) => Array.from({ length: count }, () => uuid())
  const unitIds = n(2)
  const shootDayIds = n(12)
  const shootDayUnitIds = Array.from({ length: 12 * 2 }, () => uuid())
  const sceneIds = n(45)
  const shotIds = n(120)
  const personIds = n(28)
  const locationIds = n(14)
  const equipmentTermIds = n(17)
  const sceneCastCount = 200
  const sceneCastIds = n(sceneCastCount)
  const shotCastCount = 60
  const shotCastIds = n(shotCastCount)
  const availabilityIds = n(4)
  const locationSceneIds = n(12)
  const budgetItemIds = n(DEMO_BUDGET_ITEMS.length)
  const expenseIds = n(DEMO_EXPENSES.length)
  const keyContactIds = n(6)
  const stripCount = 12 * 2 * 9 + 20
  const stripIds = n(stripCount)
  const documentIds = n(11)
  const musicTrackIds = n(10)
  const clearanceIds = n(10)
  const bookingIds = n(300)
  const taskSectionIds = n(3)
  const taskIds = n(25)
  const deliverableIds = n(12)
  const technicalSpecIds = n(12)
  const reconciliationLinkIds = n(DEMO_LINKS.length)
  const cueSheetId = uuid()

  return {
    unitMain: unitIds[0]!,
    unitSecond: unitIds[1]!,
    shootDay: (d) => shootDayIds[d - 1]!,
    shootDayUnit: (dayIdx, unitIdx) => shootDayUnitIds[dayIdx * 2 + unitIdx]!,
    scene: (s) => sceneIds[s - 1]!,
    shot: (k) => shotIds[k - 1]!,
    person: (p) => personIds[p - 1]!,
    location: (l) => locationIds[l - 1]!,
    equipmentTerm: (t) => equipmentTermIds[t - 1]!,
    sceneCast: (idx) => sceneCastIds[idx]!,
    shotCast: (idx) => shotCastIds[idx]!,
    availability: (a) => availabilityIds[a - 1]!,
    locationScene: (s) => locationSceneIds[s - 1]!,
    budgetItem: (b) => budgetItemIds[b - 1]!,
    expense: (e) => expenseIds[e - 1]!,
    keyContact: (k) => keyContactIds[k - 1]!,
    strip: (idx) => stripIds[idx]!,
    document: (d) => documentIds[d - 1]!,
    musicTrack: (m) => musicTrackIds[m - 1]!,
    clearance: (c) => clearanceIds[c - 1]!,
    cueSheet: cueSheetId,
    booking: (b) => bookingIds[b - 1]!,
    taskSection: (t) => taskSectionIds[t - 1]!,
    task: (t) => taskIds[t - 1]!,
    deliverable: (d) => deliverableIds[d - 1]!,
    technicalSpec: (t) => technicalSpecIds[t - 1]!,
    reconciliationLink: (r) => reconciliationLinkIds[r - 1]!,
  }
}
