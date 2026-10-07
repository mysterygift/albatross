/**
 * Carries a breakdown tag from one draft of a scene to the next. Pure.
 *
 * The scene's lines in both drafts are paired with the Script Supervisor's revision matcher (`matchElements`:
 * unchanged lines in order, then reworded lines between them). The tag's words are then looked for:
 *  1. inside the new lines paired with the lines the tag covered → carried (moved if any were reworded);
 *  2. anywhere else in the new scene, nearest to where they were → moved;
 *  3. otherwise the tag is unmatched and goes to the review list.
 */
import { buildSceneLines, type LayoutPage, type SceneLine } from '@/lib/db/scriptSectionLayout'
import { matchElements, type RemapElement } from '@/lib/script-supervisor/revisionRemap'
import type { PageTextRange } from './selection'
import { tagSliceOnLine, type PlacedTag } from './tagLayout'

export type CarryTagInput = Omit<PlacedTag, 'category'> & { tagged_text: string }

export type TagCarry =
  | { outcome: 'carried' | 'moved'; range: PageTextRange; notes: string[] }
  | { outcome: 'unmatched'; notes: string[] }

type SceneText = {
  text: string
  /** Start of each page in `text` (pages joined with a newline). */
  pageStarts: number[]
  pages: readonly LayoutPage[]
}

function sceneText(pages: readonly LayoutPage[]): SceneText {
  const pageStarts: number[] = []
  let text = ''
  pages.forEach((p, i) => {
    if (i > 0) text += '\n'
    pageStarts.push(text.length)
    text += p.content ?? ''
  })
  return { text, pageStarts, pages }
}

function toGlobal(st: SceneText, line: SceneLine, offsetInPage: number): number {
  return st.pageStarts[line.pageOrder]! + offsetInPage
}

/** Global [start, end) → page range. An end exactly at a page start stays at the end of the page before. */
function toPageRange(st: SceneText, start: number, end: number): PageTextRange {
  let sp = 0
  let ep = 0
  st.pageStarts.forEach((s, k) => {
    if (s <= start) sp = k
    if (s < end) ep = k
  })
  const endContent = st.pages[ep]!.content ?? ''
  return {
    startPageId: st.pages[sp]!.id,
    startOffset: start - st.pageStarts[sp]!,
    endPageId: st.pages[ep]!.id,
    endOffset: Math.min(end - st.pageStarts[ep]!, endContent.length),
  }
}

/** Occurrence of `needle` in text[from, to) nearest to `near`, case-sensitive first. */
function findNearest(text: string, needle: string, from: number, to: number, near: number): number | null {
  if (!needle) return null
  for (const fold of [false, true]) {
    const hay = fold ? text.toLowerCase() : text
    const n = fold ? needle.toLowerCase() : needle
    let best: number | null = null
    for (let i = hay.indexOf(n, from); i >= 0 && i + n.length <= to; i = hay.indexOf(n, i + 1)) {
      if (best == null || Math.abs(i - near) < Math.abs(best - near)) best = i
    }
    if (best != null) return best
  }
  return null
}

function asElements(lines: readonly SceneLine[]): RemapElement[] {
  return lines.map((l) => ({ id: `L${l.index}`, sort_index: l.index, element_type: 'action', character_name: null, text: l.text }))
}

export type SceneCarryContext = {
  oldPages: readonly LayoutPage[]
  newPages: readonly LayoutPage[]
}

/** Where each tag of a scene goes in the new draft, keyed by tag id. */
export function carryTagsToNewDraft(ctx: SceneCarryContext, tags: readonly CarryTagInput[]): Map<string, TagCarry> {
  const oldLines = buildSceneLines(ctx.oldPages)
  const newLines = buildSceneLines(ctx.newPages)
  const matches = matchElements(asElements(oldLines), asElements(newLines))
  const oldText = sceneText(ctx.oldPages)
  const newText = sceneText(ctx.newPages)
  const oldPageOrder = new Map(ctx.oldPages.map((p, i) => [p.id, i]))

  const out = new Map<string, TagCarry>()
  for (const tag of tags) {
    const needle = tag.tagged_text
    const covered = oldLines.filter((l) => tagSliceOnLine({ ...tag, category: 'props' }, l, oldPageOrder) != null)
    if (covered.length === 0 || !needle.trim()) {
      out.set(tag.id, { outcome: 'unmatched', notes: ['Its words could not be found in the earlier draft'] })
      continue
    }
    const first = covered[0]!
    const last = covered[covered.length - 1]!
    const startOrder = oldPageOrder.get(tag.start_page_id)!
    const oldStart = oldText.pageStarts[startOrder]! + tag.start_offset
    // Where the tag sat in its first line, to pick the right occurrence of repeated words.
    const offsetInFirstLine = oldStart - toGlobal(oldText, first, first.startOffset)

    const mFirst = matches.get(`L${first.index}`)
    const mLast = matches.get(`L${last.index}`)
    if (mFirst && mLast) {
      const nFirst = newLines[Number(mFirst.newId.slice(1))]!
      const nLast = newLines[Number(mLast.newId.slice(1))]!
      if (nFirst.index <= nLast.index) {
        const from = toGlobal(newText, nFirst, nFirst.startOffset)
        const to = toGlobal(newText, nLast, nLast.startOffset + nLast.text.length)
        const at = findNearest(newText.text, needle, from, to, from + offsetInFirstLine)
        if (at != null) {
          const reworded = covered.some((l) => !matches.get(`L${l.index}`)?.exact)
          out.set(tag.id, {
            outcome: reworded ? 'moved' : 'carried',
            range: toPageRange(newText, at, at + needle.length),
            notes: reworded ? ['Its line was reworded'] : [],
          })
          continue
        }
      }
    }

    // Look anywhere in the scene, nearest to the same relative position.
    const near = oldText.text.length > 0 ? Math.round((oldStart / oldText.text.length) * newText.text.length) : 0
    const at = findNearest(newText.text, needle, 0, newText.text.length, near)
    if (at != null) {
      out.set(tag.id, {
        outcome: 'moved',
        range: toPageRange(newText, at, at + needle.length),
        notes: ['Its line changed; the words were found elsewhere in the scene'],
      })
      continue
    }
    out.set(tag.id, { outcome: 'unmatched', notes: ['Its words are no longer in the scene'] })
  }
  return out
}
