/**
 * Script annotations and continuity photo tags (SS8). Pure.
 */

export type AnnotationKind = 'line_change' | 'ad_lib' | 'cut' | 'note' | 'vfx' | 'sfx' | 'continuity'

export const ANNOTATION_KINDS: readonly AnnotationKind[] = ['line_change', 'ad_lib', 'cut', 'note', 'vfx', 'sfx', 'continuity']

export const ANNOTATION_KIND_LABEL: Record<AnnotationKind, string> = {
  line_change: 'Line change',
  ad_lib: 'Ad-lib',
  cut: 'Cut',
  note: 'Note',
  vfx: 'VFX',
  sfx: 'SFX',
  continuity: 'Continuity',
}

/** What a chip on the marked-up script needs to know about an annotation. */
export type AnnotationView = {
  id: string
  elementId: string
  kind: AnnotationKind
  text: string
  slateId: string | null
  slateLabel: string | null
  takeIds: string[]
  takeNumbers: number[]
  createdAt: string
}

/** Chip text as written in a script margin: 'T3 · 217 · Ad-lib: Nobody ever does.' */
export function formatAnnotationChip(a: Pick<AnnotationView, 'kind' | 'text' | 'slateLabel' | 'takeNumbers'>): string {
  const parts: string[] = []
  if (a.takeNumbers.length > 0) parts.push(`T${[...a.takeNumbers].sort((x, y) => x - y).join(',')}`)
  if (a.slateLabel) parts.push(a.slateLabel)
  parts.push(`${ANNOTATION_KIND_LABEL[a.kind]}: ${a.text}`)
  return parts.join(' · ')
}

/** Groups annotations by script element for rendering under each line. */
export function annotationsByElement(list: readonly AnnotationView[]): Map<string, AnnotationView[]> {
  const out = new Map<string, AnnotationView[]>()
  for (const a of [...list].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    const arr = out.get(a.elementId) ?? []
    arr.push(a)
    out.set(a.elementId, arr)
  }
  return out
}

export type ContinuityTag = 'wardrobe' | 'props' | 'makeup' | 'hair' | 'set' | 'other'

export const CONTINUITY_TAGS: readonly ContinuityTag[] = ['wardrobe', 'props', 'makeup', 'hair', 'set', 'other']

export const CONTINUITY_TAG_LABEL: Record<ContinuityTag, string> = {
  wardrobe: 'Wardrobe',
  props: 'Props',
  makeup: 'Make-up',
  hair: 'Hair',
  set: 'Set',
  other: 'Other',
}

/** Known tags in canonical order, de-duplicated; unknown words are dropped. */
export function parseContinuityTags(value: string | null | undefined): ContinuityTag[] {
  const words = new Set((value ?? '').split(',').map((w) => w.trim().toLowerCase()))
  return CONTINUITY_TAGS.filter((t) => words.has(t))
}

export function formatContinuityTags(tags: readonly string[]): string | null {
  const parsed = parseContinuityTags(tags.join(','))
  return parsed.length > 0 ? parsed.join(',') : null
}

/** Safe file name for a stored continuity photo. */
export function continuityPhotoFileName(original: string, slateLabel: string | null, takeNumber: number | null): string {
  const ext = (original.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1] ?? 'jpg').toLowerCase()
  const parts = ['continuity', slateLabel ? `slate-${slateLabel}` : null, takeNumber != null ? `t${takeNumber}` : null]
    .filter(Boolean)
    .join('-')
  return `${parts.replace(/[^a-zA-Z0-9-_]/g, '-')}.${ext}`
}
