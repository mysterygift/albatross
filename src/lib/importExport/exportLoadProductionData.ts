/**
 * Load all v1 INCLUDE tables for a production with Phase 1 tombstone / parent-join rules.
 * @see docs/project-import-export-audit.md
 */
import { getDb } from '@/lib/db/client'
import type { ApfTableRow, ApfV1Tables } from '@/lib/importExport/payload'
import type { ApfV1TableKey } from '@/lib/importExport/tableKeys'
import { APF_V1_TABLE_KEYS } from '@/lib/importExport/tableKeys'
import { resolveVendorsForExport } from '@/lib/importExport/resolveVendorsForExport'

function asRows(r: Record<string, unknown>[]): ApfTableRow[] {
  return r as ApfTableRow[]
}

/**
 * Loads production-scoped rows. Order of queries is arbitrary; payload builder sorts by `id`.
 */
export async function loadApfV1ProductionTables(productionId: string): Promise<ApfV1Tables> {
  const db = await getDb()
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
    equipment,
    equipmentLists,
    equipmentListItems,
    productionTasks,
    fringeRuleScopes,
    contingencyRuleScopes,
    costReportGroupAccounts,
    productionTotalAccounts,
    documents,
    cueSheets,
    callSheets,
    scriptDocuments,
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
  ])

  const vendors = await resolveVendorsForExport(productionId)

  const raw: Record<ApfV1TableKey, ApfTableRow[]> = {
    productions: asRows(productions),
    episodes: asRows(episodeRows),
    shooting_blocs: asRows(shootingBlocRows),
    units: asRows(units),
    people: asRows(people),
    locations: asRows(locations),
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
    equipment: asRows(equipment),
    equipment_lists: asRows(equipmentLists),
    equipment_list_items: asRows(equipmentListItems),
    production_tasks: asRows(productionTasks),
    fringe_rule_scopes: asRows(fringeRuleScopes),
    contingency_rule_scopes: asRows(contingencyRuleScopes),
    cost_report_group_accounts: asRows(costReportGroupAccounts),
    production_total_accounts: asRows(productionTotalAccounts),
    documents: asRows(documents),
    cue_sheets: asRows(cueSheets),
    call_sheets: asRows(callSheets),
    script_documents: asRows(scriptDocuments),
  }

  for (const key of APF_V1_TABLE_KEYS) {
    if (!(key in raw)) {
      throw new Error(`loadApfV1ProductionTables: missing key ${key}`)
    }
  }

  return raw
}
