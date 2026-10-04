import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { HazardContent, HazardTemplate } from '../types'
import { normalizeHazard } from '@/lib/risk-assessments/content'

const TABLE = 'hazard_templates'

function rowToTemplate(r: Record<string, unknown>): HazardTemplate {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? '',
    risks: (r.risks as string | null) ?? '',
    outcomes: (r.outcomes as string | null) ?? '',
    control_measures: (r.control_measures as string | null) ?? '',
    at_risk_crew: Number(r.at_risk_crew ?? 0) ? 1 : 0,
    at_risk_cast: Number(r.at_risk_cast ?? 0) ? 1 : 0,
    at_risk_public: Number(r.at_risk_public ?? 0) ? 1 : 0,
    severity_before: Number(r.severity_before),
    probability_before: Number(r.probability_before),
    severity_after: Number(r.severity_after),
    probability_after: Number(r.probability_after),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listHazardTemplatesByProduction(productionId: string): Promise<HazardTemplate[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
    [productionId]
  )
  return rows.map(rowToTemplate)
}

/** Saves a hazard as a project template, keyed by trimmed name; an existing template of that name is updated. */
export async function upsertHazardTemplate(
  productionId: string,
  content: HazardContent
): Promise<HazardTemplate> {
  const n = normalizeHazard(content)
  if (!n.name) throw new Error('Hazard template name cannot be empty')
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE production_id = $1 AND name = $2`,
    [productionId, n.name]
  )
  const ts = now()
  const id = existing.length > 0 ? (existing[0]!.id as string) : uuid()
  const payload = { ...n, id, production_id: productionId }
  if (existing.length > 0) {
    await db.execute(
      `UPDATE ${TABLE} SET description = $1, risks = $2, outcomes = $3, control_measures = $4,
        at_risk_crew = $5, at_risk_cast = $6, at_risk_public = $7,
        severity_before = $8, probability_before = $9, severity_after = $10, probability_after = $11,
        updated_at = $12, deleted_at = NULL WHERE id = $13`,
      [
        n.description, n.risks, n.outcomes, n.control_measures,
        n.at_risk_crew, n.at_risk_cast, n.at_risk_public,
        n.severity_before, n.probability_before, n.severity_after, n.probability_after,
        ts, id,
      ]
    )
    await outboxPush(TABLE, id, 'update', JSON.stringify(payload))
  } else {
    await db.execute(
      `INSERT INTO ${TABLE} (id, production_id, name, description, risks, outcomes, control_measures,
        at_risk_crew, at_risk_cast, at_risk_public,
        severity_before, probability_before, severity_after, probability_after, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id, productionId, n.name, n.description, n.risks, n.outcomes, n.control_measures,
        n.at_risk_crew, n.at_risk_cast, n.at_risk_public,
        n.severity_before, n.probability_before, n.severity_after, n.probability_after,
        ts, ts,
      ]
    )
    await outboxPush(TABLE, id, 'create', JSON.stringify(payload))
  }
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToTemplate(rows[0]!)
}

export async function deleteHazardTemplate(id: string): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id])
  await outboxPush(TABLE, id, 'delete', null)
}
