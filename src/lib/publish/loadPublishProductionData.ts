import { loadApfV1ProductionTables } from '@/lib/importExport/exportLoadProductionData'
import type { ApfTableRow } from '@/lib/importExport/payload'
import { getDb } from '@/lib/db/client'
import { PUBLISH_TABLE_ORDER } from '@/lib/publish/tableOrder'

type PublishTables = Record<string, ApfTableRow[]>

export async function loadPublishProductionData(productionId: string): Promise<PublishTables> {
  const base = await loadApfV1ProductionTables(productionId)
  const db = await getDb()
  const extra = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM budget_revisions WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM floats WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT l.* FROM float_expense_links l
       INNER JOIN floats f ON f.id = l.float_id AND f.production_id = $1 AND f.deleted_at IS NULL
       INNER JOIN expenses e ON e.id = l.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM storyboard_imports WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM storyboard_images WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    ),
  ])
  const [budgetRevisions, floats, floatExpenseLinks, storyboardImports, storyboardImages] = extra
  const tables: PublishTables = {
    ...base,
    budget_revisions: budgetRevisions as ApfTableRow[],
    floats: floats as ApfTableRow[],
    float_expense_links: floatExpenseLinks as ApfTableRow[],
    storyboard_imports: storyboardImports as ApfTableRow[],
    storyboard_images: storyboardImages as ApfTableRow[],
  }

  for (const key of PUBLISH_TABLE_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(tables, key)) {
      tables[key] = []
    }
  }
  return tables
}
