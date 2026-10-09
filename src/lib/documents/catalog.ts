import type { LucideIcon } from 'lucide-react'
import {
  Calendar,
  ClipboardList,
  DollarSign,
  FileSignature,
  FileText,
  FolderOpen,
  Megaphone,
  Music,
  Package,
  Route,
  ShieldAlert,
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
  dailyProgressReport: 'daily_progress_report',
  continuityPhoto: 'continuity_photo',
  continuitySheets: 'continuity_sheets',
  editorsLog: 'editors_log',
  markedUpScript: 'marked_up_script',
  /** Script breakdown sheets, one page per scene (entity_id = script version id). */
  scriptBreakdownSheets: 'script_breakdown_sheets',
  /** Script breakdown department list (entity_id = script version id). */
  scriptBreakdownReport: 'script_breakdown_report',
  locationRelease: 'location_release',
  /** Location permit (entity_id = location id). */
  permit: 'permit',
  contributorForm: 'contributor_form',
  /** Contributor release signed in the app on the Release Forms page (no linked entity). */
  signedContributorRelease: 'signed_contributor_release',
  /** Location release signed in the app on the Release Forms page (no linked entity). */
  signedLocationRelease: 'signed_location_release',
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
  vendorInvoice: 'vendor_invoice',
  vendorPurchaseOrder: 'vendor_purchase_order',
  /** Receipt proof attached directly to an expense (entity_id = expense id); no vendor needed. */
  expenseReceipt: 'expense_receipt',
  /** Exported risk assessment (RAMS) PDF (entity_id = shoot day id). */
  riskAssessment: 'risk_assessment',
  /** Stripboard exported as a shooting schedule PDF (entity_id = shoot day id for one day, else null). */
  shootingSchedule: 'shooting_schedule',
  /** Shot list PDF (entity_id = scene id for one scene, else null). */
  shotList: 'shot_list',
  /** Storyboard PDF (entity_id = scene id for one scene, else null). */
  storyboardExport: 'storyboard_export',
  /** Floor plans PDF (entity_id = the shoot day, location or scene exported, else null). */
  floorPlanExport: 'floor_plan_export',
} as const

export type DocumentEntityType =
  | (typeof DOCUMENT_ENTITY_TYPES)[keyof typeof DOCUMENT_ENTITY_TYPES]
  | null

export type DocumentCategoryId =
  | 'general'
  | 'schedule'
  | 'set-paperwork'
  | 'releases'
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
    description: 'Imported scripts, script breakdowns, sides, shooting schedules, shot lists, storyboards and floor plans',
    icon: Calendar,
    sourceRoute: '/schedule/script-import',
    emptyMessage: 'No scripts or sides yet. Import a script or export sides from the schedule.',
    entityTypes: [
      DOCUMENT_ENTITY_TYPES.script,
      DOCUMENT_ENTITY_TYPES.sidesExport,
      DOCUMENT_ENTITY_TYPES.scriptBreakdownSheets,
      DOCUMENT_ENTITY_TYPES.scriptBreakdownReport,
      DOCUMENT_ENTITY_TYPES.shootingSchedule,
      DOCUMENT_ENTITY_TYPES.shotList,
      DOCUMENT_ENTITY_TYPES.storyboardExport,
      DOCUMENT_ENTITY_TYPES.floorPlanExport,
      DOCUMENT_ENTITY_TYPES.manualUploadSchedule,
    ],
  },
  {
    id: 'set-paperwork',
    label: 'Set paperwork',
    description: 'Call sheets, movement orders, risk assessments and script supervisor paperwork',
    icon: Megaphone,
    sourceRoute: '/call-sheets',
    emptyMessage:
      'No call sheets, movement orders or risk assessments yet. Generate them from Call Sheets, Movement Orders or Risk Assessments.',
    entityTypes: [
      DOCUMENT_ENTITY_TYPES.callSheet,
      DOCUMENT_ENTITY_TYPES.callSheetPersonalized,
      DOCUMENT_ENTITY_TYPES.movementOrder,
      DOCUMENT_ENTITY_TYPES.movementOrderPersonalized,
      DOCUMENT_ENTITY_TYPES.riskAssessment,
      DOCUMENT_ENTITY_TYPES.dailyProgressReport,
      DOCUMENT_ENTITY_TYPES.continuityPhoto,
      DOCUMENT_ENTITY_TYPES.continuitySheets,
      DOCUMENT_ENTITY_TYPES.editorsLog,
      DOCUMENT_ENTITY_TYPES.markedUpScript,
      DOCUMENT_ENTITY_TYPES.manualUploadSetPaperwork,
    ],
  },
  {
    id: 'releases',
    label: 'Releases',
    description: 'Signed release forms, contributor forms, location releases and permits',
    icon: FileSignature,
    sourceRoute: '/release-forms',
    emptyMessage: 'No releases yet. Sign one from Release Forms or upload a file.',
    entityTypes: [
      DOCUMENT_ENTITY_TYPES.signedContributorRelease,
      DOCUMENT_ENTITY_TYPES.signedLocationRelease,
      DOCUMENT_ENTITY_TYPES.contributorForm,
      DOCUMENT_ENTITY_TYPES.locationRelease,
      DOCUMENT_ENTITY_TYPES.permit,
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
      DOCUMENT_ENTITY_TYPES.vendorInvoice,
      DOCUMENT_ENTITY_TYPES.vendorPurchaseOrder,
      DOCUMENT_ENTITY_TYPES.expenseReceipt,
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
  [DOCUMENT_ENTITY_TYPES.dailyProgressReport]: 'Daily progress report',
  [DOCUMENT_ENTITY_TYPES.continuityPhoto]: 'Continuity photo',
  [DOCUMENT_ENTITY_TYPES.continuitySheets]: 'Continuity sheets',
  [DOCUMENT_ENTITY_TYPES.editorsLog]: "Editor's log",
  [DOCUMENT_ENTITY_TYPES.markedUpScript]: 'Marked-up script',
  [DOCUMENT_ENTITY_TYPES.locationRelease]: 'Location release',
  [DOCUMENT_ENTITY_TYPES.permit]: 'Permit',
  [DOCUMENT_ENTITY_TYPES.contributorForm]: 'Contributor form',
  [DOCUMENT_ENTITY_TYPES.signedContributorRelease]: 'Signed contributor release',
  [DOCUMENT_ENTITY_TYPES.signedLocationRelease]: 'Signed location release',
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
  [DOCUMENT_ENTITY_TYPES.vendorInvoice]: 'Vendor invoice',
  [DOCUMENT_ENTITY_TYPES.vendorPurchaseOrder]: 'Vendor purchase order',
  [DOCUMENT_ENTITY_TYPES.expenseReceipt]: 'Expense receipt',
  [DOCUMENT_ENTITY_TYPES.riskAssessment]: 'Risk assessment',
  [DOCUMENT_ENTITY_TYPES.shootingSchedule]: 'Shooting schedule',
  [DOCUMENT_ENTITY_TYPES.shotList]: 'Shot list',
  [DOCUMENT_ENTITY_TYPES.storyboardExport]: 'Storyboard',
  [DOCUMENT_ENTITY_TYPES.floorPlanExport]: 'Floor plans',
}

export function getDocumentTypeLabel(entityType: string | null): string {
  if (entityType == null) return 'General upload'
  return ENTITY_TYPE_LABELS[entityType] ?? entityType
}

export function getDocumentSourceRoute(entityType: string | null): string {
  if (entityType === DOCUMENT_ENTITY_TYPES.locationRelease || entityType === DOCUMENT_ENTITY_TYPES.permit) {
    return '/locations'
  }
  if (entityType === DOCUMENT_ENTITY_TYPES.riskAssessment) return '/risk-assessments'
  if (entityType === DOCUMENT_ENTITY_TYPES.shootingSchedule) return '/schedule/stripboard'
  if (entityType === DOCUMENT_ENTITY_TYPES.shotList) return '/schedule/shots'
  if (entityType === DOCUMENT_ENTITY_TYPES.storyboardExport) return '/schedule/storyboard'
  if (entityType === DOCUMENT_ENTITY_TYPES.floorPlanExport) return '/schedule/floor-plans'
  if (entityType === DOCUMENT_ENTITY_TYPES.contributorForm) return '/people/cast-manager'
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
  if (entityType === DOCUMENT_ENTITY_TYPES.riskAssessment) return ShieldAlert
  return Megaphone
}

/** entity_type stored when a user uploads via the Documents hub into a category. */
export const MANUAL_UPLOAD_ENTITY_TYPE_BY_CATEGORY: Record<DocumentCategoryId, string | null> = {
  general: null,
  schedule: DOCUMENT_ENTITY_TYPES.manualUploadSchedule,
  'set-paperwork': DOCUMENT_ENTITY_TYPES.manualUploadSetPaperwork,
  releases: DOCUMENT_ENTITY_TYPES.manualUploadPeopleLocations,
  deliverables: DOCUMENT_ENTITY_TYPES.manualUploadDeliverable,
  music: DOCUMENT_ENTITY_TYPES.manualUploadMusic,
  finance: DOCUMENT_ENTITY_TYPES.manualUploadFinance,
  'production-lists': DOCUMENT_ENTITY_TYPES.manualUploadProductionLists,
}

export function getManualUploadEntityType(categoryId: DocumentCategoryId): string | null {
  return MANUAL_UPLOAD_ENTITY_TYPE_BY_CATEGORY[categoryId]
}

/** Categories where every document, including generated exports, can be removed from Documents. */
const FULLY_DELETABLE_CATEGORY_IDS: readonly DocumentCategoryId[] = [
  'general',
  'finance',
  'music',
  'set-paperwork',
]

/** Generated document types that can be removed even though their category is not fully deletable. */
const DELETABLE_ENTITY_TYPES: readonly string[] = [
  DOCUMENT_ENTITY_TYPES.signedContributorRelease,
  DOCUMENT_ENTITY_TYPES.signedLocationRelease,
  // Snapshot exports with nothing linking to them.
  DOCUMENT_ENTITY_TYPES.shootingSchedule,
  DOCUMENT_ENTITY_TYPES.shotList,
  DOCUMENT_ENTITY_TYPES.storyboardExport,
  DOCUMENT_ENTITY_TYPES.floorPlanExport,
]

/**
 * Whether a document can be permanently deleted from Documents: general uploads (null), manual
 * uploads in any category, signed releases, and every document type in the categories above.
 */
export function isDeletableDocument(entityType: string | null): boolean {
  if (entityType == null) return true
  if (entityType.startsWith('manual_upload_')) return true
  if (DELETABLE_ENTITY_TYPES.includes(entityType)) return true
  return FULLY_DELETABLE_CATEGORY_IDS.some((id) =>
    getDocumentCategory(id).entityTypes.includes(entityType)
  )
}
