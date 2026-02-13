import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listScenesByProduction,
  listShotsByScene,
} from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import type { Shot } from '@/lib/db/types'
import type { Scene } from '@/lib/db/types'

/** Format scene as "INT/EXT – LOCATION_NAME – DAY/NIGHT" for display. */
function formatSceneLabel(scene: Scene, locationName: string | null): string {
  const intExt = scene.int_ext ?? '—'
  const loc = locationName ?? '—'
  const dayNight = scene.day_night ?? '—'
  return `${intExt} – ${loc} – ${dayNight}`
}
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function formatDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function ShotListPage() {
  const { currentProductionId } = useCurrentProduction()
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', currentProductionId],
    queryFn: () => listScenesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: shots = [] } = useQuery({
    queryKey: ['shots', selectedSceneId],
    queryFn: () => listShotsByScene(selectedSceneId!),
    enabled: !!selectedSceneId,
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const selectedScene = scenes.find((s) => s.id === selectedSceneId)
  const getLocationName = (locationId: string | null) =>
    locationId ? locations.find((l) => l.id === locationId)?.name ?? null : null

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Schedule — Shot lists</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Schedule — Shot lists</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label className="mb-2 block">Scene</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={selectedSceneId ?? ''}
            onChange={(e) => setSelectedSceneId(e.target.value || null)}
          >
            <option value="">Select scene…</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.scene_number}. {formatSceneLabel(s, getLocationName(s.location_id))}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedSceneId && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scene / Shot #</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Shot Description</TableHead>
                <TableHead>Shot size</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Est. min</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Lens</TableHead>
                <TableHead>Support</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground text-center py-8">
                    No shots. Add shots to this scene to see them here and on the stripboard.
                  </TableCell>
                </TableRow>
              ) : (
                shots.map((shot: Shot) => (
                  <TableRow key={shot.id}>
                    <TableCell className="font-medium">
                      {selectedScene?.scene_number ?? ''} / {shot.shot_number}
                    </TableCell>
                    <TableCell>{shot.subject ?? '—'}</TableCell>
                    <TableCell className="max-w-[180px]">
                      {shot.shot_description ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate">{shot.shot_description}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-sm">
                            {shot.shot_description}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{shot.shot_size ?? '—'}</TableCell>
                    <TableCell>{formatDuration(shot.duration_seconds)}</TableCell>
                    <TableCell>
                      {shot.estimated_shoot_minutes != null
                        ? `${shot.estimated_shoot_minutes} min`
                        : '—'}
                    </TableCell>
                    <TableCell>{shot.camera_movement ?? '—'}</TableCell>
                    <TableCell>{shot.lens ?? '—'}</TableCell>
                    <TableCell>{shot.support ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {shot.notes ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {!selectedSceneId && scenes.length > 0 && (
        <p className="text-muted-foreground">Select a scene to view its shots.</p>
      )}
    </div>
  )
}
