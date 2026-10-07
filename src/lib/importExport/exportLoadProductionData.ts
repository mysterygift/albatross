/**
 * Load all v1 INCLUDE tables for a production with Phase 1 tombstone / parent-join rules.
 * @see DOCS/import-export.md
 */
import { getDb } from '@/lib/db/client'
import type { ApfTableRow, ApfV1Tables } from '@/lib/importExport/payload'
import type { ApfV1TableKey } from '@/lib/importExport/tableKeys'
import { APF_V1_TABLE_KEYS } from '@/lib/importExport/tableKeys'
import { pruneOrphanedApfRows } from '@/lib/importExport/pruneOrphanedRows'
import { resolveVendorsForExport } from '@/lib/importExport/resolveVendorsForExport'
import { isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'
import { requireSensitiveDataAccess } from '@/lib/security/sensitiveDataAccess'
import { decryptLocationFields, decryptPersonFields } from '@/lib/security/sensitiveEntityFieldCrypto'

function asRows(r: Record<string, unknown>[]): ApfTableRow[] {
  return r as ApfTableRow[]
}

/**
 * Loads production-scoped rows. Order of queries is arbitrary; payload builder sorts by `id`.
 */
export async function loadApfV1ProductionTables(productionId: string): Promise<ApfV1Tables> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const $1 = productionId

  const [
    productions,
    episodeRows,
    shootingBlocRows,
    units,
    people,
    locations,
    shootDays,
    budgetCategories,
    budgetAccounts,
    budgetRevisions,
    keyContacts,
    checklistItems,
    equipmentTerms,
    musicTracks,
    productionTaskSections,
    deliverables,
    fringeRules,
    contingencyRules,
    productionBudgetFeatures,
    taxCreditSchemes,
    vatReclaimRates,
    costReportGroups,
    productionTotals,
    productionCrewHierarchyConfigs,
    scenes,
    shootDayUnits,
    vendorPurchaseOrders,
    bookings,
    castAvailability,
    crewAvailability,
    shots,
    locationScene,
    stripboardItems,
    stripboardStrips,
    sceneCast,
    shotCast,
    budgetItems,
    vendorInvoices,
    expenses,
    floats,
    technicalSpecs,
    clearances,
    budgetItemDetails,
    expenseTransactionDetails,
    expenseTaxCreditAllocations,
    budgetItemExpenseLinks,
    floatExpenseLinks,
    vendorInvoiceExpenses,
    vendorPurchaseOrderExpenses,
    vendorPurchaseOrderAmendments,
    equipment,
    equipmentLists,
    equipmentListItems,
    productionTasks,
    fringeRuleScopes,
    contingencyRuleScopes,
    costReportGroupAccounts,
    productionTotalAccounts,
    documents,
    expenseReceipts,
    cueSheets,
    callSheets,
    scriptDocuments,
    hazardTemplates,
    riskAssessments,
    riskAssessmentUnits,
    riskAssessmentHazards,
    scriptVersions,
    scriptPages,
    scriptSections,
    scriptSectionRanges,
    scriptSectionCharacters,
    shotScriptSections,
    shootDaySidesExports,
    scriptSupervisorSettings,
    slates,
    takes,
    scriptSupervisorSceneProgress,
    scriptSupervisorDayLogs,
    scriptElements,
    tramlines,
    tramlineSegments,
    scriptAnnotations,
    scriptAnnotationTakes,
    continuityMedia,
    scriptRevisionItems,
    breakdownElements,
    breakdownTags,
    storyboardImports,
    storyboardImages,
    vendorProductionExclusions,
    productionCrewHoursSettings,
    crewHoursPersonSettings,
    crewDayHours,
  ] = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM productions WHERE id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM episodes WHERE production_id = $1 ORDER BY sort_order ASC, id ASC`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM shooting_blocs WHERE production_id = $1 ORDER BY start_date ASC, id ASC`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM units WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM people WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM locations WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM shoot_days WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM budget_categories WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM budget_accounts WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM budget_revisions WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM key_contacts WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    // `checklist_items` was dropped in migration 0024 (replaced by `production_tasks`). The v1 JSON
    // key is retained for format stability; the slice is always empty on current schema.
    Promise.resolve([] as Record<string, unknown>[]),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM equipment_terms WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM music_tracks WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM production_task_sections WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM deliverables WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM fringe_rules WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM contingency_rules WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM production_budget_features WHERE production_id = $1`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM tax_credit_schemes WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM vat_reclaim_rates WHERE production_id = $1`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM cost_report_groups WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM production_totals WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM production_crew_hierarchy_configs WHERE production_id = $1`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM scenes WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT sdu.* FROM shoot_day_units sdu
       INNER JOIN shoot_days sd ON sd.id = sdu.shoot_day_id AND sd.production_id = $1 AND sd.deleted_at IS NULL
       WHERE sdu.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM vendor_purchase_orders WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM bookings WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM cast_availability WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM crew_availability WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT s.* FROM shots s
       INNER JOIN scenes sc ON sc.id = s.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL
       WHERE s.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT ls.* FROM location_scene ls
       INNER JOIN locations loc ON loc.id = ls.location_id AND loc.production_id = $1 AND loc.deleted_at IS NULL
       INNER JOIN scenes sc ON sc.id = ls.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL
       WHERE ls.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT si.* FROM stripboard_items si
       INNER JOIN shoot_days sd ON sd.id = si.shoot_day_id AND sd.production_id = $1 AND sd.deleted_at IS NULL
       INNER JOIN scenes sc ON sc.id = si.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL
       WHERE si.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM stripboard_strips WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM scene_cast WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM shot_cast WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM budget_items WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM vendor_invoices WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM expenses WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM floats WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT ts.* FROM technical_specs ts
       INNER JOIN deliverables d ON d.id = ts.deliverable_id AND d.production_id = $1 AND d.deleted_at IS NULL
       WHERE ts.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM clearances WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT d.* FROM budget_item_details d
       INNER JOIN budget_items bi ON bi.id = d.budget_item_id AND bi.production_id = $1 AND bi.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT etd.* FROM expense_transaction_details etd
       INNER JOIN expenses e ON e.id = etd.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT a.* FROM expense_tax_credit_allocations a
       INNER JOIN expenses e ON e.id = a.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL
       WHERE a.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT l.* FROM budget_item_expense_links l
       INNER JOIN budget_items bi ON bi.id = l.budget_item_id AND bi.production_id = $1 AND bi.deleted_at IS NULL
       INNER JOIN expenses e ON e.id = l.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL
       WHERE l.deleted_at IS NULL AND l.production_id = $1`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT l.* FROM float_expense_links l
       INNER JOIN floats f ON f.id = l.float_id AND f.production_id = $1 AND f.deleted_at IS NULL
       INNER JOIN expenses e ON e.id = l.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL
       WHERE l.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT vie.* FROM vendor_invoice_expenses vie
       INNER JOIN vendor_invoices vi ON vi.id = vie.vendor_invoice_id AND vi.production_id = $1 AND vi.deleted_at IS NULL
       INNER JOIN expenses e ON e.id = vie.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT vpe.* FROM vendor_purchase_order_expenses vpe
       INNER JOIN vendor_purchase_orders po ON po.id = vpe.vendor_purchase_order_id AND po.production_id = $1 AND po.deleted_at IS NULL
       INNER JOIN expenses e ON e.id = vpe.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT a.* FROM vendor_purchase_order_amendments a
       INNER JOIN vendor_purchase_orders po ON po.id = a.vendor_purchase_order_id AND po.production_id = $1 AND po.deleted_at IS NULL
       WHERE a.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM equipment WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM equipment_lists WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT eli.* FROM equipment_list_items eli
       INNER JOIN equipment_lists el ON el.id = eli.equipment_list_id AND el.production_id = $1 AND el.deleted_at IS NULL
       INNER JOIN equipment eq ON eq.id = eli.equipment_id AND eq.production_id = $1 AND eq.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM production_tasks WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT frs.* FROM fringe_rule_scopes frs
       INNER JOIN fringe_rules fr ON fr.id = frs.rule_id AND fr.production_id = $1 AND fr.deleted_at IS NULL
       INNER JOIN budget_accounts ba ON ba.id = frs.account_id AND ba.production_id = $1 AND ba.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT crs.* FROM contingency_rule_scopes crs
       INNER JOIN contingency_rules cr ON cr.id = crs.rule_id AND cr.production_id = $1 AND cr.deleted_at IS NULL
       INNER JOIN budget_accounts ba ON ba.id = crs.account_id AND ba.production_id = $1 AND ba.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT crga.* FROM cost_report_group_accounts crga
       INNER JOIN cost_report_groups crg ON crg.id = crga.group_id AND crg.production_id = $1 AND crg.deleted_at IS NULL
       INNER JOIN budget_accounts ba ON ba.id = crga.account_id AND ba.production_id = $1 AND ba.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT pta.* FROM production_total_accounts pta
       INNER JOIN production_totals pt ON pt.id = pta.production_total_id AND pt.production_id = $1 AND pt.deleted_at IS NULL
       INNER JOIN budget_accounts ba ON ba.id = pta.account_id AND ba.production_id = $1 AND ba.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM documents WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT r.* FROM expense_receipts r
       INNER JOIN expenses e ON e.id = r.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL
       INNER JOIN documents d ON d.id = r.document_id AND d.production_id = $1 AND d.deleted_at IS NULL
       WHERE r.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT cs.* FROM cue_sheets cs
       LEFT JOIN documents d ON d.id = cs.document_id
       WHERE cs.production_id = $1 AND cs.deleted_at IS NULL
         AND (cs.document_id IS NULL OR (d.id IS NOT NULL AND d.deleted_at IS NULL))`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT cs.* FROM call_sheets cs
       LEFT JOIN documents d ON d.id = cs.generated_document_id
       WHERE cs.production_id = $1 AND cs.deleted_at IS NULL
         AND (cs.generated_document_id IS NULL OR (d.id IS NOT NULL AND d.deleted_at IS NULL))`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT sd.* FROM script_documents sd
       LEFT JOIN documents d ON d.id = sd.document_id
       WHERE sd.production_id = $1 AND sd.deleted_at IS NULL
         AND (sd.document_id IS NULL OR (d.id IS NOT NULL AND d.deleted_at IS NULL))`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM hazard_templates WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    // Risk assessments: the exported PDF link is cleared below when its document is not exported.
    db.select<Record<string, unknown>[]>(
      `SELECT ra.* FROM risk_assessments ra
       INNER JOIN shoot_days sd ON sd.id = ra.shoot_day_id AND sd.production_id = $1 AND sd.deleted_at IS NULL
       WHERE ra.production_id = $1 AND ra.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT rau.* FROM risk_assessment_units rau
       INNER JOIN risk_assessments ra ON ra.id = rau.risk_assessment_id AND ra.production_id = $1 AND ra.deleted_at IS NULL
       INNER JOIN shoot_days sd ON sd.id = ra.shoot_day_id AND sd.deleted_at IS NULL
       INNER JOIN shoot_day_units sdu ON sdu.id = rau.shoot_day_unit_id AND sdu.deleted_at IS NULL
       WHERE rau.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT h.* FROM risk_assessment_hazards h
       INNER JOIN risk_assessments ra ON ra.id = h.risk_assessment_id AND ra.production_id = $1 AND ra.deleted_at IS NULL
       INNER JOIN shoot_days sd ON sd.id = ra.shoot_day_id AND sd.deleted_at IS NULL
       WHERE h.deleted_at IS NULL`,
      [$1]
    ),
    // v9: script sections / sides builder.
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM script_versions WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT sp.* FROM script_pages sp
       INNER JOIN script_versions sv ON sv.id = sp.script_version_id AND sv.production_id = $1 AND sv.deleted_at IS NULL
       WHERE sp.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM script_sections WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT r.* FROM script_section_ranges r
       INNER JOIN script_sections ss ON ss.id = r.section_id AND ss.production_id = $1 AND ss.deleted_at IS NULL
       WHERE r.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT c.* FROM script_section_characters c
       INNER JOIN script_sections ss ON ss.id = c.section_id AND ss.production_id = $1 AND ss.deleted_at IS NULL
       WHERE c.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT l.* FROM shot_script_sections l
       INNER JOIN shots sh ON sh.id = l.shot_id AND sh.deleted_at IS NULL
       INNER JOIN scenes sc ON sc.id = sh.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL
       WHERE l.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM shoot_day_sides_exports WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    // v9: script supervisor. Rows without `deleted_at` are keyed 1:1 to a live parent (see pruneOrphanedApfRows).
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM production_script_supervisor_settings WHERE production_id = $1`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM slates WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT t.* FROM takes t
       INNER JOIN slates sl ON sl.id = t.slate_id AND sl.production_id = $1 AND sl.deleted_at IS NULL
       WHERE t.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM script_supervisor_scene_progress WHERE production_id = $1 ORDER BY scene_id ASC`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM script_supervisor_day_logs WHERE production_id = $1 ORDER BY shoot_day_id ASC`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM script_elements WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM tramlines WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT seg.* FROM tramline_segments seg
       INNER JOIN tramlines tl ON tl.id = seg.tramline_id AND tl.production_id = $1 AND tl.deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM script_annotations WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT sat.* FROM script_annotation_takes sat
       INNER JOIN script_annotations sa ON sa.id = sat.annotation_id AND sa.production_id = $1 AND sa.deleted_at IS NULL
       ORDER BY sat.annotation_id ASC, sat.take_id ASC`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM continuity_media WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM script_revision_items WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM breakdown_elements WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM breakdown_tags WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM storyboard_imports WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM storyboard_images WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
    // No `deleted_at`: an exclusion row is removed outright when undone.
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM vendor_production_exclusions WHERE production_id = $1`,
      [$1]
    ),
    // Overtime settings rows are keyed by production (and person) with no `id` or `deleted_at`.
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM production_crew_hours_settings WHERE production_id = $1`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM crew_hours_person_settings WHERE production_id = $1`,
      [$1]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM crew_day_hours WHERE production_id = $1 AND deleted_at IS NULL`,
      [$1]
    ),
  ])

  const exportedDocumentIds = new Set(documents.map((d) => d.id as string))
  const exportedRiskAssessments = riskAssessments.map((r) => ({
    ...r,
    generated_document_id:
      r.generated_document_id != null && exportedDocumentIds.has(r.generated_document_id as string)
        ? r.generated_document_id
        : null,
  }))

  const vendors = await resolveVendorsForExport(productionId)
  const exportedPeople = encryptionEnabled ? await Promise.all(people.map(decryptPersonFields)) : people
  const exportedLocations = encryptionEnabled ? await Promise.all(locations.map(decryptLocationFields)) : locations

  const raw: Record<ApfV1TableKey, ApfTableRow[]> = {
    productions: asRows(productions),
    episodes: asRows(episodeRows),
    shooting_blocs: asRows(shootingBlocRows),
    units: asRows(units),
    people: asRows(exportedPeople),
    locations: asRows(exportedLocations),
    shoot_days: asRows(shootDays),
    budget_categories: asRows(budgetCategories),
    budget_accounts: asRows(budgetAccounts),
    budget_revisions: asRows(budgetRevisions),
    vendors,
    key_contacts: asRows(keyContacts),
    checklist_items: asRows(checklistItems),
    equipment_terms: asRows(equipmentTerms),
    music_tracks: asRows(musicTracks),
    production_task_sections: asRows(productionTaskSections),
    deliverables: asRows(deliverables),
    fringe_rules: asRows(fringeRules),
    contingency_rules: asRows(contingencyRules),
    production_budget_features: asRows(productionBudgetFeatures),
    tax_credit_schemes: asRows(taxCreditSchemes),
    vat_reclaim_rates: asRows(vatReclaimRates),
    cost_report_groups: asRows(costReportGroups),
    production_totals: asRows(productionTotals),
    production_crew_hierarchy_configs: asRows(productionCrewHierarchyConfigs),
    scenes: asRows(scenes),
    shoot_day_units: asRows(shootDayUnits),
    vendor_purchase_orders: asRows(vendorPurchaseOrders),
    bookings: asRows(bookings),
    cast_availability: asRows(castAvailability),
    crew_availability: asRows(crewAvailability),
    shots: asRows(shots),
    location_scene: asRows(locationScene),
    stripboard_items: asRows(stripboardItems),
    stripboard_strips: asRows(stripboardStrips),
    scene_cast: asRows(sceneCast),
    shot_cast: asRows(shotCast),
    budget_items: asRows(budgetItems),
    vendor_invoices: asRows(vendorInvoices),
    expenses: asRows(expenses),
    floats: asRows(floats),
    technical_specs: asRows(technicalSpecs),
    clearances: asRows(clearances),
    budget_item_details: asRows(budgetItemDetails),
    expense_transaction_details: asRows(expenseTransactionDetails),
    expense_tax_credit_allocations: asRows(expenseTaxCreditAllocations),
    budget_item_expense_links: asRows(budgetItemExpenseLinks),
    float_expense_links: asRows(floatExpenseLinks),
    vendor_invoice_expenses: asRows(vendorInvoiceExpenses),
    vendor_purchase_order_expenses: asRows(vendorPurchaseOrderExpenses),
    vendor_purchase_order_amendments: asRows(vendorPurchaseOrderAmendments),
    equipment: asRows(equipment),
    equipment_lists: asRows(equipmentLists),
    equipment_list_items: asRows(equipmentListItems),
    production_tasks: asRows(productionTasks),
    fringe_rule_scopes: asRows(fringeRuleScopes),
    contingency_rule_scopes: asRows(contingencyRuleScopes),
    cost_report_group_accounts: asRows(costReportGroupAccounts),
    production_total_accounts: asRows(productionTotalAccounts),
    documents: asRows(documents),
    expense_receipts: asRows(expenseReceipts),
    cue_sheets: asRows(cueSheets),
    call_sheets: asRows(callSheets),
    script_documents: asRows(scriptDocuments),
    hazard_templates: asRows(hazardTemplates),
    risk_assessments: asRows(exportedRiskAssessments),
    risk_assessment_units: asRows(riskAssessmentUnits),
    risk_assessment_hazards: asRows(riskAssessmentHazards),
    script_versions: asRows(scriptVersions),
    script_pages: asRows(scriptPages),
    script_sections: asRows(scriptSections),
    script_section_ranges: asRows(scriptSectionRanges),
    script_section_characters: asRows(scriptSectionCharacters),
    shot_script_sections: asRows(shotScriptSections),
    shoot_day_sides_exports: asRows(shootDaySidesExports),
    production_script_supervisor_settings: asRows(scriptSupervisorSettings),
    slates: asRows(slates),
    takes: asRows(takes),
    script_supervisor_scene_progress: asRows(scriptSupervisorSceneProgress),
    script_supervisor_day_logs: asRows(scriptSupervisorDayLogs),
    script_elements: asRows(scriptElements),
    tramlines: asRows(tramlines),
    tramline_segments: asRows(tramlineSegments),
    script_annotations: asRows(scriptAnnotations),
    script_annotation_takes: asRows(scriptAnnotationTakes),
    continuity_media: asRows(continuityMedia),
    script_revision_items: asRows(scriptRevisionItems),
    breakdown_elements: asRows(breakdownElements),
    breakdown_tags: asRows(breakdownTags),
    storyboard_imports: asRows(storyboardImports),
    storyboard_images: asRows(storyboardImages),
    vendor_production_exclusions: asRows(vendorProductionExclusions),
    production_crew_hours_settings: asRows(productionCrewHoursSettings),
    crew_hours_person_settings: asRows(crewHoursPersonSettings),
    crew_day_hours: asRows(crewDayHours),
  }

  for (const key of APF_V1_TABLE_KEYS) {
    if (!(key in raw)) {
      throw new Error(`loadApfV1ProductionTables: missing key ${key}`)
    }
  }

  return pruneOrphanedApfRows(raw)
}
