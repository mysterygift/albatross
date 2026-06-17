import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ScriptSectionStatus } from '@/lib/db/types'

export const SECTION_STATUSES: ScriptSectionStatus[] = [
  'unplanned',
  'planned',
  'scheduled',
  'shot',
  'omitted',
]

/** Minimum/maximum accepted eighth value (8 = end of a full page). */
export const MIN_EIGHTH = 0
export const MAX_EIGHTH = 8

/** Capitalize status labels for display; DB values stay lowercase. */
export function formatSectionStatus(status: ScriptSectionStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export type SectionEditorValues = {
  scene_id: string
  label: string
  status: ScriptSectionStatus
  notes: string
  start_page: string
  start_eighth: string
  end_page: string
  end_eighth: string
  characterNames: string[]
}

export const EMPTY_SECTION_VALUES: SectionEditorValues = {
  scene_id: '',
  label: '',
  status: 'unplanned',
  notes: '',
  start_page: '',
  start_eighth: '',
  end_page: '',
  end_eighth: '',
  characterNames: [],
}

export type SceneOption = { id: string; label: string }

function parseEighth(raw: string): { value: number | null; error: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { value: null, error: null }
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < MIN_EIGHTH || n > MAX_EIGHTH) {
    return { value: null, error: `Eighth values must be whole numbers between ${MIN_EIGHTH} and ${MAX_EIGHTH}.` }
  }
  return { value: n, error: null }
}

/**
 * Validates an editor form. Returns an error message, or null when valid.
 * Enforces: a linked scene (on create), eighth bounds (0–8) and start <= end across page/eighth.
 */
export function validateSectionEditorValues(
  values: SectionEditorValues,
  options: { requireScene?: boolean } = {}
): string | null {
  if (options.requireScene && !values.scene_id.trim()) {
    return 'Choose a linked scene for this section.'
  }

  const start = parseEighth(values.start_eighth)
  if (start.error) return start.error
  const end = parseEighth(values.end_eighth)
  if (end.error) return end.error

  const sp = values.start_page.trim()
  const ep = values.end_page.trim()
  const spn = Number(sp)
  const epn = Number(ep)
  const pagesNumeric = sp !== '' && ep !== '' && Number.isFinite(spn) && Number.isFinite(epn)

  if (pagesNumeric) {
    if (spn > epn) return 'Start page must be before or equal to end page.'
    if (spn === epn && start.value != null && end.value != null && start.value > end.value) {
      return 'Start eighth must be before or equal to end eighth on the same page.'
    }
  } else if (sp === ep && start.value != null && end.value != null && start.value > end.value) {
    return 'Start eighth must be before or equal to end eighth.'
  }

  return null
}

export type ScriptSectionEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  /** When true, label and characters are read-only (generated/parsed sections). */
  editingGenerated?: boolean
  /** Scenes for the current production, used for the linked-scene selector. */
  scenes: SceneOption[]
  initialValues?: SectionEditorValues
  pending?: boolean
  error?: string | null
  onSubmit: (values: SectionEditorValues) => void
}

export function ScriptSectionEditDialog({
  open,
  onOpenChange,
  mode,
  editingGenerated = false,
  scenes,
  initialValues,
  pending = false,
  error = null,
  onSubmit,
}: ScriptSectionEditDialogProps) {
  const [values, setValues] = useState<SectionEditorValues>(initialValues ?? EMPTY_SECTION_VALUES)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync of form fields with initial values on open
      setValues(initialValues ?? EMPTY_SECTION_VALUES)
      setLocalError(null)
    }
  }, [open, initialValues])

  const lockLabelAndCharacters = editingGenerated
  const set = <K extends keyof SectionEditorValues>(key: K, value: SectionEditorValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = () => {
    const validationError = validateSectionEditorValues(values, { requireScene: mode === 'create' })
    if (validationError) {
      setLocalError(validationError)
      return
    }
    setLocalError(null)
    onSubmit(values)
  }

  const shownError = localError ?? error

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-zinc-800 border-zinc-600">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'New section' : editingGenerated ? 'Edit generated section' : 'Edit section'}
          </DialogTitle>
          <DialogDescription>
            {editingGenerated
              ? 'Adjust page/eighth boundaries, status, or notes for this generated section.'
              : 'Set the section details, page/eighth range, and characters.'}
          </DialogDescription>
        </DialogHeader>

        {shownError && (
          <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
            {shownError}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-zinc-200">
              Linked scene{mode === 'create' && <span className="text-destructive">*</span>}
            </Label>
            <Select
              value={values.scene_id}
              onValueChange={(v) => set('scene_id', v)}
              disabled={mode !== 'create'}
            >
              <SelectTrigger className="mt-1 bg-input border-border" aria-label="Linked scene">
                <SelectValue placeholder="Select a scene…" />
              </SelectTrigger>
              <SelectContent>
                {scenes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="section-label" className="text-sm text-zinc-200">
              Label
            </Label>
            <Input
              id="section-label"
              value={values.label}
              onChange={(e) => set('label', e.target.value)}
              disabled={lockLabelAndCharacters}
              placeholder="e.g. Fight on the rooftop"
              className="mt-1 bg-input border-border"
            />
          </div>

          <div>
            <Label className="text-sm text-zinc-200">Status</Label>
            <Select value={values.status} onValueChange={(v) => set('status', v as ScriptSectionStatus)}>
              <SelectTrigger className="mt-1 bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {formatSectionStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start-page" className="text-sm text-zinc-200">
                Start page
              </Label>
              <Input
                id="start-page"
                value={values.start_page}
                onChange={(e) => set('start_page', e.target.value)}
                placeholder="e.g. 12"
                className="mt-1 bg-input border-border"
              />
            </div>
            <div>
              <Label htmlFor="start-eighth" className="text-sm text-zinc-200">
                Start eighth ({MIN_EIGHTH}–{MAX_EIGHTH})
              </Label>
              <Input
                id="start-eighth"
                type="number"
                min={MIN_EIGHTH}
                max={MAX_EIGHTH}
                value={values.start_eighth}
                onChange={(e) => set('start_eighth', e.target.value)}
                className="mt-1 bg-input border-border"
              />
            </div>
            <div>
              <Label htmlFor="end-page" className="text-sm text-zinc-200">
                End page
              </Label>
              <Input
                id="end-page"
                value={values.end_page}
                onChange={(e) => set('end_page', e.target.value)}
                placeholder="e.g. 13"
                className="mt-1 bg-input border-border"
              />
            </div>
            <div>
              <Label htmlFor="end-eighth" className="text-sm text-zinc-200">
                End eighth ({MIN_EIGHTH}–{MAX_EIGHTH})
              </Label>
              <Input
                id="end-eighth"
                type="number"
                min={MIN_EIGHTH}
                max={MAX_EIGHTH}
                value={values.end_eighth}
                onChange={(e) => set('end_eighth', e.target.value)}
                className="mt-1 bg-input border-border"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-zinc-200">Characters (name fallbacks)</Label>
              {!lockLabelAndCharacters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => set('characterNames', [...values.characterNames, ''])}
                >
                  Add character
                </Button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {values.characterNames.length === 0 && (
                <p className="text-xs text-muted-foreground">No characters added.</p>
              )}
              {values.characterNames.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={name}
                    onChange={(e) =>
                      set(
                        'characterNames',
                        values.characterNames.map((n, idx) => (idx === i ? e.target.value : n))
                      )
                    }
                    disabled={lockLabelAndCharacters}
                    placeholder="Character name"
                    className="bg-input border-border"
                    aria-label={`Character ${i + 1}`}
                  />
                  {!lockLabelAndCharacters && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        set(
                          'characterNames',
                          values.characterNames.filter((_, idx) => idx !== i)
                        )
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="section-notes" className="text-sm text-zinc-200">
              Notes
            </Label>
            <Textarea
              id="section-notes"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Notes for this section"
              className="mt-1 bg-input border-border"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? 'Saving…' : mode === 'create' ? 'Create section' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
