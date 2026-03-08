/**
 * Repository for production-scoped crew hierarchy config.
 * Not yet connected to runtime consumers (Crew Manager, CrewForm, task integration, call sheets).
 */

import { getDb, now, uuid } from '../client'
import type { CrewHierarchyConfig } from '@/lib/people/crewHierarchyTypes'
import { buildDefaultCrewHierarchyConfig } from '@/lib/people/defaultCrewHierarchy'

const TABLE = 'production_crew_hierarchy_configs'

function parseConfigJson(json: string): CrewHierarchyConfig {
  try {
    const parsed = JSON.parse(json) as unknown
    if (
      parsed != null &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      typeof (parsed as CrewHierarchyConfig).version === 'number' &&
      Array.isArray((parsed as CrewHierarchyConfig).departments)
    ) {
      return parsed as CrewHierarchyConfig
    }
    throw new Error('Invalid crew hierarchy config shape')
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('Invalid crew hierarchy config JSON')
    throw e
  }
}

/**
 * Returns the parsed crew hierarchy config for the production, or null if none exists.
 */
export async function getCrewHierarchyConfigByProduction(
  productionId: string
): Promise<CrewHierarchyConfig | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT config_json FROM ${TABLE} WHERE production_id = $1`,
    [productionId]
  )
  if (rows.length === 0) return null
  const configJson = rows[0]!.config_json as string
  return parseConfigJson(configJson)
}

/**
 * Inserts a new config row or updates the existing one for the production.
 */
export async function upsertCrewHierarchyConfig(
  productionId: string,
  config: CrewHierarchyConfig
): Promise<void> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const configJson = JSON.stringify(config)
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, config_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (production_id) DO UPDATE SET
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`,
    [id, productionId, configJson, ts, ts]
  )
}

/**
 * Replaces the production's config with the default hierarchy (canonical departments/roles/HOD/task mapping).
 */
export async function resetCrewHierarchyConfigToDefault(productionId: string): Promise<void> {
  const config = buildDefaultCrewHierarchyConfig()
  await upsertCrewHierarchyConfig(productionId, config)
}
