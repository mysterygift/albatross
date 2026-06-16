import type { LucideIcon } from 'lucide-react'
import {
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  FolderOpen,
  Megaphone,
  Music,
  Package,
  Route,
  Users,
} from 'lucide-react'

/** Canonical entity_type values stored on documents rows. */
export const DOCUMENT_ENTITY_TYPES = {
  script: 'script',
  sidesExport: 'sides_export',
  deliverable: 'deliverable',
  callSheet: 'call_sheet',
  callSheetPersonalized: 'call_sheet_personalized',
  movementOrder: 'movement_order',
  movementOrderPersonalized: 'movement_order_personalized',
  locationRelease: 'location_release',
  contributorForm: 'contributor_form',
  cueSheet: 'cue_sheet',
  budgetCsv: 'budget_csv',
  costReportPdf: 'cost_report_pdf',
  equipmentChecklistPdf: 'equipment_checklist_pdf',
  equipmentListCsv: 'equipment_list_csv',
  doodPdf: 'dood_pdf',
  doodCsv: 'dood_csv',
  /** Manual hub uploads filed under a specific category (no linked entity). */
  manualUploadSchedule: 'manual_upload_schedule',
  manualUploadSetPaperwork: 'manual_upload_set_paperwork',
  manualUploadPeopleLocations: 'manual_upload_people_locations',
  manualUploadDeliverable: 'manual_upload_deliverable',
  manualUploadMusic: 'manual_upload_music',
  manualUploadFinance: 'manual_upload_finance',
  manualUploadProductionLists: 'manual_upload_production_lists',
} as const

export type DocumentEntityType =
  | (typeof DOCUMENT_ENTITY_TYPES)[keyof typeof DOCUMENT_ENTITY_TYPES]
  | null

export type DocumentCategoryId =
  | 'general'
  | 'schedule'
  | 'set-paperwork'
  | 'people-locations'
  | 'deliverables'
  | 'music'
  | 'finance'
  | 'production-lists'

export type DocumentCategoryConfig = {
  id: DocumentCategoryId
  label: string
  description: string
  icon: LucideIcon
  sourceRoute: string
  emptyMessage: string
  entityTypes: readonly (string | null)[]
}

export const DOCUMENT_CATEGORIES: DocumentCategoryConfig[] = [
  {
    id: 'general',
    label: 'General files',
    description: 'Manual uploads and uncategorised attachments',
    icon: FolderOpen,
    sourceRoute: '/documents/general',
    emptyMessage: 'No general uploads yet. Use Upload file to attach documents to this production.',
    entityTypes: [null],
  },
  {
    id: 'schedule',
    label: 'Script & sides',
    description: 'Imported scripts and shoot-day sides exports',
    icon: Calendar,
    sourceRoute: '/schedule/script-import',
    emptyMessage: 'No scripts or sides yet. Import a script or export sides from the schedule.',
    entityTypes: [
      DOCUMENT_ENTITY_TYPES.script,
      DOCUMENT_ENTITY_TYPES.sidesExport,
      DOCUMENT_ENTITY_TYPES.manualUploadSchedule,
    ],
  },
  {
    id: 'set-paperwork',
    label: 'Set paperwork',
    description: 'Call sheets and movement orders',
    icon: Megaphone,
    sourceRoute: '/call-sheets',
    emptyMessage: 'No call sheets or movement orders yet. Generate them from Call Sheets or Movement Orders.',
    entityTypes: [
      DOCUMENT_ENTITY_TYPES.callSheet,
      DOCUMENT_ENTITY_TYPES.callSheetPersonalized,
      DOCUMENT_ENTITY_TYPES.movementOrder,
      DOCUMENT_ENTITY_TYPES.movementOrderPersonalized,
      DOCUMENT_ENTITY_TYPES.manualUploadSetPaperwork,
    ],
  },
  {
    id: 'people-locations',
    label: 'People & locations',
    description: 'Contributor forms and location releases',
    icon: Users,
    sourceRoute: '/people/cast-manager',
    emptyMessage: 'No people or location documents yet.',
    entityTypes: [
      DOCUMENT_ENTITY_TYPES.contributorForm,
      DOCUMENT_ENTITY_TYPES.locationRelease,
      DOCUMENT_ENTITY_TYPES.manualUploadPeopleLocations,
    ],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    description: 'Files attached to delivery items',
    icon: Package,
    sourceRoute: '/deliverables',
    emptyMessage: 'No deliverable attachments yet. Attach files from the Deliverables edit sheet.',
    entityTypes: [DOCUMENT_ENTITY_TYPES.deliverable, DOCUMENT_ENTITY_TYPES.manualUploadDeliverable],
  },
  {
    id: 'music',
    label: 'Music & clearance',
    description: 'Cue sheets and music clearance exports',
    icon: Music,
    sourceRoute: '/music-clearance',
    emptyMessage: 'No cue sheets yet. Generate one from Music & Archive.',
    entityTypes: [DOCUMENT_ENTITY_TYPES.cueSheet, DOCUMENT_ENTITY_TYPES.manualUploadMusic],
  },
  {
    id: 'finance',
    label: 'Budget & finance',
    description: 'Budget CSV and cost report exports',
    icon: DollarSign,
    sourceRoute: '/budget',
    emptyMessage: 'No budget exports yet. Export a CSV or cost report from Budget.',
    entityTypes: [
      DOCUMENT_ENTITY_TYPES.budgetCsv,
      DOCUMENT_ENTITY_TYPES.costReportPdf,
      DOCUMENT_ENTITY_TYPES.manualUploadFinance,
    ],
  },
  {
    id: 'production-lists',
    label: 'Production lists',
    description: 'Equipment checklists and day-out-of-days exports',
    icon: ClipboardList,
    sourceRoute: '/equipment',
    emptyMessage: 'No production list exports yet. Export from Equipment or Day Out of Days.',
    entityTypes: [
      DOCUMENT_ENTITY_TYPES.equipmentChecklistPdf,
      DOCUMENT_ENTITY_TYPES.equipmentListCsv,
      DOCUMENT_ENTITY_TYPES.doodPdf,
      DOCUMENT_ENTITY_TYPES.doodCsv,
      DOCUMENT_ENTITY_TYPES.manualUploadProductionLists,
    ],
  },
]

const CATEGORY_BY_ENTITY_TYPE = new Map<string | null, DocumentCategoryId>()
for (const category of DOCUMENT_CATEGORIES) {
  for (const entityType of category.entityTypes) {
    CATEGORY_BY_ENTITY_TYPE.set(entityType, category.id)
  }
}

export function getDocumentCategoryId(entityType: string | null): DocumentCategoryId {
  return CATEGORY_BY_ENTITY_TYPE.get(entityType) ?? 'general'
}

export function getDocumentCategory(categoryId: DocumentCategoryId): DocumentCategoryConfig {
  const category = DOCUMENT_CATEGORIES.find((c) => c.id === categoryId)
  if (!category) throw new Error(`Unknown document category: ${categoryId}`)
  return category
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  [DOCUMENT_ENTITY_TYPES.script]: 'Script',
  [DOCUMENT_ENTITY_TYPES.sidesExport]: 'Shoot-day sides',
  [DOCUMENT_ENTITY_TYPES.deliverable]: 'Deliverable attachment',
  [DOCUMENT_ENTITY_TYPES.callSheet]: 'Call sheet',
  [DOCUMENT_ENTITY_TYPES.callSheetPersonalized]: 'Personalised call sheet',
  [DOCUMENT_ENTITY_TYPES.movementOrder]: 'Movement order',
  [DOCUMENT_ENTITY_TYPES.movementOrderPersonalized]: 'Personalised movement order',
  [DOCUMENT_ENTITY_TYPES.locationRelease]: 'Location release',
  [DOCUMENT_ENTITY_TYPES.contributorForm]: 'Contributor form',
  [DOCUMENT_ENTITY_TYPES.cueSheet]: 'Cue sheet',
  [DOCUMENT_ENTITY_TYPES.budgetCsv]: 'Budget CSV',
  [DOCUMENT_ENTITY_TYPES.costReportPdf]: 'Cost report PDF',
  [DOCUMENT_ENTITY_TYPES.equipmentChecklistPdf]: 'Equipment checklist PDF',
  [DOCUMENT_ENTITY_TYPES.equipmentListCsv]: 'Equipment list CSV',
  [DOCUMENT_ENTITY_TYPES.doodPdf]: 'Day out of days PDF',
  [DOCUMENT_ENTITY_TYPES.doodCsv]: 'Day out of days CSV',
  [DOCUMENT_ENTITY_TYPES.manualUploadSchedule]: 'Uploaded file',
  [DOCUMENT_ENTITY_TYPES.manualUploadSetPaperwork]: 'Uploaded file',
  [DOCUMENT_ENTITY_TYPES.manualUploadPeopleLocations]: 'Uploaded file',
  [DOCUMENT_ENTITY_TYPES.manualUploadDeliverable]: 'Uploaded file',
  [DOCUMENT_ENTITY_TYPES.manualUploadMusic]: 'Uploaded file',
  [DOCUMENT_ENTITY_TYPES.manualUploadFinance]: 'Uploaded file',
  [DOCUMENT_ENTITY_TYPES.manualUploadProductionLists]: 'Uploaded file',
}

export function getDocumentTypeLabel(entityType: string | null): string {
  if (entityType == null) return 'General upload'
  return ENTITY_TYPE_LABELS[entityType] ?? entityType
}

export function getDocumentSourceRoute(entityType: string | null): string {
  const categoryId = getDocumentCategoryId(entityType)
  return getDocumentCategory(categoryId).sourceRoute
}

/** Slugs used in `/documents/:category` routes. */
export const DOCUMENT_CATEGORY_SLUGS = DOCUMENT_CATEGORIES.map((c) => c.id)

export function isDocumentCategorySlug(value: string): value is DocumentCategoryId {
  return DOCUMENT_CATEGORY_SLUGS.includes(value as DocumentCategoryId)
}

export const DEFAULT_DOCUMENT_ICON = FileText

export function getCategoryIcon(categoryId: DocumentCategoryId): LucideIcon {
  return getDocumentCategory(categoryId).icon
}

export function getSetPaperworkIcon(entityType: string | null): LucideIcon {
  if (
    entityType === DOCUMENT_ENTITY_TYPES.movementOrder ||
    entityType === DOCUMENT_ENTITY_TYPES.movementOrderPersonalized
  ) {
    return Route
  }
  return Megaphone
}

/** entity_type stored when a user uploads via the Documents hub into a category. */
export const MANUAL_UPLOAD_ENTITY_TYPE_BY_CATEGORY: Record<DocumentCategoryId, string | null> = {
  general: null,
  schedule: DOCUMENT_ENTITY_TYPES.manualUploadSchedule,
  'set-paperwork': DOCUMENT_ENTITY_TYPES.manualUploadSetPaperwork,
  'people-locations': DOCUMENT_ENTITY_TYPES.manualUploadPeopleLocations,
  deliverables: DOCUMENT_ENTITY_TYPES.manualUploadDeliverable,
  music: DOCUMENT_ENTITY_TYPES.manualUploadMusic,
  finance: DOCUMENT_ENTITY_TYPES.manualUploadFinance,
  'production-lists': DOCUMENT_ENTITY_TYPES.manualUploadProductionLists,
}

export function getManualUploadEntityType(categoryId: DocumentCategoryId): string | null {
  return MANUAL_UPLOAD_ENTITY_TYPE_BY_CATEGORY[categoryId]
}

/** General uploads (null) and category manual uploads can be removed from Documents. */
export function isDeletableManualUpload(entityType: string | null): boolean {
  if (entityType == null) return true
  return entityType.startsWith('manual_upload_')
}
