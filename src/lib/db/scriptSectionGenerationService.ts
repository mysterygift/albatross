/**
 * SB2 — Script section generation service.
 *
 * Orchestrates creation of SB1 script data (a script version, best-effort script pages, and
 * default script sections with ranges and characters) from parsed scene records. Composes the
 * repository statement builders into a single serialized transaction per DATABASE_LAYER.md;
 * there are no per-row async database writes.
 *
 * Scope notes:
 * - Scene rows themselves are created by the caller via the existing schedule repository
 *   (which preserves the remote-server path); this service only derives SB1 data from scenes
 *   that already exist locally.
 * - Generation is local-only. For productions whose effective data source is `remote_server`
 *   the new SB1 tables have no remote endpoint yet, so generation is skipped (returns null).
 *   TODO(SB-later): add a remote runtime path for script versions/pages/sections.
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from './client'
import { outboxStatementForRow } from './outbox'
import { getEffectiveDataSourceForProduction } from './projectDataSource'
import { listCast } from './repositories/person'
import { buildCreateScriptPageStatements, listScriptPagesByScriptVersion } from './repositories/scriptPages'
import {
  buildCreateSectionWithDetailsStatements,
  buildReplaceSectionCharactersStatements,
  buildReplaceSectionRangesStatements,
  listRangesBySectionIds,
  listSectionsByScriptVersion,
  type CreateSectionWithDetailsData,
  type ScriptSectionCharacterInput,
} from './repositories/scriptSections'
import { buildCreateScriptVersionStatements, getLatestScriptVersionForScope, getScriptVersionById } from './repositories/scriptVersions'
import { getProductionById } from './repositories/production'
import { listScenesByProduction } from './repositories/schedule'
import { extractCharacterCues } from '@/lib/script-parser'
import type { ParsedScene } from '@/lib/script-parser'
import type { Person, ScriptSection, ScriptVersion } from './types'
import { rangesOverlap, sectionSignature } from './scriptSectionMatching'
import {
  splitPageIntoEighths,
  splitSceneContentFromPdfElements,
} from './scriptEighthSplitService'

type Stmt = { sql: string; bindValues: unknown[] }

const SECTIONS_TABLE = 'script_sections'
const RANGES_TABLE = 'script_section_ranges'
const CHARACTERS_TABLE = 'script_section_characters'
const LINK_TABLE = 'shot_script_sections'

/** Generated sections use the neutral whole-scene type; refinement happens in later phases. */
const GENERATED_SECTION_TYPE = 'action' as const

// ─── Character resolution ─────────────────────────────────────────────────────

/** Maps an uppercased character name (role_name) to a person_id for existing cast. */
function buildCastRoleMap(cast: Person[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const person of cast) {
    const role = person.role_name?.trim()
    if (role) map.set(role.toUpperCase(), person.id)
  }
  return map
}

function resolveCharacters(cues: string[], roleMap: Map<string, string>): ScriptSectionCharacterInput[] {
  return cues.map((cue) => ({
    person_id: roleMap.get(cue.trim().toUpperCase()) ?? null,
    character_name: cue,
  }))
}

// ─── Section statement builder (shared by import + regeneration) ──────────────

type PageUnit = {
  sceneId: string
  sceneNumber: string
  episodeId: string | null
  pageNumber: string
  content: string
  characters: string[]
}

/**
 * A planned generated section plus a stable signature used to reconcile sections across
 * regeneration. The signature intentionally combines scene + type + label; the label already
 * encodes the scene number and the page/eighth span, so equal signatures mean the section's
 * identity is unchanged and its shot links can be preserved by reusing its id.
 */
type SectionDescriptor = {
  signature: string
  data: CreateSectionWithDetailsData
}

function sectionSignatureForScene(sceneId: string, sectionType: string, label: string | null): string {
  return sectionSignature(sceneId, sectionType, label)
}

function describe(data: CreateSectionWithDetailsData): SectionDescriptor {
  return {
    signature: sectionSignatureForScene(data.scene_id, data.section_type, data.label ?? null),
    data,
  }
}

/**
 * Builds line-snapped per-eighth section descriptors for one physical script page.
 * Pure (no id assignment).
 */
function buildPageSectionDescriptors(
  productionId: string,
  scriptVersionId: string,
  unit: PageUnit,
  roleMap: Map<string, string>
): SectionDescriptor[] {
  const spans = splitPageIntoEighths(unit.content, unit.pageNumber)
  if (spans.length === 0) return []

  const characters = resolveCharacters(unit.characters, roleMap)
  return spans.map((span) =>
    describe({
      production_id: productionId,
      script_version_id: scriptVersionId,
      scene_id: unit.sceneId,
      episode_id: unit.episodeId,
      label: `Scene ${unit.sceneNumber} — Page ${unit.pageNumber}, ${span.startEighth}/8–${span.endEighth}/8`,
      section_type: GENERATED_SECTION_TYPE,
      status: 'unplanned',
      is_manual: false,
      ranges: [
        {
          start_page: unit.pageNumber,
          start_eighth: span.startEighth,
          end_page: unit.pageNumber,
          end_eighth: span.endEighth,
          start_offset: span.startOffset,
          end_offset: span.endOffset,
        },
      ],
      characters,
    })
  )
}

// ─── Import generation ────────────────────────────────────────────────────────

export type GenerateScriptVersionInput = {
  productionId: string
  episodeId?: string | null
  title?: string | null
  versionLabel?: string | null
  revisionColour?: string | null
  /** Explicit predecessor; when omitted and linkToPreviousVersion is true, resolved automatically. */
  previousVersionId?: string | null
  /** When true (default), link to the latest scoped prior version if one exists. */
  linkToPreviousVersion?: boolean
  /** Scenes already created locally, paired with their parsed source data, in script order. */
  scenes: Array<{ sceneId: string; parsed: ParsedScene }>
}

/**
 * Creates one script version, script pages (one per physical page slice), and default
 * line-snapped page/eighth sections with ranges and characters, in a single serialized transaction.
 *
 * Returns the created ScriptVersion, or null when generation is skipped (remote-server
 * productions, or no scenes provided).
 */
export async function generateScriptVersionFromScenes(
  input: GenerateScriptVersionInput
): Promise<ScriptVersion | null> {
  const { productionId, scenes } = input
  if (scenes.length === 0) return null

  // Local-only: remote-server productions have no SB1 endpoint yet (see file header TODO).
  if ((await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    return null
  }

  const prod = await getProductionById(productionId)
  if (!prod) throw new Error('Production not found')
  const episodeId = input.episodeId?.trim() ? input.episodeId.trim() : null

  let previousScriptVersionId: string | null = null
  if (input.previousVersionId !== undefined && input.previousVersionId !== null) {
    previousScriptVersionId = input.previousVersionId
  } else if (input.linkToPreviousVersion !== false) {
    const prior = await getLatestScriptVersionForScope(productionId, episodeId)
    previousScriptVersionId = prior?.id ?? null
  }

  // Read existing cast once for character resolution (read, not a write loop).
  const roleMap = buildCastRoleMap(await listCast(productionId))

  const scriptVersionId = uuid()
  const ts = now()

  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateScriptVersionStatements(scriptVersionId, ts, {
      production_id: productionId,
      episode_id: episodeId,
      title: input.title ?? null,
      version_label: input.versionLabel ?? null,
      revision_colour: input.revisionColour ?? null,
      previous_script_version_id: previousScriptVersionId,
    }),
  ]

  let pageIndex = 0
  scenes.forEach(({ sceneId, parsed }) => {
    const slices = splitSceneContentFromPdfElements(
      parsed.elements,
      parsed.content ?? '',
      parsed.start_page ?? null,
      parsed.end_page ?? null
    )

    for (const slice of slices) {
      statements.push(
        ...buildCreateScriptPageStatements(uuid(), ts, {
          script_version_id: scriptVersionId,
          scene_id: sceneId,
          page_number: slice.pageNumber,
          page_index: pageIndex++,
          content: slice.content,
          eighths: slice.eighths,
        })
      )

      const unit: PageUnit = {
        sceneId,
        sceneNumber: parsed.scene_number,
        episodeId,
        pageNumber: slice.pageNumber,
        content: slice.content,
        characters: extractCharacterCues(slice.content),
      }
      for (const descriptor of buildPageSectionDescriptors(productionId, scriptVersionId, unit, roleMap)) {
        statements.push(...buildCreateSectionWithDetailsStatements(uuid(), ts, descriptor.data))
      }
    }
  })

  statements.push({ sql: 'COMMIT', bindValues: [] })

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })

  return getScriptVersionById(scriptVersionId)
}

// ─── Regeneration ─────────────────────────────────────────────────────────────

type ActiveLink = {
  id: string
  shot_id: string
  script_section_id: string
  coverage_notes: string | null
  sort_index: number
}

/**
 * Regenerates the generated (non-manual) sections for a script version from its persisted
 * script pages. Replaces only sections with is_manual = 0; manual/custom sections and their
 * ranges/characters are never touched.
 *
 * Shot links are preserved across regeneration: generated sections are reconciled by a stable
 * signature (scene + type + label). When a new section matches an existing one its id is reused
 * (so shot_script_sections rows stay valid) and its ranges/characters are refreshed unless the
 * user edited ranges (`ranges_user_edited = 1`). Sections that no longer match are soft-deleted,
 * and any shot links on them are remapped to a replacement section in the same scene with
 * matching type and an overlapping page/eighth range; links with no replacement are soft-deleted
 * (cleaned up rather than left dangling). Links to manual sections always survive because manual
 * sections are never touched.
 *
 * Returns the script version, or null if it does not exist.
 */
export async function regenerateSectionsForScriptVersion(
  scriptVersionId: string
): Promise<ScriptVersion | null> {
  const version = await getScriptVersionById(scriptVersionId)
  if (!version) return null

  const productionId = version.production_id
  if ((await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    return version
  }

  const pages = await listScriptPagesByScriptVersion(scriptVersionId)
  const existingSections = await listSectionsByScriptVersion(scriptVersionId)
  const oldNonManual = existingSections.filter((s) => s.is_manual === 0)
  const oldNonManualIds = oldNonManual.map((s) => s.id)

  // Old non-manual sections keyed by signature (for id preservation) and their ranges (for remap).
  const oldBySignature = new Map<string, ScriptSection>()
  const oldById = new Map<string, ScriptSection>()
  for (const s of oldNonManual) {
    oldBySignature.set(sectionSignatureForScene(s.scene_id, s.section_type, s.label), s)
    oldById.set(s.id, s)
  }
  const oldRangesBySection = await listRangesBySectionIds(oldNonManualIds)

  // Active shot links on old non-manual sections, grouped by section id.
  const linksByOldSection = new Map<string, ActiveLink[]>()
  if (oldNonManualIds.length > 0) {
    const db = await getDb()
    const placeholders = oldNonManualIds.map((_, i) => `$${i + 1}`).join(', ')
    const linkRows = await db.select<ActiveLink[]>(
      `SELECT id, shot_id, script_section_id, coverage_notes, sort_index FROM ${LINK_TABLE}
       WHERE deleted_at IS NULL AND script_section_id IN (${placeholders})`,
      oldNonManualIds
    )
    for (const row of linkRows) {
      const list = linksByOldSection.get(row.script_section_id) ?? []
      list.push(row)
      linksByOldSection.set(row.script_section_id, list)
    }
  }

  // Map scene id -> scene number for labels (single read; no per-row queries).
  const sceneNumberById = new Map<string, string>()
  for (const scene of await listScenesByProduction(productionId)) {
    sceneNumberById.set(scene.id, scene.scene_number)
  }

  const roleMap = buildCastRoleMap(await listCast(productionId))
  const ts = now()

  // Build all descriptors first, then reconcile against the old sections.
  const descriptors: SectionDescriptor[] = []
  for (const page of pages) {
    if (!page.scene_id || !page.page_number) continue
    const unit: PageUnit = {
      sceneId: page.scene_id,
      sceneNumber: sceneNumberById.get(page.scene_id) ?? page.page_number ?? String(page.page_index + 1),
      episodeId: version.episode_id,
      pageNumber: page.page_number,
      content: page.content ?? '',
      characters: extractCharacterCues(page.content ?? ''),
    }
    descriptors.push(...buildPageSectionDescriptors(productionId, scriptVersionId, unit, roleMap))
  }

  type FinalSection = { id: string; descriptor: SectionDescriptor; isNew: boolean }
  const finalSections: FinalSection[] = []
  const reusedOldIds = new Set<string>()
  for (const descriptor of descriptors) {
    const old = oldBySignature.get(descriptor.signature)
    if (old && !reusedOldIds.has(old.id)) {
      reusedOldIds.add(old.id)
      finalSections.push({ id: old.id, descriptor, isNew: false })
    } else {
      finalSections.push({ id: uuid(), descriptor, isNew: true })
    }
  }

  const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]

  for (const section of finalSections) {
    if (section.isNew) {
      statements.push(...buildCreateSectionWithDetailsStatements(section.id, ts, section.descriptor.data))
    } else {
      const existing = oldById.get(section.id)
      const preserveRanges = existing?.ranges_user_edited === 1

      // Reuse the existing row (preserving its id and any user status/notes/range edits).
      statements.push({
        sql: `UPDATE ${SECTIONS_TABLE} SET updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
        bindValues: [ts, section.id],
      })
      statements.push(outboxStatementForRow({ entity: SECTIONS_TABLE, entityId: section.id, operation: 'update', payloadJson: null }))
      if (!preserveRanges) {
        statements.push(...buildReplaceSectionRangesStatements(section.id, ts, section.descriptor.data.ranges ?? []))
      }
      statements.push(
        ...buildReplaceSectionCharactersStatements(section.id, ts, section.descriptor.data.characters ?? [])
      )
    }
  }

  // Soft-delete old non-manual sections that were not reused, remapping or cleaning up their links.
  const remappedPairs = new Set<string>() // `${shot_id}|${newSectionId}` already created this run
  for (const old of oldNonManual) {
    if (reusedOldIds.has(old.id)) continue

    // Soft-delete the section + its ranges/characters.
    statements.push({
      sql: `UPDATE ${RANGES_TABLE} SET deleted_at = $1, updated_at = $2 WHERE section_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, old.id],
    })
    statements.push({
      sql: `UPDATE ${CHARACTERS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE section_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, old.id],
    })
    statements.push({
      sql: `UPDATE ${SECTIONS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, old.id],
    })
    statements.push(outboxStatementForRow({ entity: SECTIONS_TABLE, entityId: old.id, operation: 'delete', payloadJson: null }))

    const links = linksByOldSection.get(old.id) ?? []
    if (links.length === 0) continue

    // Find a replacement among the newly-inserted sections (fresh ids, so no UNIQUE conflict):
    // same scene, same type, overlapping range. Reused sections keep their own links already.
    const oldRange = oldRangesBySection.get(old.id)?.[0]
    const replacement = finalSections.find(
      (f) =>
        f.isNew &&
        f.descriptor.data.scene_id === old.scene_id &&
        f.descriptor.data.section_type === old.section_type &&
        rangesOverlap(oldRange, f.descriptor.data.ranges?.[0])
    )

    for (const link of links) {
      const pairKey = replacement ? `${link.shot_id}|${replacement.id}` : ''
      if (replacement && !remappedPairs.has(pairKey)) {
        remappedPairs.add(pairKey)
        statements.push({
          sql: `UPDATE ${LINK_TABLE} SET script_section_id = $1, updated_at = $2 WHERE id = $3`,
          bindValues: [replacement.id, ts, link.id],
        })
        statements.push(
          outboxStatementForRow({
            entity: LINK_TABLE,
            entityId: link.id,
            operation: 'update',
            payloadJson: JSON.stringify({
              shot_id: link.shot_id,
              script_section_id: replacement.id,
              coverage_notes: link.coverage_notes,
              sort_index: link.sort_index,
            }),
          })
        )
      } else {
        // No replacement (or the shot already linked to the replacement): clean up the orphan.
        statements.push({
          sql: `UPDATE ${LINK_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
          bindValues: [ts, ts, link.id],
        })
        statements.push(outboxStatementForRow({ entity: LINK_TABLE, entityId: link.id, operation: 'delete', payloadJson: null }))
      }
    }
  }

  statements.push({ sql: 'COMMIT', bindValues: [] })

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })

  return version
}
