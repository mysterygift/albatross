import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'

import { setDbAdapterForTests } from '@/lib/db/client'
import { createProduction } from '@/lib/db/repositories/production'
import { createBudgetCategory, createBudgetItem, createExpense, listBudgetItemsByProduction } from '@/lib/db/repositories/budget'
import { createAccount } from '@/lib/db/repositories/budgetAccounts'
import { getOrCreateLiveBudgetRevisionIdForProduction, listBudgetRevisionsByProduction } from '@/lib/db/repositories/budgetRevisions'
import { createFringeRule, listFringeRules, setFringeRuleEnabled } from '@/lib/db/repositories/budgetDerived'
import { createProductionTotal, listProductionTotals } from '@/lib/db/repositories/productionTotals'
import { createCostReportGroup, listCostReportGroups } from '@/lib/db/repositories/costReportGroups'
import { createBudgetItemExpenseLink, listBudgetItemExpenseLinksForExpense } from '@/lib/db/repositories/budgetReconciliation'
import { createFloat } from '@/lib/db/repositories/floats'
import { createFloatExpenseLinks, listFloatExpenseLinksByProduction } from '@/lib/db/repositories/floatReconciliation'
import { createDocument, deleteDocument, getDocumentById, listDocumentsByProduction } from '@/lib/db/repositories/document'
import { createEquipment, updateEquipment } from '@/lib/db/repositories/equipment'
import { addEquipmentItemToList, createEquipmentList, listEquipmentListItems, updateEquipmentListItem } from '@/lib/db/repositories/equipmentLists'
import { listEquipmentTermsByProductionAndType, upsertEquipmentTerm } from '@/lib/db/repositories/equipment-terms'
import { createVendor, listVendors } from '@/lib/db/repositories/vendors'
import { createVendorInvoice } from '@/lib/db/repositories/vendorInvoices'
import { createVendorPurchaseOrder } from '@/lib/db/repositories/vendorPurchaseOrders'
import {
  getProductionBudgetFeatures,
  listTaxCreditSchemes,
  setTaxCreditsEnabled,
} from '@/lib/db/repositories/taxCredits'
import { seedAvecTaxCreditSchemes } from '@/lib/db/taxCreditSeedService'
import { createVendorInvoiceExpenseLink, listExpenseLinksByInvoice } from '@/lib/db/repositories/vendorFinanceLinks'
import { createTask, getTaskByVendorInvoiceId, updateTask } from '@/lib/db/repositories/tasks'
import { createTaskTemplate, createTaskTemplateItem, applyTaskTemplateToProduction, getTaskTemplateWithItems } from '@/lib/db/repositories/taskTemplates'
import { createDeliverable, listDeliverablesByProduction } from '@/lib/db/repositories/deliverable'
import {
  applyDeliverableTemplateToProduction,
  createDeliverableTemplate,
  createDeliverableTemplateItem,
  getDeliverableTemplateWithItems,
} from '@/lib/db/repositories/deliverableTemplates'
import { createMusicTrack, createClearance, listMusicTracksByProduction, updateMusicTrack } from '@/lib/db/repositories/music-clearance'
import {
  applyAthenaImportToStoryboard,
  createStoryboardImage,
  createStoryboardImport,
  getPrimaryStoryboardImageForShot,
  getStoryboardBundleForShotList,
  getStoryboardImagesForScene,
} from '@/lib/db/repositories/storyboard'
import { createScene, createShot } from '@/lib/db/repositories/schedule'
import { createPostgresRepoHarness } from '@/test/postgres/postgresRepositoryHarness'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => undefined),
  writeTextFile: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}))

describe('postgres financial/operational/asset-heavy module validation', () => {
  let connectionError: string | null = null

  beforeAll(async () => {
    const client = new Client(await resolvePostgresTestConfig())
    try {
      await client.connect()
    } catch (error) {
      connectionError = error instanceof Error ? error.message : String(error)
    } finally {
      await client.end().catch(() => undefined)
    }
  })

  afterEach(() => {
    setDbAdapterForTests(null)
  })

  it('validates budget precision, revision scoping, live invariant, and reconciliation paths', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 5B assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_5b_budget')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Budget PG', notes: null }, { skipBudgetSeed: true })
      const category = await createBudgetCategory({ production_id: production.id, code: 'ATL', name: 'ATL' })
      const header = await createAccount({
        production_id: production.id,
        code: '1000',
        name: 'Header',
        is_postable: false,
      })
      const postable = await createAccount({
        production_id: production.id,
        code: '1001',
        name: 'Leaf',
        parent_account_id: header.id,
        is_postable: true,
      })

      const item = await createBudgetItem({
        production_id: production.id,
        category_id: category.id,
        account_id: postable.id,
        description: 'Camera rental',
        estimated_cost: 1234.56,
      })
      const expense = await createExpense({
        production_id: production.id,
        category_id: category.id,
        account_id: postable.id,
        amount: 200.12,
        date: '2026-02-10',
      })
      await createBudgetItemExpenseLink({
        productionId: production.id,
        budgetItemId: item.id,
        expenseId: expense.id,
        matchedAmount: 20.12,
      })
      const links = await listBudgetItemExpenseLinksForExpense(expense.id)
      expect(links).toHaveLength(1)
      expect(links[0]!.matched_amount).toBeCloseTo(20.12, 6)

      const liveRevisionId = await getOrCreateLiveBudgetRevisionIdForProduction(production.id)
      const revisions = await listBudgetRevisionsByProduction(production.id)
      expect(revisions.filter((r) => r.is_live)).toHaveLength(1)
      expect(revisions[0]!.id).toBe(liveRevisionId)

      await expect(
        harness.adapter.execute(
          `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, approval, created_at, updated_at)
           VALUES ($1, $2, $3, NULL, TRUE, 'unapproved', $4, $4)`,
          ['bbbbbbbb-0000-4000-8000-000000000001', production.id, 'Invalid second live', new Date().toISOString()]
        )
      ).rejects.toThrow()

      const fringe = await createFringeRule({
        production_id: production.id,
        name: 'Payroll Fringes',
        rate: 0.2,
        base_kind: 'budget',
        scope_mode: 'include_subtrees',
        scope_account_ids: [header.id],
      })
      await setFringeRuleEnabled(fringe.id, false)
      const fringeRows = await listFringeRules(production.id)
      expect(fringeRows[0]!.is_enabled).toBe(false)

      await createProductionTotal({
        production_id: production.id,
        name: 'Above The Line Total',
        account_ids: [header.id],
      })
      const totals = await listProductionTotals(production.id)
      expect(totals).toHaveLength(1)

      await createCostReportGroup({
        production_id: production.id,
        name: 'ATL Report',
        accountIds: [header.id],
      })
      const groups = await listCostReportGroups(production.id)
      expect(groups).toHaveLength(1)
      expect(groups[0]!.accountCount).toBe(1)

      await createFloat({
        production_id: production.id,
        budget_item_id: item.id,
        person_id: 'cccccccc-0000-4000-8000-000000000001',
        amount: 50.5,
        currency: 'USD',
        issued_date: '2026-02-11',
      })
      const floatRows = await harness.adapter.select<Array<{ id: string }>>(
        'SELECT id FROM floats WHERE production_id = $1 ORDER BY created_at ASC LIMIT 1',
        [production.id]
      )
      await createFloatExpenseLinks({
        productionId: production.id,
        floatId: floatRows[0]!.id,
        allocations: [{ expenseId: expense.id, matchedAmount: 10.1 }],
      })
      const floatLinks = await listFloatExpenseLinksByProduction(production.id)
      expect(floatLinks).toHaveLength(1)
      expect(floatLinks[0]!.matched_amount).toBeCloseTo(10.1, 6)

      const secondRevisionId = 'bbbbbbbb-0000-4000-8000-000000000010'
      const ts = new Date().toISOString()
      await harness.adapter.execute(
        `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, approval, created_at, updated_at)
         VALUES ($1, $2, $3, $4, FALSE, 'unapproved', $5, $5)`,
        [secondRevisionId, production.id, 'Alt revision', liveRevisionId, ts]
      )
      await createBudgetItem({
        production_id: production.id,
        revision_id: secondRevisionId,
        category_id: category.id,
        account_id: postable.id,
        description: 'Rev2 only',
        estimated_cost: 99.99,
      })
      const liveItems = await listBudgetItemsByProduction(production.id, { revisionId: liveRevisionId })
      const altItems = await listBudgetItemsByProduction(production.id, { revisionId: secondRevisionId })
      expect(liveItems.some((r) => r.description === 'Rev2 only')).toBe(false)
      expect(altItems.some((r) => r.description === 'Rev2 only')).toBe(true)
    } finally {
      await harness.close()
    }
  })

  it('validates documents metadata CRUD and production scoping', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 5B assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_5b_docs')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Docs PG', notes: null }, { skipBudgetSeed: true })
      const doc = await createDocument({
        production_id: production.id,
        file_name: 'schedule.pdf',
        file_path: 'server-assets/productions/docs/schedule.pdf',
        mime_type: 'application/pdf',
      })
      expect(doc.file_path.startsWith('server-assets/')).toBe(true)
      const listed = await listDocumentsByProduction(production.id)
      expect(listed.map((d) => d.id)).toContain(doc.id)
      await deleteDocument(doc.id)
      expect(await getDocumentById(doc.id)).toBeNull()
    } finally {
      await harness.close()
    }
  })

  it('validates equipment registry/list/terms workflows', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 5B assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_5b_equipment')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Equipment PG', notes: null }, { skipBudgetSeed: true })
      const equipment = await createEquipment({
        production_id: production.id,
        name: 'A Camera',
        replacement_value: 9999.95,
        quantity: 2,
      })
      const updated = await updateEquipment(equipment.id, { replacement_value: 10000.01, quantity: 3 })
      expect(updated.replacement_value).toBeCloseTo(10000.01, 6)
      expect(updated.quantity).toBe(3)

      const list = await createEquipmentList({ production_id: production.id, name: 'Day 1 list' })
      const defaultItem = await addEquipmentItemToList({
        equipment_list_id: list.id,
        equipment_id: equipment.id,
        sort_order: 0,
      })
      expect(defaultItem.quantity).toBe(1)

      const qtyItem = await addEquipmentItemToList({
        equipment_list_id: list.id,
        equipment_id: (await createEquipment({
          production_id: production.id,
          name: 'Spare lens',
          replacement_value: 100,
          quantity: 5,
        })).id,
        sort_order: 1,
        quantity: 3,
      })
      expect(qtyItem.quantity).toBe(3)

      const updatedQty = await updateEquipmentListItem(qtyItem.id, { quantity: 4 })
      expect(updatedQty.quantity).toBe(4)

      const items = await listEquipmentListItems(list.id)
      expect(items).toHaveLength(2)
      expect(items[0]!.checked_out).toBe(0)
      expect(items[0]!.checked_back_in).toBe(0)

      await upsertEquipmentTerm(production.id, 'vendor', 'Panavision')
      const terms = await listEquipmentTermsByProductionAndType(production.id, 'vendor')
      expect(terms.map((t) => t.value)).toContain('Panavision')
    } finally {
      await harness.close()
    }
  })

  it('validates vendors, invoices, purchase orders, and finance links', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 5B assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_5b_vendors')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Vendors PG', notes: null }, { skipBudgetSeed: true })
      const vendor = await createVendor({
        production_id: production.id,
        company_name: 'Vendor One',
      })
      expect((await listVendors(production.id)).map((v) => v.id)).toContain(vendor.id)

      const po = await createVendorPurchaseOrder({
        production_id: production.id,
        vendor_id: vendor.id,
        po_number: 'PO-100',
        amount: 1000.25,
        approval: 1,
      })
      expect(po.amount).toBeCloseTo(1000.25, 6)
      expect(po.approval).toBe(1)

      const invoice = await createVendorInvoice({
        production_id: production.id,
        vendor_id: vendor.id,
        po_id: po.id,
        invoice_number: 'INV-100',
        amount: 250.75,
        tax: 50.05,
      })
      expect(invoice.amount).toBeCloseTo(250.75, 6)
      expect(invoice.tax).toBeCloseTo(50.05, 6)

      const expense = await createExpense({
        production_id: production.id,
        amount: 250.75,
        date: '2026-01-02',
        vendor_id: vendor.id,
      })
      await createVendorInvoiceExpenseLink(invoice.id, expense.id)
      const invoiceLinks = await listExpenseLinksByInvoice(invoice.id)
      expect(invoiceLinks).toHaveLength(1)
    } finally {
      await harness.close()
    }
  })

  it('validates tasks and task templates flows', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 5B assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_5b_tasks')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Tasks PG', notes: null }, { skipBudgetSeed: true })
      const vendor = await createVendor({ production_id: production.id, company_name: 'Task Vendor' })
      const invoice = await createVendorInvoice({
        production_id: production.id,
        vendor_id: vendor.id,
        invoice_number: 'INV-TASK',
      })
      const task = await createTask({
        production_id: production.id,
        description: 'Approve invoice',
        is_complete: 0,
        due_date: '2026-06-01',
        vendor_invoice_id: invoice.id,
      })
      const updated = await updateTask(task.id, { is_complete: 1 })
      expect(updated.is_complete).toBe(1)
      expect((await getTaskByVendorInvoiceId(invoice.id))?.id).toBe(task.id)

      const template = await createTaskTemplate({ name: 'Default task template' })
      await createTaskTemplateItem({
        task_template_id: template.id,
        description: 'Template task',
        due_offset_days: 2,
        sort_order: 0,
      })
      const withItems = await getTaskTemplateWithItems(template.id)
      expect(withItems.items).toHaveLength(1)

      await applyTaskTemplateToProduction({
        productionId: production.id,
        taskTemplateId: template.id,
        anchorDate: '2026-06-10',
      })
      const createdTasks = await harness.adapter.select<Array<{ n: number }>>(
        'SELECT COUNT(*)::int AS n FROM production_tasks WHERE production_id = $1 AND deleted_at IS NULL',
        [production.id]
      )
      expect(createdTasks[0]!.n).toBeGreaterThanOrEqual(2)
    } finally {
      await harness.close()
    }
  })

  it('validates deliverables and templates including project-wide and episodic scope', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 5B assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_5b_deliverables')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction(
        { name: 'Deliverables PG', notes: null },
        { skipBudgetSeed: true, episodicInitialEpisodeName: 'Episode 1' }
      )
      const episodeRows = await harness.adapter.select<Array<{ id: string }>>(
        'SELECT id FROM episodes WHERE production_id = $1 ORDER BY sort_order LIMIT 1',
        [production.id]
      )
      const episodeId = episodeRows[0]!.id

      await createDeliverable({
        production_id: production.id,
        name: 'Project-wide deliverable',
        due_date: '2026-07-01',
      })
      await createDeliverable({
        production_id: production.id,
        episode_id: episodeId,
        name: 'Episode deliverable',
      })
      expect((await listDeliverablesByProduction(production.id, { filter: 'project_wide' })).length).toBe(1)
      expect(
        (await listDeliverablesByProduction(production.id, { filter: 'episode', episodeId })).length
      ).toBe(1)

      const template = await createDeliverableTemplate({ name: 'Distro template' })
      await createDeliverableTemplateItem({
        deliverable_template_id: template.id,
        name: 'Template render',
        sort_order: 0,
        default_status: 'in_progress',
      })
      const withItems = await getDeliverableTemplateWithItems(template.id)
      expect(withItems.items).toHaveLength(1)
      await applyDeliverableTemplateToProduction({
        productionId: production.id,
        templateId: template.id,
        anchorDate: '2026-07-10',
        episodeId: episodeId,
      })
      const deliverableCount = await harness.adapter.select<Array<{ n: number }>>(
        'SELECT COUNT(*)::int AS n FROM deliverables WHERE production_id = $1 AND deleted_at IS NULL',
        [production.id]
      )
      expect(deliverableCount[0]!.n).toBeGreaterThanOrEqual(3)
    } finally {
      await harness.close()
    }
  })

  it('validates music/archive and clearances with episodic scope behavior', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 5B assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_5b_music')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction(
        { name: 'Music PG', notes: null },
        { skipBudgetSeed: true, episodicInitialEpisodeName: 'Episode 1' }
      )
      const episodeRows = await harness.adapter.select<Array<{ id: string }>>(
        'SELECT id FROM episodes WHERE production_id = $1 ORDER BY sort_order LIMIT 1',
        [production.id]
      )
      const episodeId = episodeRows[0]!.id

      const track = await createMusicTrack({
        production_id: production.id,
        title: 'Theme',
        episode_id: episodeId,
      })
      await updateMusicTrack(track.id, { episode_id: null })
      const projectWide = await listMusicTracksByProduction(production.id, { filter: 'project_wide' })
      expect(projectWide.some((t) => t.id === track.id)).toBe(true)

      const clearance = await createClearance({
        production_id: production.id,
        type: 'music',
        item_id: track.id,
        status: 'pending',
        requested_at: '2026-08-01',
      })
      expect(clearance.status).toBe('pending')
      expect(clearance.requested_at).toBe('2026-08-01')
    } finally {
      await harness.close()
    }
  })

  it('validates storyboard CRUD, ordering, bundle reads, and athena import metadata', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 5B assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_5b_storyboards')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Storyboard PG', notes: null }, { skipBudgetSeed: true })
      const scene = await createScene({ production_id: production.id, scene_number: '1' })
      const shot = await createShot({ scene_id: scene.id, shot_number: '1' })

      const imgA = await createStoryboardImage({
        production_id: production.id,
        scene_id: scene.id,
        shot_id: shot.shot.id,
        storage_key: 'server-assets/productions/test/a.png',
        original_filename: 'a.png',
        mime_type: 'image/png',
        sort_order: 1,
        source_type: 'manual',
      })
      const imgB = await createStoryboardImage({
        production_id: production.id,
        scene_id: scene.id,
        shot_id: shot.shot.id,
        storage_key: 'server-assets/productions/test/b.png',
        original_filename: 'b.png',
        mime_type: 'image/png',
        sort_order: 0,
        source_type: 'manual',
      })
      const primary = await getPrimaryStoryboardImageForShot(shot.shot.id)
      expect(primary?.id).toBe(imgB.id)
      const byScene = await getStoryboardImagesForScene(scene.id)
      expect(byScene.get(shot.shot.id)?.length).toBe(2)
      const bundle = await getStoryboardBundleForShotList(production.id)
      expect(bundle.find((b) => b.shot_id === shot.shot.id)?.images.length).toBe(2)

      const importRow = await createStoryboardImport({
        production_id: production.id,
        scene_id: scene.id,
        source_filename: 'athena.pdf',
        source_type: 'athena_pdf_import',
        status: 'pending',
        metadata_json: JSON.stringify({ source: 'athena' }),
      })
      const applied = await applyAthenaImportToStoryboard({
        production_id: production.id,
        source_import_id: importRow.id,
        items: [
          {
            candidate_id: 'cand-1',
            shot_id: shot.shot.id,
            scene_id: scene.id,
            storage_key: 'server-assets/productions/test/import-1.png',
            original_filename: 'import-1.png',
            mime_type: 'image/png',
            conflict_policy: 'add',
          },
        ],
      })
      expect(applied.appliedCount).toBe(1)

      const importedRows = await harness.adapter.select<Array<{ source_import_id: string | null }>>(
        'SELECT source_import_id FROM storyboard_images WHERE id != $1 AND shot_id = $2 ORDER BY created_at DESC LIMIT 1',
        [imgA.id, shot.shot.id]
      )
      expect(importedRows[0]!.source_import_id).toBe(importRow.id)
    } finally {
      await harness.close()
    }
  })

  it('persists tax credit schemes and feature toggles per production', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL tax credit assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_tax_credits')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Tax Credits PG', notes: null }, { skipBudgetSeed: true })
      await seedAvecTaxCreditSchemes(production.id)
      const schemes = await listTaxCreditSchemes(production.id)
      expect(schemes.length).toBe(4)

      await setTaxCreditsEnabled(production.id, true)
      let features = await getProductionBudgetFeatures(production.id)
      expect(features.tax_credits_enabled).toBe(true)

      await setTaxCreditsEnabled(production.id, false)
      features = await getProductionBudgetFeatures(production.id)
      expect(features.tax_credits_enabled).toBe(false)
      expect((await listTaxCreditSchemes(production.id)).length).toBe(4)
    } finally {
      await harness.close()
    }
  })
})
