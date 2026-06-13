/**
 * Demo script sections & sides seed (SB10).
 * Used when initialising Mint Heist demo (ensureDemoData / resetDemoData → runFullSeed).
 * Idempotent: skips when "Demo Script v1" already exists for the production.
 */
import { generateScriptVersionFromScenes } from '@/lib/db/scriptSectionGenerationService'
import { exportShootDaySides } from '@/lib/db/sidesExportService'
import {
  buildSidesDraftModel,
  defaultSidesFilters,
  loadSidesBuilderSource,
} from '@/lib/db/sidesBuilderService'
import {
  createSectionWithRangesAndCharacters,
  linkShotToSections,
  listSectionsByScene,
} from '@/lib/db/repositories/scriptSections'
import { listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import { listSidesExportsByShootDay } from '@/lib/db/repositories/sidesExports'
import { getGlobalShotIndex } from './demoPeopleSeed'
import { IDS } from './constants'
import type { ParsedScene } from '@/lib/script-parser'

export const DEMO_SCRIPT_VERSION_LABEL = 'Demo Script v1'

const DEMO_PARSED_SCENES: ParsedScene[] = [
  {
    scene_number: '1',
    title: 'Warehouse',
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: 12,
    start_page: '1',
    end_page: '2',
    content: 'INT. WAREHOUSE - DAY\n\nJADE picks the lock under pressure.',
    characters: ['JADE'],
  },
  {
    scene_number: '2',
    title: 'Alley',
    int_ext: 'EXT',
    day_night: 'NIGHT',
    page_eighths: 8,
    start_page: '2',
    end_page: '3',
    content: 'EXT. ALLEY - NIGHT\n\nThey sprint toward the van.',
    characters: ['JADE', 'MARCUS'],
  },
  {
    scene_number: '3',
    title: 'Vault',
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: 10,
    start_page: '3',
    end_page: '4',
    content: 'INT. VAULT - DAY\n\nThe door swings open.',
    characters: ['JADE'],
  },
]

/**
 * Seed script version, sections, shot links, and one sides export for the singleton Mint Heist demo.
 * Call after scenes, shots, and stripboard bookings exist.
 */
export async function seedDemoScriptSections(productionId: string): Promise<void> {
  if (productionId !== IDS.production) return

  const existing = await listScriptVersionsByProduction(productionId)
  if (existing.some((v) => v.version_label === DEMO_SCRIPT_VERSION_LABEL)) return

  const scenePairs = [
    { sceneId: IDS.scene(1), parsed: DEMO_PARSED_SCENES[0]! },
    { sceneId: IDS.scene(2), parsed: DEMO_PARSED_SCENES[1]! },
    { sceneId: IDS.scene(3), parsed: DEMO_PARSED_SCENES[2]! },
  ]

  const version = await generateScriptVersionFromScenes({
    productionId,
    title: 'Mint Heist Demo Script',
    versionLabel: DEMO_SCRIPT_VERSION_LABEL,
    revisionColour: 'White',
    linkToPreviousVersion: false,
    scenes: scenePairs,
  })
  if (!version) return

  await createSectionWithRangesAndCharacters({
    production_id: productionId,
    script_version_id: version.id,
    scene_id: IDS.scene(2),
    section_type: 'custom',
    label: 'Alley pickup (manual)',
    is_manual: true,
    ranges: [{ start_page: '2', start_eighth: 4, end_page: '2', end_eighth: 6 }],
    characters: [{ character_name: 'MARCUS' }],
  })

  const scene1Sections = await listSectionsByScene(IDS.scene(1))
  const scene2Sections = await listSectionsByScene(IDS.scene(2))
  const scene1SectionId = scene1Sections[0]?.id
  const scene2SectionId = scene2Sections.find((s) => s.is_manual === 1)?.id ?? scene2Sections[0]?.id

  const shotLinks: Array<{ shotId: string; sectionIds: string[] }> = []
  if (scene1SectionId) {
    shotLinks.push({
      shotId: IDS.shot(getGlobalShotIndex(1, 1)),
      sectionIds: [scene1SectionId],
    })
  }
  if (scene2SectionId) {
    shotLinks.push({
      shotId: IDS.shot(getGlobalShotIndex(2, 1)),
      sectionIds: [scene2SectionId],
    })
    shotLinks.push({
      shotId: IDS.shot(getGlobalShotIndex(2, 2)),
      sectionIds: [scene2SectionId],
    })
  }

  for (const link of shotLinks) {
    if (link.sectionIds.length > 0) {
      await linkShotToSections(link.shotId, link.sectionIds)
    }
  }

  const shootDayId = IDS.shootDay(1)
  const existingExports = await listSidesExportsByShootDay(shootDayId)
  if (existingExports.length > 0) return

  const source = await loadSidesBuilderSource(shootDayId)
  if (source.entries.length === 0) return

  const filters = defaultSidesFilters()
  const model = buildSidesDraftModel(source, filters, { overrides: {} })
  if (model.selectedSectionIds.length === 0) return

  await exportShootDaySides({
    source,
    model,
    filters,
    productionTitle: 'Mint Heist (Demo)',
    generatedAt: new Date('2026-01-15T12:00:00Z'),
  })
}
