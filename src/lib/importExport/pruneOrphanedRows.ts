/**
 * Keeps v9 rows importable: exported rows must not reference parents that were left out of the export
 * (soft-deleted, or filtered by the tombstone rules in `exportLoadProductionData`).
 *
 * Mirrors the live FK actions: a missing parent of a NOT NULL / `ON DELETE CASCADE` column drops the row;
 * a missing parent of a `SET NULL` column clears the link. Tables are visited in `APF_V1_TABLE_KEYS` order, so a
 * dropped parent cascades to its children in a single pass.
 */
import type { ApfTableRow, ApfV1Tables } from '@/lib/importExport/payload'
import { APF_V1_TABLE_KEYS, type ApfV1TableKey } from '@/lib/importExport/tableKeys'

type ParentLink = {
  column: string
  parent: ApfV1TableKey
  /** `drop` removes the row (CASCADE / NOT NULL); `null` clears the column (SET NULL). */
  onMissing: 'drop' | 'null'
}

const PARENT_LINKS: Partial<Record<ApfV1TableKey, ParentLink[]>> = {
  script_versions: [
    { column: 'episode_id', parent: 'episodes', onMissing: 'null' },
    { column: 'previous_script_version_id', parent: 'script_versions', onMissing: 'null' },
  ],
  script_pages: [
    { column: 'script_version_id', parent: 'script_versions', onMissing: 'drop' },
    { column: 'scene_id', parent: 'scenes', onMissing: 'null' },
  ],
  script_sections: [
    { column: 'script_version_id', parent: 'script_versions', onMissing: 'drop' },
    { column: 'scene_id', parent: 'scenes', onMissing: 'drop' },
    { column: 'episode_id', parent: 'episodes', onMissing: 'null' },
  ],
  script_section_ranges: [{ column: 'section_id', parent: 'script_sections', onMissing: 'drop' }],
  script_section_characters: [
    { column: 'section_id', parent: 'script_sections', onMissing: 'drop' },
    { column: 'person_id', parent: 'people', onMissing: 'null' },
  ],
  shot_script_sections: [
    { column: 'shot_id', parent: 'shots', onMissing: 'drop' },
    { column: 'script_section_id', parent: 'script_sections', onMissing: 'drop' },
  ],
  shoot_day_sides_exports: [
    { column: 'shoot_day_id', parent: 'shoot_days', onMissing: 'drop' },
    { column: 'unit_id', parent: 'units', onMissing: 'null' },
    { column: 'document_id', parent: 'documents', onMissing: 'null' },
    { column: 'script_version_id', parent: 'script_versions', onMissing: 'null' },
  ],
  slates: [
    { column: 'shoot_day_id', parent: 'shoot_days', onMissing: 'drop' },
    { column: 'unit_id', parent: 'units', onMissing: 'null' },
    { column: 'scene_id', parent: 'scenes', onMissing: 'null' },
    { column: 'shot_id', parent: 'shots', onMissing: 'null' },
  ],
  takes: [{ column: 'slate_id', parent: 'slates', onMissing: 'drop' }],
  script_supervisor_scene_progress: [
    { column: 'scene_id', parent: 'scenes', onMissing: 'drop' },
    { column: 'completed_shoot_day_id', parent: 'shoot_days', onMissing: 'null' },
  ],
  script_supervisor_day_logs: [{ column: 'shoot_day_id', parent: 'shoot_days', onMissing: 'drop' }],
  script_elements: [
    { column: 'script_version_id', parent: 'script_versions', onMissing: 'drop' },
    { column: 'scene_id', parent: 'scenes', onMissing: 'drop' },
    { column: 'script_page_id', parent: 'script_pages', onMissing: 'null' },
  ],
  tramlines: [
    { column: 'slate_id', parent: 'slates', onMissing: 'drop' },
    { column: 'script_version_id', parent: 'script_versions', onMissing: 'drop' },
    { column: 'start_element_id', parent: 'script_elements', onMissing: 'drop' },
    { column: 'end_element_id', parent: 'script_elements', onMissing: 'drop' },
    { column: 'carried_from_id', parent: 'tramlines', onMissing: 'null' },
  ],
  tramline_segments: [
    { column: 'tramline_id', parent: 'tramlines', onMissing: 'drop' },
    { column: 'element_id', parent: 'script_elements', onMissing: 'drop' },
  ],
  script_annotations: [
    { column: 'script_version_id', parent: 'script_versions', onMissing: 'drop' },
    { column: 'element_id', parent: 'script_elements', onMissing: 'drop' },
    { column: 'slate_id', parent: 'slates', onMissing: 'drop' },
    { column: 'carried_from_id', parent: 'script_annotations', onMissing: 'null' },
  ],
  script_annotation_takes: [
    { column: 'annotation_id', parent: 'script_annotations', onMissing: 'drop' },
    { column: 'take_id', parent: 'takes', onMissing: 'drop' },
  ],
  continuity_media: [
    { column: 'document_id', parent: 'documents', onMissing: 'drop' },
    { column: 'slate_id', parent: 'slates', onMissing: 'null' },
    { column: 'take_id', parent: 'takes', onMissing: 'null' },
    { column: 'scene_id', parent: 'scenes', onMissing: 'null' },
  ],
  script_revision_items: [
    { column: 'scene_id', parent: 'scenes', onMissing: 'drop' },
    { column: 'from_script_version_id', parent: 'script_versions', onMissing: 'drop' },
    { column: 'to_script_version_id', parent: 'script_versions', onMissing: 'drop' },
  ],
  breakdown_tags: [
    { column: 'element_id', parent: 'breakdown_elements', onMissing: 'drop' },
    { column: 'script_version_id', parent: 'script_versions', onMissing: 'drop' },
    { column: 'scene_id', parent: 'scenes', onMissing: 'drop' },
    { column: 'start_page_id', parent: 'script_pages', onMissing: 'drop' },
    { column: 'end_page_id', parent: 'script_pages', onMissing: 'drop' },
    { column: 'carried_from_id', parent: 'breakdown_tags', onMissing: 'null' },
  ],
  storyboard_imports: [{ column: 'scene_id', parent: 'scenes', onMissing: 'null' }],
  storyboard_images: [
    { column: 'scene_id', parent: 'scenes', onMissing: 'drop' },
    { column: 'shot_id', parent: 'shots', onMissing: 'drop' },
    { column: 'source_import_id', parent: 'storyboard_imports', onMissing: 'null' },
  ],
  // A hidden global vendor that is not part of the package has nothing to hide.
  vendor_production_exclusions: [{ column: 'vendor_id', parent: 'vendors', onMissing: 'drop' }],
  // A booking whose unit is not in the package covers the whole day instead.
  bookings: [{ column: 'shoot_day_unit_id', parent: 'shoot_day_units', onMissing: 'null' }],
  crew_hours_person_settings: [{ column: 'person_id', parent: 'people', onMissing: 'drop' }],
  crew_day_hours: [
    { column: 'shoot_day_id', parent: 'shoot_days', onMissing: 'drop' },
    { column: 'person_id', parent: 'people', onMissing: 'drop' },
  ],
  // A plan whose location was deleted is hidden in the app, so it is left out of the package.
  floor_plans: [{ column: 'location_id', parent: 'locations', onMissing: 'drop' }],
  floor_plan_setups: [
    { column: 'floor_plan_id', parent: 'floor_plans', onMissing: 'drop' },
    { column: 'scene_id', parent: 'scenes', onMissing: 'drop' },
    { column: 'shot_id', parent: 'shots', onMissing: 'drop' },
  ],
}

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && String(v) !== ''
}

/** Returns `tables` with orphaned v9 rows dropped / unlinked. Does not mutate its input. */
export function pruneOrphanedApfRows(tables: ApfV1Tables): ApfV1Tables {
  const next = { ...tables } as ApfV1Tables
  const ids = new Map<ApfV1TableKey, Set<string>>()
  const idsOf = (table: ApfV1TableKey): Set<string> => {
    let set = ids.get(table)
    if (!set) {
      set = new Set(next[table].map((r) => String(r.id)))
      ids.set(table, set)
    }
    return set
  }

  for (const table of APF_V1_TABLE_KEYS) {
    const links = PARENT_LINKS[table]
    if (!links) continue

    const kept: ApfTableRow[] = []
    for (const row of tables[table]) {
      let drop = false
      let out = row
      for (const link of links) {
        if (link.parent === table) continue
        const v = row[link.column]
        if (!hasValue(v) || idsOf(link.parent).has(String(v))) continue
        if (link.onMissing === 'drop') {
          drop = true
          break
        }
        out = { ...out, [link.column]: null }
      }
      if (!drop) kept.push(out)
    }

    // Self-links (previous version, carried-from) resolve against the rows that survived above.
    const keptIds = new Set(kept.map((r) => String(r.id)))
    const selfLinks = links.filter((l) => l.parent === table)
    next[table] = selfLinks.length
      ? kept.map((row) => {
          let out = row
          for (const link of selfLinks) {
            const v = row[link.column]
            if (hasValue(v) && !keptIds.has(String(v))) out = { ...out, [link.column]: null }
          }
          return out
        })
      : kept
    ids.delete(table)
  }
  return next
}
