import type { Document } from '@/lib/db/types'
import { listDeliverablesByProduction } from '@/lib/db/repositories/deliverable'
import { listEquipmentListsByProduction } from '@/lib/db/repositories/equipmentLists'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listSidesExportsByProduction } from '@/lib/db/repositories/sidesExports'
import {
  DOCUMENT_ENTITY_TYPES,
  getDocumentCategoryId,
  getDocumentTypeLabel,
  type DocumentCategoryId,
} from '@/lib/documents/catalog'

export type EnrichedDocument = Document & {
  categoryId: DocumentCategoryId
  typeLabel: string
  /** Secondary line shown under filename (export label, person name, etc.). */
  contextLabel: string | null
  /** Group key for category views (shoot day id, deliverable id, person id, etc.). */
  groupKey: string
  /** Human-readable group title. */
  groupTitle: string
  /** Optional sort key within group (ISO date string). */
  groupSortKey: string
}

export async function enrichDocumentsForProduction(
  productionId: string,
  documents: Document[]
): Promise<EnrichedDocument[]> {
  if (documents.length === 0) return []

  const [shootDays, deliverables, people, locations, sidesExports, equipmentLists] =
    await Promise.all([
      listShootDaysByProduction(productionId),
      listDeliverablesByProduction(productionId),
      listPeopleByProduction(productionId),
      listLocationsByProduction(productionId),
      listSidesExportsByProduction(productionId),
      listEquipmentListsByProduction(productionId),
    ])

  const shootDayById = new Map(shootDays.map((d) => [d.id, d]))
  const deliverableById = new Map(deliverables.map((d) => [d.id, d]))
  const personById = new Map(people.map((p) => [p.id, p]))
  const locationById = new Map(locations.map((l) => [l.id, l]))
  const sidesExportByDocumentId = new Map(
    sidesExports
      .filter((e) => e.document_id)
      .map((e) => [e.document_id!, e])
  )
  const equipmentListById = new Map(equipmentLists.map((l) => [l.id, l]))

  return documents.map((doc) => enrichSingleDocument(doc, {
    shootDayById,
    deliverableById,
    personById,
    locationById,
    sidesExportByDocumentId,
    equipmentListById,
  }))
}

type LookupMaps = {
  shootDayById: Map<string, { id: string; shoot_date: string; day_number: number | null }>
  deliverableById: Map<string, { id: string; name: string; due_date: string | null; status: string }>
  personById: Map<string, { id: string; name: string; role_name: string | null }>
  locationById: Map<string, { id: string; name: string; address: string | null }>
  sidesExportByDocumentId: Map<string, { export_label: string | null; shoot_day_id: string }>
  equipmentListById: Map<string, { id: string; name: string; shoot_day_id: string | null }>
}

function formatShootDayLabel(day: { shoot_date: string; day_number: number | null }): string {
  if (day.day_number != null) return `Day ${day.day_number} — ${day.shoot_date}`
  return day.shoot_date
}

function enrichSingleDocument(doc: Document, maps: LookupMaps): EnrichedDocument {
  const categoryId = getDocumentCategoryId(doc.entity_type)
  const typeLabel = getDocumentTypeLabel(doc.entity_type)
  const entityType = doc.entity_type

  let contextLabel: string | null = null
  let groupKey = 'ungrouped'
  let groupTitle = 'Other'
  let groupSortKey = doc.created_at

  if (entityType === DOCUMENT_ENTITY_TYPES.sidesExport && doc.entity_id) {
    const sidesRow = maps.sidesExportByDocumentId.get(doc.id)
    const day = maps.shootDayById.get(doc.entity_id)
    contextLabel = sidesRow?.export_label ?? null
    groupKey = doc.entity_id
    groupTitle = day ? formatShootDayLabel(day) : 'Shoot day'
    groupSortKey = day?.shoot_date ?? doc.created_at
  } else if (entityType === DOCUMENT_ENTITY_TYPES.script) {
    groupKey = 'script'
    groupTitle = 'Scripts'
    groupSortKey = doc.created_at
  } else if (entityType === DOCUMENT_ENTITY_TYPES.deliverable && doc.entity_id) {
    const deliverable = maps.deliverableById.get(doc.entity_id)
    contextLabel = deliverable?.status ?? null
    groupKey = doc.entity_id
    groupTitle = deliverable?.name ?? 'Deliverable'
    groupSortKey = deliverable?.due_date ?? deliverable?.name ?? doc.created_at
  } else if (
    (entityType === DOCUMENT_ENTITY_TYPES.callSheet ||
      entityType === DOCUMENT_ENTITY_TYPES.movementOrder) &&
    doc.entity_id
  ) {
    const day = maps.shootDayById.get(doc.entity_id)
    groupKey = doc.entity_id
    groupTitle = day ? formatShootDayLabel(day) : 'Shoot day'
    groupSortKey = day?.shoot_date ?? doc.created_at
  } else if (
    (entityType === DOCUMENT_ENTITY_TYPES.callSheetPersonalized ||
      entityType === DOCUMENT_ENTITY_TYPES.movementOrderPersonalized) &&
    doc.entity_id
  ) {
    const person = maps.personById.get(doc.entity_id)
    contextLabel = person?.name ?? null
    groupKey = `person-${doc.entity_id}`
    groupTitle = person?.name ?? 'Recipient'
    groupSortKey = person?.name ?? doc.created_at
  } else if (entityType === DOCUMENT_ENTITY_TYPES.contributorForm && doc.entity_id) {
    const person = maps.personById.get(doc.entity_id)
    contextLabel = person?.role_name ?? null
    groupKey = doc.entity_id
    groupTitle = person?.name ?? 'Contributor'
    groupSortKey = person?.name ?? doc.created_at
  } else if (entityType === DOCUMENT_ENTITY_TYPES.locationRelease && doc.entity_id) {
    const location = maps.locationById.get(doc.entity_id)
    contextLabel = location?.address ?? null
    groupKey = doc.entity_id
    groupTitle = location?.name ?? 'Location'
    groupSortKey = location?.name ?? doc.created_at
  } else if (
    (entityType === DOCUMENT_ENTITY_TYPES.equipmentChecklistPdf ||
      entityType === DOCUMENT_ENTITY_TYPES.equipmentListCsv) &&
    doc.entity_id
  ) {
    const list = maps.equipmentListById.get(doc.entity_id)
    const day = list?.shoot_day_id ? maps.shootDayById.get(list.shoot_day_id) : undefined
    contextLabel = day ? formatShootDayLabel(day) : null
    groupKey = doc.entity_id
    groupTitle = list?.name ?? 'Equipment list'
    groupSortKey = list?.name ?? doc.created_at
  } else if (entityType === DOCUMENT_ENTITY_TYPES.doodPdf || entityType === DOCUMENT_ENTITY_TYPES.doodCsv) {
    groupKey = entityType
    groupTitle = 'Day out of days'
    groupSortKey = doc.created_at
  } else if (
    entityType === DOCUMENT_ENTITY_TYPES.budgetCsv ||
    entityType === DOCUMENT_ENTITY_TYPES.costReportPdf
  ) {
    groupKey = entityType
    groupTitle = getDocumentTypeLabel(entityType)
    groupSortKey = doc.created_at
  } else if (entityType === DOCUMENT_ENTITY_TYPES.cueSheet) {
    groupKey = 'cue-sheets'
    groupTitle = 'Cue sheets'
    groupSortKey = doc.created_at
  } else if (entityType != null && entityType.startsWith('manual_upload_')) {
    groupKey = chronologicalGroupKey(doc.created_at)
    groupTitle = chronologicalGroupTitle(doc.created_at)
    groupSortKey = doc.created_at
  } else if (entityType == null) {
    groupKey = chronologicalGroupKey(doc.created_at)
    groupTitle = chronologicalGroupTitle(doc.created_at)
    groupSortKey = doc.created_at
  }

  return {
    ...doc,
    categoryId,
    typeLabel,
    contextLabel,
    groupKey,
    groupTitle,
    groupSortKey,
  }
}

function chronologicalGroupKey(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)
  return created >= weekAgo ? 'this-week' : 'earlier'
}

function chronologicalGroupTitle(createdAt: string): string {
  return chronologicalGroupKey(createdAt) === 'this-week' ? 'This week' : 'Earlier'
}

export type DocumentGroup = {
  groupKey: string
  groupTitle: string
  groupSortKey: string
  documents: EnrichedDocument[]
}

export function groupEnrichedDocuments(docs: EnrichedDocument[]): DocumentGroup[] {
  const byKey = new Map<string, DocumentGroup>()
  for (const doc of docs) {
    const existing = byKey.get(doc.groupKey)
    if (existing) {
      existing.documents.push(doc)
    } else {
      byKey.set(doc.groupKey, {
        groupKey: doc.groupKey,
        groupTitle: doc.groupTitle,
        groupSortKey: doc.groupSortKey,
        documents: [doc],
      })
    }
  }
  const groups = Array.from(byKey.values())
  for (const group of groups) {
    group.documents.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }
  groups.sort((a, b) => {
    const aKey = a.groupSortKey
    const bKey = b.groupSortKey
    if (/^\d{4}-\d{2}-\d{2}$/.test(aKey) && /^\d{4}-\d{2}-\d{2}$/.test(bKey)) {
      return bKey.localeCompare(aKey)
    }
    return aKey.localeCompare(bKey)
  })
  return groups
}

export function partitionDocumentsByCategory(
  docs: EnrichedDocument[]
): Map<DocumentCategoryId, EnrichedDocument[]> {
  const map = new Map<DocumentCategoryId, EnrichedDocument[]>()
  for (const doc of docs) {
    const list = map.get(doc.categoryId) ?? []
    list.push(doc)
    map.set(doc.categoryId, list)
  }
  for (const [, list] of map) {
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
  return map
}
