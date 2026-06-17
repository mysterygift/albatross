import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatSceneHeading } from '@/lib/script-parser/common'
import { SCENE_DAY_NIGHT_VALUES, SCENE_INT_EXT_VALUES } from '@/lib/db/types'
import type { Location } from '@/lib/db/types'
import type { DayNight, IntExt } from '@/lib/script-parser/types'
import {
  syncSceneSlugFields,
  type ImportSceneDraft,
} from '@/lib/schedule/scriptImportReview'
import { sceneScheduleLabel } from '@/lib/schedule/sceneDisplay'

const SELECT_NONE = '__none__'

type Props = {
  draft: ImportSceneDraft | null
  open: boolean
  onOpenChange: (open: boolean) => void
  existingLocations: Location[]
  onSave: (updated: ImportSceneDraft) => void
}

export function ScriptImportSceneEditorDialog({
  draft,
  open,
  onOpenChange,
  existingLocations,
  onSave,
}: Props) {
  const [sceneNumber, setSceneNumber] = useState('')
  const [location, setLocation] = useState('')
  const [intExt, setIntExt] = useState<IntExt | null>(null)
  const [dayNight, setDayNight] = useState<DayNight | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!draft || !open) return
    setSceneNumber(draft.scene_number)
    setLocation(draft.location?.trim() ?? '')
    setIntExt(draft.int_ext ?? null)
    setDayNight(draft.day_night ?? null)
    setError(null)
  }, [draft, open])

  const previewDraft =
    draft &&
    syncSceneSlugFields(draft, {
      scene_number: sceneNumber,
      location: location.trim() || null,
      int_ext: intExt,
      day_night: dayNight,
    })

  const handleSave = () => {
    if (!draft) return
    const trimmedNumber = sceneNumber.trim()
    if (!trimmedNumber) {
      setError('Scene number is required.')
      return
    }
    onSave(
      syncSceneSlugFields(draft, {
        scene_number: trimmedNumber,
        location: location.trim() || null,
        int_ext: intExt,
        day_night: dayNight,
      })
    )
    onOpenChange(false)
  }

  const matchedExistingId =
    existingLocations.find(
      (loc) => loc.name.trim().toLowerCase() === location.trim().toLowerCase()
    )?.id ?? SELECT_NONE

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>Edit parsed scene</DialogTitle>
          <DialogDescription>
            Adjust how this scene heading will be imported before creating scenes.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="import-scene-number">
              Scene number<span className="text-destructive">*</span>
            </Label>
            <Input
              id="import-scene-number"
              value={sceneNumber}
              onChange={(e) => setSceneNumber(e.target.value)}
              placeholder="e.g. 12A"
              className="mt-1 bg-input border-border"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="import-scene-location">Location</Label>
            <Input
              id="import-scene-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. KITCHEN"
              className="mt-1 bg-input border-border"
            />
          </div>

          {existingLocations.length > 0 && (
            <div>
              <Label>Use existing production location</Label>
              <Select
                value={matchedExistingId}
                onValueChange={(v) => {
                  if (v === SELECT_NONE) return
                  const loc = existingLocations.find((l) => l.id === v)
                  if (loc) setLocation(loc.name)
                }}
              >
                <SelectTrigger className="mt-1 bg-input border-border">
                  <SelectValue placeholder="Optional — pick existing location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>—</SelectItem>
                  {existingLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>INT / EXT</Label>
              <Select
                value={intExt ?? SELECT_NONE}
                onValueChange={(v) =>
                  setIntExt(v === SELECT_NONE ? null : (v as IntExt))
                }
              >
                <SelectTrigger className="mt-1 bg-input border-border">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>—</SelectItem>
                  {SCENE_INT_EXT_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Time of day</Label>
              <Select
                value={dayNight ?? SELECT_NONE}
                onValueChange={(v) =>
                  setDayNight(v === SELECT_NONE ? null : (v as DayNight))
                }
              >
                <SelectTrigger className="mt-1 bg-input border-border">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>—</SelectItem>
                  {SCENE_DAY_NIGHT_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {previewDraft && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Preview
              </p>
              <p className="font-mono text-xs">
                {formatSceneHeading(previewDraft.int_ext, previewDraft.title)}
              </p>
              <p className="text-muted-foreground">
                {sceneScheduleLabel(previewDraft, previewDraft.location ?? null)}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
