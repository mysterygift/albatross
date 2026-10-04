/**
 * Pure helpers for drawing and editing tramlines (SS7). The UI works the same for mouse, touch, pen and
 * keyboard: tap the first line then the last line of a shot (drag is a shortcut for the same thing), tap a
 * segment to cycle it, and undo any lining change.
 */
import type { CellState, LiningRow } from './lining'

/** Tap cycle for a segment: on camera → off camera → not covered → on camera. */
export function nextSegmentState(state: CellState): CellState {
  return state === 'on' ? 'off' : state === 'off' ? 'not_covered' : 'on'
}

export const SEGMENT_STATE_LABEL: Record<CellState, string> = {
  on: 'On camera',
  off: 'Off camera',
  not_covered: 'Not covered',
}

/** A drawn run, ordered top to bottom whatever direction it was drawn in. */
export function orderedRange(a: number, b: number): { start: number; end: number } {
  return a <= b ? { start: a, end: b } : { start: b, end: a }
}

/** Rows that can anchor a tramline end. Scene headings are not covered by shots. */
export function isLineableRow(row: LiningRow): boolean {
  return row.element.element_type !== 'scene_heading'
}

/**
 * Snaps a drawn run to lineable rows: if it starts or ends on a heading, it moves inward. Returns null when
 * nothing lineable is inside the run.
 */
export function snapRangeToLineable(rows: readonly LiningRow[], start: number, end: number): { start: number; end: number } | null {
  const inside = rows.filter((r) => r.element.sort_index >= start && r.element.sort_index <= end && isLineableRow(r))
  if (inside.length === 0) return null
  return { start: inside[0]!.element.sort_index, end: inside[inside.length - 1]!.element.sort_index }
}

/**
 * Elements to switch off camera for one character from a given line to the end of a tramline's run — the
 * paper habit of squiggling every remaining line for a character who is out of shot.
 */
export function characterRunElementIds(
  rows: readonly LiningRow[],
  laneIndex: number,
  fromSortIndex: number,
  characterName: string
): string[] {
  const key = characterName.trim().toUpperCase()
  return rows
    .filter(
      (r) =>
        r.element.sort_index >= fromSortIndex &&
        r.element.element_type === 'dialogue' &&
        (r.element.character_name ?? '').trim().toUpperCase() === key &&
        r.cells[laneIndex]?.state != null
    )
    .map((r) => r.element.id)
}

// ─── Undo ───────────────────────────────────────────────────────────────────

export type SegmentChange = { elementId: string; state: CellState }

/** Each entry records how to reverse one lining action. */
export type LiningUndoEntry =
  | { kind: 'created'; tramlineId: string; label: string }
  | { kind: 'range'; tramlineId: string; startElementId: string; endElementId: string; label: string }
  | { kind: 'segments'; tramlineId: string; previous: SegmentChange[]; label: string }
  | { kind: 'deleted'; tramlineId: string; label: string }

export const UNDO_LIMIT = 20

export function pushUndo(stack: readonly LiningUndoEntry[], entry: LiningUndoEntry): LiningUndoEntry[] {
  const next = [...stack, entry]
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next
}

export function popUndo(stack: readonly LiningUndoEntry[]): { entry: LiningUndoEntry | null; rest: LiningUndoEntry[] } {
  if (stack.length === 0) return { entry: null, rest: [] }
  return { entry: stack[stack.length - 1]!, rest: stack.slice(0, -1) }
}
