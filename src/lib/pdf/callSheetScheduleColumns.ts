/** Main shooting schedule table column keys (page 1). */
export type MainScheduleColKey =
  | 'loc'
  | 'ep'
  | 'scsh'
  | 'synopsis'
  | 'dn'
  | 'pgs'
  | 'time'
  | 'cast'
  | 'notes'

export type MainScheduleColDef = { key: MainScheduleColKey; label: string; w: number }

/** Default table width: A4 content width between 36pt margins. */
export const MAIN_SCHEDULE_TABLE_WIDTH = 523

/**
 * Column layout for the main SHOOTING SCHEDULE grid:
 * [EP] | SC/SH | SET / DESCRIPTION | CAST | D/N | PGS | [TIME] | LOC | NOTES.
 * The description column takes whatever width the fixed columns leave.
 */
export function buildMainScheduleColumns(
  data: { includeEpisodesInSchedule?: boolean; showTime?: boolean },
  totalWidth: number = MAIN_SCHEDULE_TABLE_WIDTH,
): MainScheduleColDef[] {
  const fixed: Array<Omit<MainScheduleColDef, 'w'> & { w: number }> = []
  if (data.includeEpisodesInSchedule === true) fixed.push({ key: 'ep', label: 'EP', w: 24 })
  fixed.push({ key: 'scsh', label: 'SC/SH', w: 40 })
  const castIdx = fixed.length
  fixed.push(
    { key: 'cast', label: 'CAST', w: 70 },
    { key: 'dn', label: 'D/N', w: 32 },
    { key: 'pgs', label: 'PGS', w: 26 },
  )
  if (data.showTime === true) fixed.push({ key: 'time', label: 'TIME', w: 34 })
  fixed.push({ key: 'loc', label: 'LOC', w: 50 }, { key: 'notes', label: 'NOTES', w: 80 })

  const fixedSum = fixed.reduce((s, c) => s + c.w, 0)
  const synopsisW = totalWidth - fixedSum
  if (synopsisW < 80) {
    throw new Error(`Main schedule needs at least ${fixedSum + 80}pt, got ${totalWidth}`)
  }
  const cols = [...fixed]
  cols.splice(castIdx, 0, { key: 'synopsis', label: 'SET / DESCRIPTION', w: synopsisW })
  return cols
}

export type AdvancedScheduleColKey =
  | 'loc'
  | 'ep'
  | 'scsh'
  | 'synopsis'
  | 'dn'
  | 'pgs'
  | 'cast'

export type AdvancedScheduleColDef = { key: AdvancedScheduleColKey; label: string; w: number }

/** Advanced-schedule grid: [EP] | SC/SH | SET / DESCRIPTION | [CAST] | D/N | PGS | LOC, full width. */
export function buildAdvancedScheduleColumns(
  args: { includeEpisodesInSchedule: boolean; hasCast: boolean },
  totalWidth: number = MAIN_SCHEDULE_TABLE_WIDTH,
): AdvancedScheduleColDef[] {
  const before: AdvancedScheduleColDef[] = []
  if (args.includeEpisodesInSchedule === true) before.push({ key: 'ep', label: 'EP', w: 24 })
  before.push({ key: 'scsh', label: 'SC/SH', w: 40 })
  const after: AdvancedScheduleColDef[] = []
  if (args.hasCast) after.push({ key: 'cast', label: 'CAST', w: 70 })
  after.push(
    { key: 'dn', label: 'D/N', w: 32 },
    { key: 'pgs', label: 'PGS', w: 26 },
    { key: 'loc', label: 'LOC', w: 46 },
  )
  const fixedSum = [...before, ...after].reduce((s, c) => s + c.w, 0)
  const synopsisW = totalWidth - fixedSum
  if (synopsisW < 80) {
    throw new Error(`Advanced schedule needs at least ${fixedSum + 80}pt, got ${totalWidth}`)
  }
  return [...before, { key: 'synopsis', label: 'SET / DESCRIPTION', w: synopsisW }, ...after]
}
