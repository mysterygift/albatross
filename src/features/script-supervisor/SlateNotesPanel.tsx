import { useEffect, useId, useState } from 'react'
import { Camera, PenLine, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ContinuityMediaView } from '@/lib/db/repositories/scriptAnnotations'
import { createAppDataObjectUrl } from '@/lib/files/appDataObjectUrl'
import {
  CONTINUITY_TAGS,
  CONTINUITY_TAG_LABEL,
  formatAnnotationChip,
  parseContinuityTags,
  type AnnotationView,
  type ContinuityTag,
} from '@/lib/script-supervisor/annotations'

function Thumb({ photo, touch, onRemove }: { photo: ContinuityMediaView; touch: boolean; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let revoked = false
    let created: string | null = null
    createAppDataObjectUrl(photo.filePath, photo.mimeType)
      .then((u) => {
        created = u
        if (revoked) URL.revokeObjectURL(u)
        else setUrl(u)
      })
      .catch(() => setFailed(true))
    return () => {
      revoked = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [photo.filePath, photo.mimeType])

  const tags = parseContinuityTags(photo.tags).map((t) => CONTINUITY_TAG_LABEL[t])
  const caption = [photo.takeNumber != null ? `T${photo.takeNumber}` : null, ...tags].filter(Boolean).join(' · ')
  return (
    <li className="relative">
      <figure className={cn('overflow-hidden rounded-lg border border-border bg-muted/30', touch ? 'w-28' : 'w-24')}>
        {url && !failed ? (
          <img src={url} alt={`Continuity photo${caption ? `, ${caption}` : ''}`} className="aspect-[4/3] w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
            {failed ? photo.fileName : 'Loading…'}
          </div>
        )}
        {caption && <figcaption className="truncate px-1.5 py-1 text-[11px] text-muted-foreground">{caption}</figcaption>}
      </figure>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove photo${caption ? ` (${caption})` : ''} from continuity`}
        className={cn(
          'absolute -right-1.5 -top-1.5 inline-flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          touch ? 'size-8' : 'size-6'
        )}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  )
}

export type SlateNotesPanelProps = {
  slateLabel: string
  notes: AnnotationView[]
  photos: ContinuityMediaView[]
  /** Take new photos are filed against (selected, else latest). */
  photoTakeNumber: number | null
  busy: boolean
  touch: boolean
  onEditNote: (note: AnnotationView) => void
  onAddPhotos: (files: File[], tags: ContinuityTag[]) => void
  onRemovePhoto: (id: string) => void
}

/** Script notes and continuity photos for the current slate (SS8). */
export function SlateNotesPanel(props: SlateNotesPanelProps) {
  const [tags, setTags] = useState<ContinuityTag[]>([])
  const inputId = useId()

  return (
    <section aria-label={`Notes and photos, slate ${props.slateLabel}`} className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Script notes</h3>
        {props.notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None yet. Add line changes and editor notes from the script ({props.touch ? 'tap' : 'hover'} a line, then the note button).
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {props.notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => props.onEditNote(n)}
                  className={cn(
                    'inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-2.5 text-left text-xs text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    props.touch ? 'min-h-9 py-1.5' : 'py-1'
                  )}
                >
                  <PenLine className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{formatAnnotationChip(n)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">Continuity photos</h3>
          <span className="text-xs text-muted-foreground">
            {props.photoTakeNumber != null ? `New photos file against take ${props.photoTakeNumber}` : 'New photos file against the slate'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags for new photos">
          {CONTINUITY_TAGS.map((t) => {
            const on = tags.includes(t)
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTags((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t]))}
                className={cn(
                  'rounded-full border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  props.touch ? 'h-9' : 'h-7',
                  on ? 'border-primary/60 bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {CONTINUITY_TAG_LABEL[t]}
              </button>
            )
          })}
        </div>
        <ul className="flex flex-wrap gap-3 pt-1" aria-label="Photos">
          {props.photos.map((p) => (
            <Thumb key={p.id} photo={p} touch={props.touch} onRemove={() => props.onRemovePhoto(p.id)} />
          ))}
          <li>
            <label
              htmlFor={inputId}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground focus-within:ring-[3px] focus-within:ring-ring/50',
                props.touch ? 'h-[84px] w-28' : 'h-[72px] w-24',
                props.busy && 'pointer-events-none opacity-60'
              )}
            >
              <Camera className="size-4" aria-hidden />
              {props.busy ? 'Saving…' : 'Add photos'}
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={props.busy}
              onChange={(e) => {
                const files: File[] = Array.from(e.currentTarget.files ?? [])
                e.currentTarget.value = ''
                if (files.length > 0) props.onAddPhotos(files, tags)
              }}
            />
          </li>
        </ul>
      </div>
    </section>
  )
}
