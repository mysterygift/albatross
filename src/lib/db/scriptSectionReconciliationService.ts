/**
 * SB8 — Cross-version script section reconciliation.
 *
 * Compares sections between two script versions using stable fields (scene number, type, label,
 * page/eighth range, content fingerprint). Produces a typed report and supports explicit safe
 * remapping of shot links from old generated sections to matched new generated sections.
 *
 * Read-only reconciliation; remapping is a separate explicit action that never mutates old
 * sections, versions, or historical sides exports.
 */
import { executeBatch, getDb, now, runInSerializedTransaction } from './client'
import { outboxStatementForRow } from './outbox'
import { listScriptPagesByScriptVersion } from './repositories/scriptPages'
import { listRangesBySectionIds, listSectionsByScriptVersion } from './repositories/scriptSections'
import { getScriptVersionById } from './repositories/scriptVersions'
import { listScenesByProduction } from './repositories/schedule'
import {
  classifySectionPair,
  contentFingerprint,
  crossVersionSectionKey,
  rangeSignature,
} from './scriptSectionMatching'
import type { ScriptSection, ScriptSectionRange } from './types'

const LINK_TABLE = 'shot_script_sections'

type Stmt = { sql: string; bindValues: unknown[] }

export type ReconciliationSectionRef = {
  sectionId: string
  sceneNumber: string
  sectionType: string
  label: string | null
  rangeSignature: string
  isManual: boolean
  contentFingerprint: string | null
  structuralKey: string
}

export type ReconciliationSectionPair = {
  old: ReconciliationSectionRef
  new: ReconciliationSectionRef
  classification: 'exact' | 'changed'
}

export type ShotLinkRemapCandidate = {
  linkId: string
  shotId: string
  oldSectionId: string
  newSectionId: string
  reason: string
}

export type ShotLinkReviewItem = {
  linkId: string
  shotId: string
  oldSectionId: string
  reason: string
}

export type ScriptSectionReconciliationReport = {
  oldVersionId: string
  newVersionId: string
  matched: ReconciliationSectionPair[]
  changed: ReconciliationSectionPair[]
  removed: ReconciliationSectionRef[]
  added: ReconciliationSectionRef[]
  remappableShotLinks: ShotLinkRemapCandidate[]
  reviewRequiredShotLinks: ShotLinkReviewItem[]
}

type ActiveLink = {
  id: string
  shot_id: string
  script_section_id: string
}

type SectionContext = {
  section: ScriptSection
  sceneNumber: string
  range: ScriptSectionRange | undefined
  fingerprint: string | null
  ref: ReconciliationSectionRef
}

function buildSectionRef(
  section: ScriptSection,
  sceneNumber: string,
  range: ScriptSectionRange | undefined,
  fingerprint: string | null
): ReconciliationSectionRef {
  const sig = rangeSignature(range)
  return {
    sectionId: section.id,
    sceneNumber,
    sectionType: section.section_type,
    label: section.label,
    rangeSignature: sig,
    isManual: section.is_manual === 1,
    contentFingerprint: fingerprint,
    structuralKey: crossVersionSectionKey({
      sceneNumber,
      sectionType: section.section_type,
      label: section.label,
      rangeSignature: sig,
    }),
  }
}

function assertCompatibleVersions(
  oldVersion: NonNullable<Awaited<ReturnType<typeof getScriptVersionById>>>,
  newVersion: NonNullable<Awaited<ReturnType<typeof getScriptVersionById>>>
): void {
  if (oldVersion.production_id !== newVersion.production_id) {
    throw new Error('Script versions must belong to the same production.')
  }
  const oldEp = oldVersion.episode_id ?? null
  const newEp = newVersion.episode_id ?? null
  if (oldEp !== newEp) {
    throw new Error('Script versions must belong to the same episode scope.')
  }
}

async function loadSectionContexts(
  scriptVersionId: string,
  productionId: string
): Promise<SectionContext[]> {
  const sections = await listSectionsByScriptVersion(scriptVersionId)
  if (sections.length === 0) return []

  const sceneNumberById = new Map<string, string>()
  for (const scene of await listScenesByProduction(productionId)) {
    sceneNumberById.set(scene.id, scene.scene_number)
  }

  const pages = await listScriptPagesByScriptVersion(scriptVersionId)
  const contentBySceneId = new Map<string, string | null>()
  for (const page of pages) {
    if (page.scene_id) contentBySceneId.set(page.scene_id, page.content)
  }

  const rangesBySection = await listRangesBySectionIds(sections.map((s) => s.id))

  return sections.map((section) => {
    const range = rangesBySection.get(section.id)?.[0]
    const sceneNumber = sceneNumberById.get(section.scene_id) ?? '?'
    const fingerprint = contentFingerprint(contentBySceneId.get(section.scene_id) ?? null)
    return {
      section,
      sceneNumber,
      range,
      fingerprint,
      ref: buildSectionRef(section, sceneNumber, range, fingerprint),
    }
  })
}

function groupByStructuralKey(contexts: SectionContext[]): Map<string, SectionContext[]> {
  const map = new Map<string, SectionContext[]>()
  for (const ctx of contexts) {
    const list = map.get(ctx.ref.structuralKey) ?? []
    list.push(ctx)
    map.set(ctx.ref.structuralKey, list)
  }
  return map
}

export async function reconcileScriptVersions(
  oldVersionId: string,
  newVersionId: string
): Promise<ScriptSectionReconciliationReport> {
  const oldVersion = await getScriptVersionById(oldVersionId)
  const newVersion = await getScriptVersionById(newVersionId)
  if (!oldVersion) throw new Error(`Script version not found: ${oldVersionId}`)
  if (!newVersion) throw new Error(`Script version not found: ${newVersionId}`)
  assertCompatibleVersions(oldVersion, newVersion)

  const oldContexts = await loadSectionContexts(oldVersionId, oldVersion.production_id)
  const newContexts = await loadSectionContexts(newVersionId, newVersion.production_id)

  const oldByKey = groupByStructuralKey(oldContexts)
  const newByKey = groupByStructuralKey(newContexts)

  const matched: ReconciliationSectionPair[] = []
  const changed: ReconciliationSectionPair[] = []
  const matchedOldIds = new Set<string>()
  const matchedNewIds = new Set<string>()

  for (const [key, oldGroup] of oldByKey) {
    const newGroup = newByKey.get(key)
    if (!newGroup?.length) continue

    const pairCount = Math.min(oldGroup.length, newGroup.length)
    for (let i = 0; i < pairCount; i++) {
      const oldCtx = oldGroup[i]!
      const newCtx = newGroup[i]!
      const classification = classifySectionPair(oldCtx.fingerprint, newCtx.fingerprint)
      if (classification === 'no_match') continue
      const pair: ReconciliationSectionPair = {
        old: oldCtx.ref,
        new: newCtx.ref,
        classification,
      }
      if (classification === 'exact') matched.push(pair)
      else changed.push(pair)
      matchedOldIds.add(oldCtx.section.id)
      matchedNewIds.add(newCtx.section.id)
    }
  }

  const removed = oldContexts
    .filter((ctx) => !matchedOldIds.has(ctx.section.id))
    .map((ctx) => ctx.ref)
  const added = newContexts
    .filter((ctx) => !matchedNewIds.has(ctx.section.id))
    .map((ctx) => ctx.ref)

  const remappableShotLinks: ShotLinkRemapCandidate[] = []
  const reviewRequiredShotLinks: ShotLinkReviewItem[] = []

  const oldSectionIds = oldContexts.map((c) => c.section.id)
  if (oldSectionIds.length > 0) {
    const db = await getDb()
    const placeholders = oldSectionIds.map((_, i) => `$${i + 1}`).join(', ')
    const links = await db.select<ActiveLink[]>(
      `SELECT id, shot_id, script_section_id FROM ${LINK_TABLE}
       WHERE deleted_at IS NULL AND script_section_id IN (${placeholders})`,
      oldSectionIds
    )

    const exactMatchByOldId = new Map<string, ReconciliationSectionPair>()
    for (const pair of matched) {
      exactMatchByOldId.set(pair.old.sectionId, pair)
    }
    const changedByOldId = new Map<string, ReconciliationSectionPair>()
    for (const pair of changed) {
      changedByOldId.set(pair.old.sectionId, pair)
    }
    const removedIds = new Set(removed.map((r) => r.sectionId))
    const oldCtxById = new Map(oldContexts.map((c) => [c.section.id, c]))

    for (const link of links) {
      const oldCtx = oldCtxById.get(link.script_section_id)
      if (!oldCtx) continue

      const exact = exactMatchByOldId.get(link.script_section_id)
      if (
        exact &&
        !exact.old.isManual &&
        !exact.new.isManual &&
        exact.classification === 'exact'
      ) {
        remappableShotLinks.push({
          linkId: link.id,
          shotId: link.shot_id,
          oldSectionId: exact.old.sectionId,
          newSectionId: exact.new.sectionId,
          reason: 'Exact structural and content match between generated sections.',
        })
        continue
      }

      if (exact && (exact.old.isManual || exact.new.isManual)) {
        reviewRequiredShotLinks.push({
          linkId: link.id,
          shotId: link.shot_id,
          oldSectionId: link.script_section_id,
          reason: exact.old.isManual
            ? 'Manual section requires explicit review before remapping.'
            : 'Matched manual section on new version requires explicit review.',
        })
        continue
      }

      if (changedByOldId.has(link.script_section_id)) {
        reviewRequiredShotLinks.push({
          linkId: link.id,
          shotId: link.shot_id,
          oldSectionId: link.script_section_id,
          reason: 'Section content changed between revisions.',
        })
        continue
      }

      if (removedIds.has(link.script_section_id)) {
        reviewRequiredShotLinks.push({
          linkId: link.id,
          shotId: link.shot_id,
          oldSectionId: link.script_section_id,
          reason: 'Section was removed in the new script version.',
        })
        continue
      }

      reviewRequiredShotLinks.push({
        linkId: link.id,
        shotId: link.shot_id,
        oldSectionId: link.script_section_id,
        reason: 'No safe automatic remap available.',
      })
    }
  }

  return {
    oldVersionId,
    newVersionId,
    matched,
    changed,
    removed,
    added,
    remappableShotLinks,
    reviewRequiredShotLinks,
  }
}

export type ApplySafeShotLinkRemapsResult = {
  remappedCount: number
  skippedCount: number
}

export async function applySafeShotLinkRemaps(
  report: ScriptSectionReconciliationReport
): Promise<ApplySafeShotLinkRemapsResult> {
  if (report.remappableShotLinks.length === 0) {
    return { remappedCount: 0, skippedCount: 0 }
  }

  const db = await getDb()
  const ts = now()
  let remappedCount = 0
  let skippedCount = 0

  const pending: Array<{ linkId: string; shotId: string; newSectionId: string }> = []

  const linkIds = report.remappableShotLinks.map((c) => c.linkId)
  const placeholders = linkIds.map((_, i) => `$${i + 1}`).join(', ')
  const linkRows =
    linkIds.length > 0
      ? await db.select<Array<{ id: string; script_section_id: string }>>(
          `SELECT id, script_section_id FROM ${LINK_TABLE} WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          linkIds
        )
      : []
  const linkById = new Map(linkRows.map((r) => [r.id, r.script_section_id]))

  for (const candidate of report.remappableShotLinks) {
    const currentSectionId = linkById.get(candidate.linkId)
    if (currentSectionId == null || currentSectionId !== candidate.oldSectionId) {
      skippedCount++
      continue
    }
    if (currentSectionId === candidate.newSectionId) {
      skippedCount++
      continue
    }
    pending.push({
      linkId: candidate.linkId,
      shotId: candidate.shotId,
      newSectionId: candidate.newSectionId,
    })
  }

  if (pending.length === 0) {
    return { remappedCount, skippedCount }
  }

  const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
  for (const item of pending) {
    statements.push({
      sql: `UPDATE ${LINK_TABLE} SET script_section_id = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [item.newSectionId, ts, item.linkId],
    })
    statements.push(
      outboxStatementForRow({
        entity: LINK_TABLE,
        entityId: item.linkId,
        operation: 'update',
        payloadJson: JSON.stringify({
          shot_id: item.shotId,
          script_section_id: item.newSectionId,
        }),
      })
    )
    remappedCount++
  }
  statements.push({ sql: 'COMMIT', bindValues: [] })

  await runInSerializedTransaction(async () => {
    await executeBatch(db, statements)
  })

  return { remappedCount, skippedCount }
}

/** Resolve version label for display (label → colour → title → id prefix). */
export function formatScriptVersionLabel(version: {
  id: string
  version_label: string | null
  revision_colour: string | null
  title: string | null
}): string {
  return (
    version.version_label?.trim() ||
    version.revision_colour?.trim() ||
    version.title?.trim() ||
    version.id.slice(0, 8)
  )
}
