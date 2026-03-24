/**
 * Shared helpers for EP10 episodic workflow integration tests.
 *
 * Suite coverage (rendered / PDF-level where noted):
 * - Irreversible episodic initialization (wizard + settings enable dialog).
 * - Episode list order and archived episode handling in shot-list scene create/edit.
 * - Schedule: day-level shooting bloc vs material-level episode labels (stripboard).
 * - Call sheets: Include episodes setting (RTL); PDF masthead bloc, EP column vs SC/SH, mixed rows.
 * - Music & Archive + Deliverables: project-wide vs episode scope, filters, non-episodic gates.
 * - Non-episodic regression shield across representative surfaces.
 * - Edge cases: outside-bloc label, sparse schedule PDF, archived scene episode readability.
 */
import { QueryClient } from '@tanstack/react-query'
import type { CallSheetData } from '@/lib/pdf/callSheet'

export function episodicIntegrationQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

/** Best-effort text extraction for assertions on pdf-lib output (schedule headers, masthead, row labels). */
export async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  if (typeof (globalThis as unknown as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
    ;(globalThis as unknown as { DOMMatrix: new () => unknown }).DOMMatrix = class {}
  }
  const { getDocument } = await import('pdfjs-dist')
  const loadingTask = getDocument({
    data: pdfBytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (item && typeof item === 'object' && 'str' in item && typeof item.str === 'string') {
        parts.push(item.str)
      }
    }
  }
  return parts.join(' ')
}

export function minimalCallSheetDataForEpisodicPdfTest(over: Partial<CallSheetData> = {}): CallSheetData {
  const base: CallSheetData = {
    productionName: 'Integration Prod',
    shootDate: '2025-06-15',
    unitName: 'Main Unit',
    dayNumber: 1,
    callTime: null,
    wrapTime: null,
    dayNotes: null,
    unitNotes: null,
    keyContacts: [],
    hospitalName: null,
    hospitalAddress: null,
    policeStationName: null,
    policeStationAddress: null,
    weatherSummary: null,
    weatherSunrise: null,
    weatherSunset: null,
    parkingBaseAddress: null,
    mealTimes: [],
    specialNotes: null,
    schedule: [
      {
        strip_type: 'SCENE',
        scene_number: '1',
        locLabel: 'Stage',
        episodeLabel: '101',
        scene_heading: null,
        scene_title: null,
        int_ext: 'INT',
        day_night: 'DAY',
      },
      {
        strip_type: 'SCENE',
        scene_number: '2',
        locLabel: 'Ext',
        episodeLabel: '102',
        scene_heading: null,
        scene_title: null,
        int_ext: 'EXT',
        day_night: 'DAY',
      },
    ],
    castCalled: [],
    crewGroups: [],
    locations: [],
    isEpisodicProduction: true,
    includeEpisodesInSchedule: true,
    shootingBlocMastheadLabel: 'Principal Block',
    advancedScheduleDays: [],
  }
  return { ...base, ...over }
}
