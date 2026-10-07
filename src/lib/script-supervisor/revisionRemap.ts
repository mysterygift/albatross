/**
 * Revision remap (SS10). Pure: matches a scene's script elements in an earlier draft to the same scene in a new
 * draft, then works out where each tramline and note goes.
 *
 * Matching, in order:
 *  1. Unchanged lines: the longest common subsequence of (type, character, normalised text), so order is kept and
 *     repeated lines ("Beat.") pair up in sequence.
 *  2. Reworded lines: between two unchanged anchors, an old and a new line of the same type (and same speaker for
 *     dialogue) whose words overlap enough are paired as "similar": Dice ≥ 0.5, or at least two shared words that
 *     make up half the shorter line (a line extended with a new sentence).
 * Everything else is cut (old) or new (new draft).
 *
 * A tramline keeps its run between the first and last of its lines that survive. Lines added inside the run can't
 * have been filmed, so they are marked not covered. Any change makes the tramline "moved" (listed for review);
 * a tramline with no surviving lines is "unmatched" and is never dropped silently.
 */
import type { LiningElement, SegmentState } from './lining'
import { normaliseLine, sharedWords, words } from '@/lib/text/similarity'

export { lineSimilarity, normaliseLine } from '@/lib/text/similarity'

export type RemapElement = Pick<LiningElement, 'id' | 'sort_index' | 'element_type' | 'character_name' | 'text'>

export type ElementMatch = { newId: string; exact: boolean }

const SIMILARITY_THRESHOLD = 0.5

function speaker(el: RemapElement): string {
  return (el.character_name ?? '')
    .toUpperCase()
    .replace(/\((CONT'D|CONT’D|CONTD|V\.O\.|O\.S\.|O\.C\.)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function key(el: RemapElement): string {
  return `${el.element_type}|${el.element_type === 'dialogue' ? speaker(el) : ''}|${normaliseLine(el.text)}`
}

/** Match score for a reworded line, or 0 when the lines are too different. */
function rewordScore(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (wa.length === 0 || wb.length === 0) return 0
  const shared = sharedWords(wa, wb)
  const dice = (2 * shared) / (wa.length + wb.length)
  if (dice >= SIMILARITY_THRESHOLD) return dice
  return shared >= 2 && shared / Math.min(wa.length, wb.length) >= 0.5 ? SIMILARITY_THRESHOLD : 0
}

function sameKind(a: RemapElement, b: RemapElement): boolean {
  return a.element_type === b.element_type && (a.element_type !== 'dialogue' || speaker(a) === speaker(b))
}

/** Old element id → its match in the new draft. Unmatched old elements are absent. */
export function matchElements(oldElements: readonly RemapElement[], newElements: readonly RemapElement[]): Map<string, ElementMatch> {
  const olds = [...oldElements].sort((a, b) => a.sort_index - b.sort_index)
  const news = [...newElements].sort((a, b) => a.sort_index - b.sort_index)
  const ok = olds.map(key)
  const nk = news.map(key)
  const n = olds.length
  const m = news.length

  // LCS table (scenes are small: a few hundred elements at most).
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = ok[i] === nk[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const anchors: Array<[number, number]> = []
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (ok[i] === nk[j]) {
      anchors.push([i, j])
      i += 1
      j += 1
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i += 1
    else j += 1
  }

  const out = new Map<string, ElementMatch>()
  for (const [i, j] of anchors) out.set(olds[i]!.id, { newId: news[j]!.id, exact: true })

  // Reworded lines inside each gap between anchors, kept in order.
  const bounds: Array<[number, number]> = [[-1, -1], ...anchors, [n, m]]
  for (let g = 0; g < bounds.length - 1; g++) {
    const [oi0, nj0] = bounds[g]!
    const [oi1, nj1] = bounds[g + 1]!
    let nextNew = nj0 + 1
    for (let i = oi0 + 1; i < oi1; i++) {
      const old = olds[i]!
      let best = -1
      let bestScore = 0
      for (let j = nextNew; j < nj1; j++) {
        const cand = news[j]!
        if (!sameKind(old, cand)) continue
        const score = rewordScore(old.text, cand.text)
        if (score > bestScore) {
          best = j
          bestScore = score
        }
      }
      if (best >= 0) {
        out.set(old.id, { newId: news[best]!.id, exact: false })
        nextNew = best + 1
      }
    }
  }
  return out
}

export type RemapTramlineInput = {
  startSortIndex: number
  endSortIndex: number
  segments: ReadonlyMap<string, SegmentState>
}

export type TramlineRemap =
  | {
      outcome: 'carried' | 'moved'
      startElementId: string
      endElementId: string
      segments: Array<{ elementId: string; state: SegmentState }>
      notes: string[]
    }
  | { outcome: 'unmatched'; notes: string[] }

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Where an earlier tramline goes in the new draft. */
export function remapTramline(
  tramline: RemapTramlineInput,
  oldElements: readonly RemapElement[],
  newElements: readonly RemapElement[],
  matches: ReadonlyMap<string, ElementMatch>
): TramlineRemap {
  const run = [...oldElements]
    .sort((a, b) => a.sort_index - b.sort_index)
    .filter((e) => e.sort_index >= tramline.startSortIndex && e.sort_index <= tramline.endSortIndex)
  const survivors = run.filter((e) => matches.has(e.id))
  if (survivors.length === 0) {
    return { outcome: 'unmatched', notes: ['None of the lines it covered are in the new draft'] }
  }

  const news = [...newElements].sort((a, b) => a.sort_index - b.sort_index)
  const sortOf = new Map(news.map((e) => [e.id, e.sort_index]))
  let startId = matches.get(survivors[0]!.id)!.newId
  let endId = matches.get(survivors[survivors.length - 1]!.id)!.newId
  if (sortOf.get(startId)! > sortOf.get(endId)!) [startId, endId] = [endId, startId]
  const lo = sortOf.get(startId)!
  const hi = sortOf.get(endId)!
  const newRun = news.filter((e) => e.sort_index >= lo && e.sort_index <= hi)

  const notes: string[] = []
  const cut = run.length - survivors.length
  if (cut > 0) notes.push(`${plural(cut, 'line it covered was', 'lines it covered were')} cut`)
  const reworded = survivors.filter((e) => !matches.get(e.id)!.exact).length
  if (reworded > 0) notes.push(`${plural(reworded, 'line was', 'lines were')} reworded`)

  const segments: Array<{ elementId: string; state: SegmentState }> = []
  let lostMarks = 0
  for (const [elementId, state] of tramline.segments) {
    const match = matches.get(elementId)
    const s = match ? sortOf.get(match.newId) : undefined
    if (match && s != null && s >= lo && s <= hi) segments.push({ elementId: match.newId, state })
    else if (run.some((e) => e.id === elementId)) lostMarks += 1
  }
  if (lostMarks > 0) notes.push(`${plural(lostMarks, 'off-camera or gap mark', 'off-camera or gap marks')} could not be placed`)

  // Lines added inside the run were never filmed.
  const carriedTargets = new Set(survivors.map((e) => matches.get(e.id)!.newId))
  const added = newRun.filter((e) => !carriedTargets.has(e.id) && e.element_type !== 'scene_heading')
  for (const e of added) segments.push({ elementId: e.id, state: 'not_covered' })
  if (added.length > 0) notes.push(`${plural(added.length, 'new line inside its run is', 'new lines inside its run are')} marked not covered`)

  return { outcome: notes.length > 0 ? 'moved' : 'carried', startElementId: startId, endElementId: endId, segments, notes }
}

export type AnnotationRemap =
  | { outcome: 'carried' | 'moved'; elementId: string; notes: string[] }
  | { outcome: 'unmatched'; notes: string[] }

/** Where an earlier note goes: onto the same line in the new draft, if it survives. */
export function remapAnnotation(elementId: string, matches: ReadonlyMap<string, ElementMatch>): AnnotationRemap {
  const match = matches.get(elementId)
  if (!match) return { outcome: 'unmatched', notes: ['Its line was cut from the new draft'] }
  return match.exact
    ? { outcome: 'carried', elementId: match.newId, notes: [] }
    : { outcome: 'moved', elementId: match.newId, notes: ['Its line was reworded'] }
}
