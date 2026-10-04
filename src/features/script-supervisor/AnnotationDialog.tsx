import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Take } from '@/lib/db/types'
import {
  ANNOTATION_KINDS,
  ANNOTATION_KIND_LABEL,
  type AnnotationKind,
  type AnnotationView,
} from '@/lib/script-supervisor/annotations'

export type AnnotationDialogState =
  | { mode: 'create'; elementId: string; excerpt: string; character: string | null }
  | { mode: 'edit'; annotation: AnnotationView; excerpt: string }

export type AnnotationDialogProps = {
  state: AnnotationDialogState | null
  /** Slate a new note is tied to (the current slate), with its takes. Null = untied note. */
  slate: { id: string; label: string } | null
  takes: Take[]
  /** Take ticked by default for a new note: the selected take, else the latest. */
  defaultTakeId: string | null
  busy: boolean
  error: string | null
  onClose: () => void
  onCreate: (input: { elementId: string; kind: AnnotationKind; text: string; slateId: string | null; takeIds: string[] }) => void
  onUpdate: (id: string, patch: { kind: AnnotationKind; text: string; takeIds: string[] }) => void
  onDelete: (id: string) => void
}

/** Add or edit a note on one script line (SS8): line change, ad-lib, cut, editor notes. */
export function AnnotationDialog(props: AnnotationDialogProps) {
  const { state } = props
  const [kind, setKind] = useState<AnnotationKind>('line_change')
  const [text, setText] = useState('')
  const [tieToSlate, setTieToSlate] = useState(true)
  const [takeIds, setTakeIds] = useState<string[]>([])

  useEffect(() => {
    if (!state) return
    if (state.mode === 'edit') {
      setKind(state.annotation.kind)
      setText(state.annotation.text)
      setTieToSlate(!!state.annotation.slateId)
      setTakeIds(state.annotation.takeIds)
    } else {
      setKind(state.character ? 'line_change' : 'note')
      setText('')
      setTieToSlate(!!props.slate)
      setTakeIds(props.defaultTakeId ? [props.defaultTakeId] : [])
    }
    // Reset only when a dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const editingSlateId = state?.mode === 'edit' ? state.annotation.slateId : props.slate?.id ?? null
  const showTakes = state?.mode === 'edit' ? !!state.annotation.slateId : tieToSlate && !!props.slate
  const sortedTakes = [...props.takes].sort((a, b) => a.take_number - b.take_number)

  const submit = () => {
    if (!state) return
    if (state.mode === 'edit') {
      props.onUpdate(state.annotation.id, { kind, text, takeIds: state.annotation.slateId ? takeIds : [] })
    } else {
      props.onCreate({
        elementId: state.elementId,
        kind,
        text,
        slateId: tieToSlate ? props.slate?.id ?? null : null,
        takeIds: tieToSlate && props.slate ? takeIds : [],
      })
    }
  }

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state?.mode === 'edit' ? 'Edit note' : 'Add a note to this line'}</DialogTitle>
          <DialogDescription className="line-clamp-2">{state?.excerpt}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="annotation-kind">Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AnnotationKind)}>
              <SelectTrigger id="annotation-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANNOTATION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ANNOTATION_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="annotation-text">{kind === 'line_change' || kind === 'ad_lib' ? 'What was said' : 'Note'}</Label>
            <Textarea
              id="annotation-text"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === 'ad_lib' ? '+ “Nobody ever does.”' : kind === 'line_change' ? '“So use it.” for “So use the one.”' : ''}
            />
          </div>
          {state?.mode === 'create' && props.slate && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={tieToSlate} onCheckedChange={(v) => setTieToSlate(v === true)} />
              Applies to slate {props.slate.label}
            </label>
          )}
          {showTakes && editingSlateId && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Takes</legend>
              {sortedTakes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No takes yet; the note applies to the whole slate.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {sortedTakes.map((t) => (
                    <label key={t.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={takeIds.includes(t.id)}
                        onCheckedChange={(v) =>
                          setTakeIds((ids) => (v === true ? [...ids, t.id] : ids.filter((id) => id !== t.id)))
                        }
                      />
                      Take {t.take_number}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}
          {props.error && (
            <p role="alert" className="text-sm text-destructive">
              {props.error}
            </p>
          )}
          <DialogFooter className="gap-2">
            {state?.mode === 'edit' && (
              <Button type="button" variant="outline" className="mr-auto" disabled={props.busy} onClick={() => props.onDelete(state.annotation.id)}>
                Delete note
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={props.busy || !text.trim()}>
              {state?.mode === 'edit' ? 'Save' : 'Add note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
