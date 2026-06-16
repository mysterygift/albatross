import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  listScenesByProduction,
  listShotsByScene,
  createScene,
  createShot,
  deleteShot,
  updateScene,
  updateShot,
  type CreateShotInput,
} from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import {
  listShotCastByShotIds,
  addShotCast,
  removeShotCast,
  clearShotCastForScene,
} from '@/lib/db/repositories/shot-cast'
import { listCast } from '@/lib/db/repositories/person'
import {
  getLinkedSectionCountsByShotIds,
  listCharactersBySectionIds,
  listRangesBySectionIds,
  listSectionsByScene,
  listSectionsByShot,
  replaceShotSectionLinks,
} from '@/lib/db/repositories/scriptSections'
import { listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { ShotScriptSectionLinkDialog } from './shot-script-section-link-dialog'
import {
  listEpisodesByProduction,
  getEpisodeByIdForProductionIncludeArchived,
} from '@/lib/db/repositories/episodes'
import {
  listEquipmentTermsByProductionAndType,
  upsertEquipmentTerm,
} from '@/lib/db/repositories/equipment-terms'
import {
  addShotCastForActor,
  clearShotCastForSceneForActor,
  createSceneForActor,
  createShotForActor,
  deleteShotForActor,
  getEpisodeByIdForProductionIncludeArchivedForActor,
  listCastForActor,
  listEpisodesByProductionForActor,
  listEquipmentTermsByProductionAndTypeForActor,
  listLocationsByProductionForActor,
  listScenesByProductionForActor,
  listShotsBySceneForActor,
  listShotCastByShotIdsForActor,
  removeShotCastForActor,
  updateSceneForActor,
  updateShotForActor,
  upsertEquipmentTermForActor,
} from '@/lib/access/projectDomainService'
import type { Shot, Scene, ShotCast, ScriptVersion } from '@/lib/db/types'
import { SHOT_SIZE_VALUES, CAMERA_MOVEMENT_VALUES, SCENE_DAY_NIGHT_VALUES, SCENE_INT_EXT_VALUES } from '@/lib/db/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Pencil, Check, Plus, Trash2, Copy, UsersRound, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

/** Sentinel for "no selection" in Select; Radix forbids SelectItem value="". */
const SELECT_NONE = '__none__'

/** Aligns with `duration-200` on shared `DialogContent` so payload/form reset runs after exit animation. */
const SCHEDULE_DIALOG_EXIT_MS = 200
import {
  parseEstMinutes,
  parseDurationMmSs,
  shotEstMinutesSchema,
  shotDurationSecondsSchema,
} from './shot-list-validation'
import { invalidateStripboardCaches } from './stripboard-hooks'
import { nextShotNumberForDuplicate } from '@/lib/schedule/shotNumberDuplicate'

import { sceneScheduleLabel } from '@/lib/schedule/sceneDisplay'
import { sortScenesByNumber } from '@/lib/schedule/sceneFields'
import {
  DEFAULT_NEW_SCENE_DAY_NIGHT,
  DEFAULT_NEW_SCENE_INT_EXT,
  findDefaultSceneLocationId,
  resolveDefaultNewSceneLocationId,
} from '@/lib/schedule/sceneDefaults'

function formatDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function latestVersionForEpisodeScope(
  versions: ScriptVersion[],
  episodeId: string | null
): ScriptVersion | null {
  return versions.find((v) => (v.episode_id ?? null) === episodeId) ?? null
}

function shotLabelForDeleteConfirm(shot: Shot): string | null {
  const s = shot.shot_description?.trim() || shot.subject?.trim() || null
  return s
}

type EditableField =
  | 'shot_number'
  | 'subject'
  | 'shot_description'
  | 'shot_size'
  | 'duration_seconds'
  | 'estimated_shoot_minutes'
  | 'camera_movement'
  | 'lens'
  | 'support'
  | 'notes'

/** Add shot modal form; maps to `createShot` / `Shot` — no `location_id` on shots. */
type AddShotModalForm = {
  shot_number: string
  shot_description: string
  subject: string
  shot_size: Shot['shot_size'] | null
  support: string
  lens: string
  duration_mm_ss: string
  estimated_shoot_minutes: string
  camera_movement: Shot['camera_movement'] | null
  notes: string
  /** Person ids for `createShot` `person_ids` (normalized `shot_cast`). */
  cast_person_ids: string[]
}

function createEmptyAddShotForm(): AddShotModalForm {
  return {
    shot_number: '',
    shot_description: '',
    subject: '',
    shot_size: null,
    support: '',
    lens: '',
    duration_mm_ss: '',
    estimated_shoot_minutes: '',
    camera_movement: null,
    notes: '',
    cast_person_ids: [],
  }
}

function trimOrNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

/** Precondition: `shot_number` trimmed non-empty; duration/est. fields valid when non-empty. */
function buildCreateShotInput(sceneId: string, form: AddShotModalForm): CreateShotInput {
  const durationTrim = form.duration_mm_ss.trim()
  const estTrim = form.estimated_shoot_minutes.trim()
  const duration_seconds =
    durationTrim === '' ? null : parseDurationMmSs(durationTrim)!
  const estimated_shoot_minutes =
    estTrim === '' ? null : parseEstMinutes(form.estimated_shoot_minutes)!
  const personIds = form.cast_person_ids
  return {
    scene_id: sceneId,
    shot_number: form.shot_number.trim(),
    shot_description: trimOrNull(form.shot_description),
    subject: trimOrNull(form.subject),
    shot_size: form.shot_size ?? undefined,
    support: trimOrNull(form.support),
    lens: trimOrNull(form.lens),
    duration_seconds,
    estimated_shoot_minutes,
    camera_movement: form.camera_movement ?? undefined,
    notes: trimOrNull(form.notes),
    ...(personIds.length > 0 ? { person_ids: personIds } : {}),
  }
}

function buildDuplicateShotInput(
  source: Shot,
  newShotNumber: string,
  castPersonIds: string[]
): CreateShotInput {
  return {
    scene_id: source.scene_id,
    shot_number: newShotNumber,
    shot_description: source.shot_description,
    subject: source.subject,
    shot_size: source.shot_size ?? undefined,
    support: source.support,
    lens: source.lens,
    duration_seconds: source.duration_seconds,
    estimated_shoot_minutes: source.estimated_shoot_minutes,
    camera_movement: source.camera_movement ?? undefined,
    notes: source.notes,
    ...(castPersonIds.length > 0 ? { person_ids: castPersonIds } : {}),
  }
}

function messageForCreateShotError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (raw === 'NO_SCENE') return 'Select a scene before adding a shot.'
  if (raw === 'SHOT_NUMBER_REQUIRED') return 'Shot number is required.'
  if (raw === 'DURATION_INVALID') return 'Duration must be 0 or greater (use m:ss).'
  if (raw === 'EST_INVALID') return 'Est. minutes must be 0 or greater.'
  if (raw === 'scene_id is required') return 'Select a scene before adding a shot.'
  if (raw === 'shot_number is required') return 'Shot number is required.'
  if (raw.includes('already exists in this scene')) {
    return `A shot with this number already exists in this scene.`
  }
  if (raw === 'Scene not found or deleted') {
    return 'Scene not found or was removed. Select another scene.'
  }
  if (
    /^Person .+ not found or deleted:/.test(raw) ||
    /does not belong to this production/.test(raw) ||
    /is not cast \(is_cast\)/.test(raw)
  ) {
    return raw
  }
  if (/UNIQUE|constraint|SQLITE_CONSTRAINT/i.test(raw)) {
    return 'Could not create shot. Please try again.'
  }
  return 'Could not create shot. Please try again.'
}

function messageForUpdateShotError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (raw === 'shot_number is required') return 'Shot number is required.'
  if (raw.includes('already exists in this scene')) {
    return 'A shot with this number already exists in this scene.'
  }
  if (raw === 'Shot not found or deleted') {
    return 'Could not update shot. Please try again.'
  }
  if (/UNIQUE|constraint|SQLITE_CONSTRAINT/i.test(raw)) {
    return 'Could not update shot. Please try again.'
  }
  return 'Could not update shot. Please try again.'
}

export function ShotListPage() {
  const queryClient = useQueryClient()
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { dataSourceKey } = useEffectiveDataSourceForProduction(currentProductionId)
  const isRemoteProduction = dataSourceKey === 'remote_server'
  const authSession = useAuthSession()
  const isEpisodicProduction = currentProduction?.is_episodic === true
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editingCell, setEditingCell] = useState<{ shotId: string; field: EditableField } | null>(null)
  const [localValue, setLocalValue] = useState<string>('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addShotCastShotId, setAddShotCastShotId] = useState<string | null>(null)
  const [createSceneOpen, setCreateSceneOpen] = useState(false)
  const [createSceneError, setCreateSceneError] = useState<string | null>(null)
  const [newSceneNumber, setNewSceneNumber] = useState('')
  const [newSceneTitle, setNewSceneTitle] = useState('')
  const [newSceneIntExt, setNewSceneIntExt] = useState<Scene['int_ext']>(DEFAULT_NEW_SCENE_INT_EXT)
  const [newSceneDayNight, setNewSceneDayNight] = useState<Scene['day_night']>(DEFAULT_NEW_SCENE_DAY_NIGHT)
  const [newSceneLocationId, setNewSceneLocationId] = useState<string | null>(null)
  const [newSceneEpisodeId, setNewSceneEpisodeId] = useState('')
  const [editSceneOpen, setEditSceneOpen] = useState(false)
  const [editSceneError, setEditSceneError] = useState<string | null>(null)
  const [editSceneNumber, setEditSceneNumber] = useState('')
  const [editSceneTitle, setEditSceneTitle] = useState('')
  const [editSceneIntExt, setEditSceneIntExt] = useState<Scene['int_ext'] | null>(null)
  const [editSceneDayNight, setEditSceneDayNight] = useState<Scene['day_night'] | null>(null)
  const [editSceneLocationId, setEditSceneLocationId] = useState<string | null>(null)
  const [editSceneEpisodeId, setEditSceneEpisodeId] = useState('')
  const [addShotOpen, setAddShotOpen] = useState(false)
  const [addShotForm, setAddShotForm] = useState<AddShotModalForm>(() => createEmptyAddShotForm())
  const [addShotError, setAddShotError] = useState<string | null>(null)
  const addShotDialogResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteShotTarget, setDeleteShotTarget] = useState<{
    shot: Shot
    sceneId: string
  } | null>(null)
  const [deleteShotError, setDeleteShotError] = useState<string | null>(null)
  const deleteDialogResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [resetCastDialogOpen, setResetCastDialogOpen] = useState(false)
  const [resetCastError, setResetCastError] = useState<string | null>(null)
  const resetCastDialogResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAddShotDialogResetTimer = useCallback(() => {
    if (addShotDialogResetTimerRef.current != null) {
      clearTimeout(addShotDialogResetTimerRef.current)
      addShotDialogResetTimerRef.current = null
    }
  }, [])

  const scheduleAddShotDialogReset = useCallback(() => {
    clearAddShotDialogResetTimer()
    addShotDialogResetTimerRef.current = setTimeout(() => {
      addShotDialogResetTimerRef.current = null
      setAddShotError(null)
      setAddShotForm(createEmptyAddShotForm())
    }, SCHEDULE_DIALOG_EXIT_MS)
  }, [clearAddShotDialogResetTimer])

  const handleAddShotDialogOpenChange = useCallback(
    (open: boolean) => {
      setAddShotOpen(open)
      if (!open) {
        scheduleAddShotDialogReset()
      }
    },
    [scheduleAddShotDialogReset]
  )

  const clearDeleteDialogResetTimer = useCallback(() => {
    if (deleteDialogResetTimerRef.current != null) {
      clearTimeout(deleteDialogResetTimerRef.current)
      deleteDialogResetTimerRef.current = null
    }
  }, [])

  const scheduleDeleteDialogReset = useCallback(() => {
    clearDeleteDialogResetTimer()
    deleteDialogResetTimerRef.current = setTimeout(() => {
      deleteDialogResetTimerRef.current = null
      setDeleteShotTarget(null)
      setDeleteShotError(null)
    }, SCHEDULE_DIALOG_EXIT_MS)
  }, [clearDeleteDialogResetTimer])

  const handleDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      setDeleteDialogOpen(open)
      if (!open) {
        scheduleDeleteDialogReset()
      }
    },
    [scheduleDeleteDialogReset]
  )

  const clearResetCastDialogResetTimer = useCallback(() => {
    if (resetCastDialogResetTimerRef.current != null) {
      clearTimeout(resetCastDialogResetTimerRef.current)
      resetCastDialogResetTimerRef.current = null
    }
  }, [])

  const scheduleResetCastDialogReset = useCallback(() => {
    clearResetCastDialogResetTimer()
    resetCastDialogResetTimerRef.current = setTimeout(() => {
      resetCastDialogResetTimerRef.current = null
      setResetCastError(null)
    }, SCHEDULE_DIALOG_EXIT_MS)
  }, [clearResetCastDialogResetTimer])

  const handleResetCastDialogOpenChange = useCallback(
    (open: boolean) => {
      setResetCastDialogOpen(open)
      if (!open) {
        scheduleResetCastDialogReset()
      }
    },
    [scheduleResetCastDialogReset]
  )

  useEffect(() => {
    return () => {
      clearAddShotDialogResetTimer()
      clearDeleteDialogResetTimer()
    }
  }, [clearAddShotDialogResetTimer, clearDeleteDialogResetTimer])

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listScenesByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listScenesByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const scenesByNumber = useMemo(() => sortScenesByNumber(scenes), [scenes])

  const { data: shots = [] } = useQuery({
    queryKey: ['shots', selectedSceneId],
    queryFn: async () => {
      if (!selectedSceneId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShotsBySceneForActor({
          db,
          actor: authSession.currentUser,
          sceneId: selectedSceneId,
        })
      }
      return listShotsByScene(
        selectedSceneId,
        currentProductionId ? { productionId: currentProductionId } : undefined,
      )
    },
    enabled: !!selectedSceneId,
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listLocationsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listLocationsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: activeEpisodes = [] } = useQuery({
    queryKey: ['episodes', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listEpisodesByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listEpisodesByProduction(currentProductionId)
    },
    enabled: !!currentProductionId && isEpisodicProduction,
  })

  const { data: editArchivedEpisode } = useQuery({
    queryKey: ['episode-include-archived', currentProductionId, editSceneEpisodeId],
    queryFn: async () => {
      if (!currentProductionId) return null
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getEpisodeByIdForProductionIncludeArchivedForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          episodeId: editSceneEpisodeId,
        })
      }
      return getEpisodeByIdForProductionIncludeArchived(currentProductionId, editSceneEpisodeId)
    },
    enabled:
      !!currentProductionId &&
      isEpisodicProduction &&
      editSceneOpen &&
      editSceneEpisodeId.length > 0 &&
      !activeEpisodes.some((e) => e.id === editSceneEpisodeId),
  })

  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCastForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listCast(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const shotIds = useMemo(() => shots.map((s) => s.id), [shots])
  const { data: shotCastByShotId = new Map<string, ShotCast[]>() } = useQuery({
    queryKey: ['shot-cast-by-shot-ids', shotIds.join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return listShotCastByShotIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          shotIds,
        })
      }
      return listShotCastByShotIds(shotIds)
    },
    enabled: shotIds.length > 0,
  })

  const castById = useMemo(() => new Map(cast.map((c) => [c.id, c])), [cast])
  /** Union of cast on any shot in the selected scene (read-only summary). */
  const castInScene = useMemo(() => {
    const personIds = new Set<string>()
    for (const shotId of shotIds) {
      for (const sc of shotCastByShotId.get(shotId) ?? []) {
        personIds.add(sc.person_id)
      }
    }
    return [...personIds]
      .map((personId) => castById.get(personId))
      .filter((p): p is NonNullable<typeof p> => p != null)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [shotIds, shotCastByShotId, castById])

  // ─── Shot <-> script section linking (SB4) ─────────────────────────────────
  const { data: sceneSections = [] } = useQuery({
    queryKey: ['sections-by-scene', selectedSceneId],
    queryFn: async () => {
      if (!selectedSceneId) return []
      return listSectionsByScene(selectedSceneId)
    },
    enabled: !!selectedSceneId,
  })

  const sceneSectionIds = useMemo(() => sceneSections.map((s) => s.id), [sceneSections])
  const { data: sceneSectionRanges = new Map() } = useQuery({
    queryKey: ['section-ranges', sceneSectionIds.join(',')],
    queryFn: async () => listRangesBySectionIds(sceneSectionIds),
    enabled: sceneSectionIds.length > 0,
  })

  const { data: sceneSectionCharacters = new Map() } = useQuery({
    queryKey: ['section-characters', sceneSectionIds.join(',')],
    queryFn: async () => listCharactersBySectionIds(sceneSectionIds),
    enabled: sceneSectionIds.length > 0,
  })

  const { data: sectionCountByShotId = new Map<string, number>() } = useQuery({
    queryKey: ['shot-section-counts', shotIds.join(',')],
    queryFn: async () => getLinkedSectionCountsByShotIds(shotIds),
    enabled: shotIds.length > 0,
  })

  const { data: scriptVersions = [] } = useQuery({
    queryKey: ['script-versions', currentProductionId],
    queryFn: () => listScriptVersionsByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const selectedSceneForScope = scenes.find((s) => s.id === selectedSceneId)
  const scopedEpisodeId = selectedSceneForScope?.episode_id ?? null
  const latestScriptVersion = useMemo(
    () => latestVersionForEpisodeScope(scriptVersions, scopedEpisodeId),
    [scriptVersions, scopedEpisodeId]
  )

  const { data: outdatedLinkShotIds = new Set<string>() } = useQuery({
    queryKey: ['shot-outdated-section-links', shotIds.join(','), latestScriptVersion?.id],
    queryFn: async () => {
      const outdated = new Set<string>()
      if (!latestScriptVersion) return outdated
      for (const shotId of shotIds) {
        const linked = await listSectionsByShot(shotId)
        if (linked.some((s) => s.script_version_id !== latestScriptVersion.id)) {
          outdated.add(shotId)
        }
      }
      return outdated
    },
    enabled: !!latestScriptVersion && shotIds.length > 0,
  })

  const [manageSectionsShotId, setManageSectionsShotId] = useState<string | null>(null)
  const [sectionLinkError, setSectionLinkError] = useState<string | null>(null)

  const { data: linkedSectionsForShot = [] } = useQuery({
    queryKey: ['shot-linked-sections', manageSectionsShotId],
    queryFn: async () => {
      if (!manageSectionsShotId) return []
      return listSectionsByShot(manageSectionsShotId)
    },
    enabled: !!manageSectionsShotId,
  })

  const linkedSectionIds = useMemo(
    () => linkedSectionsForShot.map((s) => s.id),
    [linkedSectionsForShot]
  )

  const replaceShotSectionsMutation = useMutation({
    mutationFn: async ({ shotId, sectionIds }: { shotId: string; sectionIds: string[] }) => {
      await replaceShotSectionLinks(shotId, sectionIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shot-section-counts'] })
      queryClient.invalidateQueries({ queryKey: ['shot-linked-sections'] })
      queryClient.invalidateQueries({ queryKey: ['section-shot-counts'] })
      queryClient.invalidateQueries({ queryKey: ['section-linked-shots'] })
      queryClient.invalidateQueries({ queryKey: ['scene-shot-section-counts'] })
      setSectionLinkError(null)
      setManageSectionsShotId(null)
    },
    onError: (e) => {
      setSectionLinkError(e instanceof Error ? e.message : 'Could not save section links.')
      console.error('Shot section link save failed', e)
    },
  })

  const addShotCastMutation = useMutation({
    mutationFn: async ({ shotId, personId }: { shotId: string; personId: string }) => {
      if (!currentProductionId) return
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await addShotCastForActor({
          db,
          actor: authSession.currentUser,
          data: {
            production_id: currentProductionId,
            shot_id: shotId,
            person_id: personId,
          },
        })
      } else {
        await addShotCast({
          production_id: currentProductionId,
          shot_id: shotId,
          person_id: personId,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shot-cast-by-shot-ids'] })
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-scene', selectedSceneId] })
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-person'] })
      setAddShotCastShotId(null)
    },
    onError: () => {
      setSaveError('Could not add cast to shot. Please try again.')
    },
  })

  const resetSceneCastMutation = useMutation({
    mutationFn: async (sceneId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return clearShotCastForSceneForActor({
          db,
          actor: authSession.currentUser,
          sceneId,
        })
      }
      return clearShotCastForScene(sceneId)
    },
    onSuccess: (_void, sceneId) => {
      queryClient.invalidateQueries({ queryKey: ['shot-cast-by-shot-ids'] })
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-scene', sceneId] })
      queryClient.invalidateQueries({ queryKey: ['cast-by-scene'] })
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-person'] })
      if (currentProductionId) {
        queryClient.invalidateQueries({ queryKey: ['dood-scenes-by-day', currentProductionId] })
      }
      handleResetCastDialogOpenChange(false)
    },
    onError: () => {
      setResetCastError('Could not reset cast for this scene. Please try again.')
    },
  })

  const removeShotCastMutation = useMutation({
    mutationFn: async (shotCastId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return removeShotCastForActor({
          db,
          actor: authSession.currentUser,
          shotCastId,
        })
      }
      return removeShotCast(shotCastId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shot-cast-by-shot-ids'] })
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-scene', selectedSceneId] })
      queryClient.invalidateQueries({ queryKey: ['cast-by-scene'] })
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-person'] })
      if (currentProductionId) {
        queryClient.invalidateQueries({ queryKey: ['dood-scenes-by-day', currentProductionId] })
      }
    },
    onError: () => {
      setSaveError('Could not remove cast from shot. Please try again.')
    },
  })

  const prepareNewSceneForm = useCallback(async () => {
    setCreateSceneError(null)
    setNewSceneNumber('')
    setNewSceneTitle('')
    setNewSceneIntExt(DEFAULT_NEW_SCENE_INT_EXT)
    setNewSceneDayNight(DEFAULT_NEW_SCENE_DAY_NIGHT)
    setNewSceneEpisodeId(activeEpisodes[0]?.id ?? '')
    if (!currentProductionId) {
      setNewSceneLocationId(null)
      return
    }
    const existingId = findDefaultSceneLocationId(locations)
    if (existingId) {
      setNewSceneLocationId(existingId)
      return
    }
    const id = await resolveDefaultNewSceneLocationId(currentProductionId, locations)
    setNewSceneLocationId(id)
    await queryClient.refetchQueries({ queryKey: ['locations', currentProductionId] })
  }, [activeEpisodes, currentProductionId, locations, queryClient])

  const createSceneMutation = useMutation({
    mutationFn: async () => {
      if (!currentProductionId) {
        throw new Error('No production selected')
      }
      const sceneNumber = newSceneNumber.trim()
      if (!sceneNumber) {
        throw new Error('Scene number is required')
      }
      if (isEpisodicProduction && !newSceneEpisodeId.trim()) {
        throw new Error('Episode is required')
      }
      setCreateSceneError(null)
      const intExt = newSceneIntExt ?? DEFAULT_NEW_SCENE_INT_EXT
      const dayNight = newSceneDayNight ?? DEFAULT_NEW_SCENE_DAY_NIGHT
      const title = newSceneTitle.trim() || sceneNumber
      let locationId = newSceneLocationId
      if (!locationId) {
        locationId = await resolveDefaultNewSceneLocationId(currentProductionId, locations)
      }
      const payload = {
        production_id: currentProductionId,
        scene_number: sceneNumber,
        title,
        int_ext: intExt,
        day_night: dayNight,
        location_id: locationId,
        ...(isEpisodicProduction ? { episode_id: newSceneEpisodeId.trim() } : {}),
      }
      const scene =
        authSession.authSupported && authSession.currentUser
          ? await (async () => {
              const db = await getDb()
              return createSceneForActor({
                db,
                actor: authSession.currentUser!,
                data: payload,
              })
            })()
          : await createScene(payload)
      return scene
    },
    onSuccess: (scene) => {
      setCreateSceneOpen(false)
      setCreateSceneError(null)
      setNewSceneNumber('')
      setNewSceneTitle('')
      setNewSceneIntExt(DEFAULT_NEW_SCENE_INT_EXT)
      setNewSceneDayNight(DEFAULT_NEW_SCENE_DAY_NIGHT)
      setNewSceneLocationId(null)
      setNewSceneEpisodeId('')
      queryClient.invalidateQueries({ queryKey: ['locations', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['scenes', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      setSelectedSceneId(scene.id)
      setEditingCell(null)
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not create scene. Please try again.'
      if (/UNIQUE|constraint|SQLITE_CONSTRAINT/i.test(message)) {
        setCreateSceneError('A scene with this number already exists in this production.')
      } else if (message === 'Scene number is required') {
        setCreateSceneError('Scene number is required.')
      } else if (message === 'No production selected') {
        setCreateSceneError('Select a production before creating scenes.')
      } else if (message === 'Episode is required') {
        setCreateSceneError('Choose an episode for this scene.')
      } else if (
        message.includes('Episodic productions require an episode') ||
        message.includes('Episode not found or archived') ||
        message.includes('Episode cannot be set for non-episodic')
      ) {
        setCreateSceneError(message)
      } else {
        setCreateSceneError('Could not create scene. Please try again.')
      }
    },
  })

  const updateSceneMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSceneId) {
        throw new Error('No scene selected')
      }
      const sceneNumber = editSceneNumber.trim()
      if (!sceneNumber) {
        throw new Error('Scene number is required')
      }
      if (isEpisodicProduction && !editSceneEpisodeId.trim()) {
        throw new Error('Episode is required')
      }
      setEditSceneError(null)
      const payload = {
        scene_number: sceneNumber,
        title: editSceneTitle.trim() || null,
        int_ext: editSceneIntExt ?? null,
        day_night: editSceneDayNight ?? null,
        location_id: editSceneLocationId ?? null,
        ...(isEpisodicProduction ? { episode_id: editSceneEpisodeId.trim() } : {}),
      }
      const scene =
        authSession.authSupported && authSession.currentUser
          ? await (async () => {
              const db = await getDb()
              return updateSceneForActor({
                db,
                actor: authSession.currentUser!,
                sceneId: selectedSceneId,
                data: payload,
              })
            })()
          : await updateScene(selectedSceneId, payload)
      return scene
    },
    onSuccess: () => {
      setEditSceneOpen(false)
      setEditSceneError(null)
      queryClient.invalidateQueries({ queryKey: ['scenes', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not update scene. Please try again.'
      if (/UNIQUE|constraint|SQLITE_CONSTRAINT/i.test(message)) {
        setEditSceneError('A scene with this number already exists in this production.')
      } else if (message === 'Scene number is required') {
        setEditSceneError('Scene number is required.')
      } else if (message === 'No scene selected') {
        setEditSceneError('No scene selected.')
      } else if (message === 'Episode is required') {
        setEditSceneError('Choose an episode for this scene.')
      } else if (
        message.includes('Episodic scenes must stay assigned') ||
        message.includes('Episode not found or archived') ||
        message.includes('Episode cannot be set for non-episodic')
      ) {
        setEditSceneError(message)
      } else {
        setEditSceneError('Could not update scene. Please try again.')
      }
    },
  })

  const { data: lensTerms = [] } = useQuery({
    queryKey: ['equipment-terms', currentProductionId, 'LENS'],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listEquipmentTermsByProductionAndTypeForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          type: 'LENS',
        })
      }
      return listEquipmentTermsByProductionAndType(currentProductionId, 'LENS')
    },
    enabled: !!currentProductionId,
  })

  const { data: supportTerms = [] } = useQuery({
    queryKey: ['equipment-terms', currentProductionId, 'SUPPORT'],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listEquipmentTermsByProductionAndTypeForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          type: 'SUPPORT',
        })
      }
      return listEquipmentTermsByProductionAndType(currentProductionId, 'SUPPORT')
    },
    enabled: !!currentProductionId,
  })

  const updateShotMutation = useMutation({
    mutationFn: async ({ shotId, data }: { shotId: string; data: Partial<Shot> }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return updateShotForActor({
          db,
          actor: authSession.currentUser,
          shotId,
          data,
        })
      }
      return updateShot(shotId, data)
    },
    onSuccess: () => {
      setEditingCell(null)
      setSaveError(null)
      queryClient.invalidateQueries({ queryKey: ['shots', selectedSceneId] })
      queryClient.invalidateQueries({ queryKey: ['shots', currentProductionId ?? ''] })
      if (currentProductionId) {
        void invalidateStripboardCaches(queryClient, currentProductionId)
      }
      queryClient.invalidateQueries({ queryKey: ['equipment-terms'] })
    },
    onError: (error) => {
      setSaveError(messageForUpdateShotError(error))
    },
  })

  const createShotMutation = useMutation({
    mutationFn: async (args: {
      sceneId: string
      form: AddShotModalForm
      productionId: string | null
    }) => {
      const { sceneId, form, productionId } = args
      if (!sceneId) throw new Error('NO_SCENE')

      const trimmed = form.shot_number.trim()
      if (!trimmed) throw new Error('SHOT_NUMBER_REQUIRED')

      if (form.duration_mm_ss.trim()) {
        const sec = parseDurationMmSs(form.duration_mm_ss.trim())
        if (sec === null) throw new Error('DURATION_INVALID')
      }
      if (form.estimated_shoot_minutes.trim()) {
        const parsed = parseEstMinutes(form.estimated_shoot_minutes)
        if (parsed === null) throw new Error('EST_INVALID')
      }

      const lensStr = form.lens.trim()
      const supportStr = form.support.trim()
      if (productionId) {
        if (lensStr) {
          if (authSession.authSupported && authSession.currentUser) {
            const db = await getDb()
            await upsertEquipmentTermForActor({
              db,
              actor: authSession.currentUser,
              productionId,
              type: 'LENS',
              value: lensStr,
            })
          } else {
            await upsertEquipmentTerm(productionId, 'LENS', lensStr)
          }
        }
        if (supportStr) {
          if (authSession.authSupported && authSession.currentUser) {
            const db = await getDb()
            await upsertEquipmentTermForActor({
              db,
              actor: authSession.currentUser,
              productionId,
              type: 'SUPPORT',
              value: supportStr,
            })
          } else {
            await upsertEquipmentTerm(productionId, 'SUPPORT', supportStr)
          }
        }
      }

      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createShotForActor({
          db,
          actor: authSession.currentUser,
          data: buildCreateShotInput(sceneId, form),
        })
      }
      return createShot(buildCreateShotInput(sceneId, form))
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shots', variables.sceneId] })
      if (variables.form.cast_person_ids.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['scene-cast-by-scene', variables.sceneId] })
      }
      if (variables.productionId) {
        if (variables.form.lens.trim()) {
          queryClient.invalidateQueries({
            queryKey: ['equipment-terms', variables.productionId, 'LENS'],
          })
        }
        if (variables.form.support.trim()) {
          queryClient.invalidateQueries({
            queryKey: ['equipment-terms', variables.productionId, 'SUPPORT'],
          })
        }
      }
      handleAddShotDialogOpenChange(false)
    },
    onError: (error) => {
      setAddShotError(messageForCreateShotError(error))
    },
  })

  const duplicateShotMutation = useMutation({
    mutationFn: async (args: {
      sceneId: string
      sourceShotId: string
      productionId: string | null
    }) => {
      const { sourceShotId, productionId } = args
      const source = shots.find((s) => s.id === sourceShotId)
      if (!source) throw new Error('SHOT_NOT_FOUND')

      const existingNumbers = shots.map((s) => s.shot_number)
      const newShotNumber = nextShotNumberForDuplicate(source.shot_number, existingNumbers)
      const castPersonIds = (shotCastByShotId.get(sourceShotId) ?? []).map((sc) => sc.person_id)
      const input = buildDuplicateShotInput(source, newShotNumber, castPersonIds)

      const lensStr = source.lens?.trim() ?? ''
      const supportStr = source.support?.trim() ?? ''
      if (productionId) {
        if (lensStr) {
          if (authSession.authSupported && authSession.currentUser) {
            const db = await getDb()
            await upsertEquipmentTermForActor({
              db,
              actor: authSession.currentUser,
              productionId,
              type: 'LENS',
              value: lensStr,
            })
          } else {
            await upsertEquipmentTerm(productionId, 'LENS', lensStr)
          }
        }
        if (supportStr) {
          if (authSession.authSupported && authSession.currentUser) {
            const db = await getDb()
            await upsertEquipmentTermForActor({
              db,
              actor: authSession.currentUser,
              productionId,
              type: 'SUPPORT',
              value: supportStr,
            })
          } else {
            await upsertEquipmentTerm(productionId, 'SUPPORT', supportStr)
          }
        }
      }

      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createShotForActor({
          db,
          actor: authSession.currentUser,
          data: input,
        })
      }
      return createShot(input)
    },
    onSuccess: (_result, variables) => {
      const source = shots.find((s) => s.id === variables.sourceShotId)
      const castCount = shotCastByShotId.get(variables.sourceShotId)?.length ?? 0
      queryClient.invalidateQueries({ queryKey: ['shots', variables.sceneId] })
      if (castCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['scene-cast-by-scene', variables.sceneId] })
      }
      if (variables.productionId && source) {
        if (source.lens?.trim()) {
          queryClient.invalidateQueries({
            queryKey: ['equipment-terms', variables.productionId, 'LENS'],
          })
        }
        if (source.support?.trim()) {
          queryClient.invalidateQueries({
            queryKey: ['equipment-terms', variables.productionId, 'SUPPORT'],
          })
        }
      }
      setSaveError(null)
    },
    onError: (error) => {
      const raw = error instanceof Error ? error.message : String(error)
      if (raw === 'SHOT_NOT_FOUND') {
        setSaveError('Could not duplicate shot. Please try again.')
        return
      }
      if (/Could not find an available shot number/.test(raw)) {
        setSaveError('Could not find an available shot number for this duplicate.')
        return
      }
      if (/empty shot number/.test(raw)) {
        setSaveError('Could not duplicate shot: source shot number is empty.')
        return
      }
      setSaveError(messageForCreateShotError(error))
    },
  })

  const deleteShotMutation = useMutation({
    mutationFn: async (args: { shotId: string; sceneId: string }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await deleteShotForActor({
          db,
          actor: authSession.currentUser,
          shotId: args.shotId,
        })
        return
      }
      await deleteShot(args.shotId)
    },
    onSuccess: (_void, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shots', variables.sceneId] })
      setEditingCell((c) => (c?.shotId === variables.shotId ? null : c))
      handleDeleteDialogOpenChange(false)
    },
    onError: () => {
      setDeleteShotError('Could not delete shot. Please try again.')
    },
  })

  const sortedShots = useMemo(
    () =>
      [...shots].sort((a, b) =>
        a.shot_number.localeCompare(b.shot_number, undefined, { numeric: true })
      ),
    [shots]
  )

  const selectedScene = scenes.find((s) => s.id === selectedSceneId)
  const getLocationName = (locationId: string | null) =>
    locationId ? locations.find((l) => l.id === locationId)?.name ?? null : null

  const editEpisodeSelectOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = []
    const arc = editArchivedEpisode
    if (arc?.deleted_at && arc.id === editSceneEpisodeId) {
      opts.push({ id: arc.id, label: `${arc.name} (archived)` })
    }
    for (const e of activeEpisodes) {
      if (!opts.some((o) => o.id === e.id)) opts.push({ id: e.id, label: e.name })
    }
    return opts
  }, [activeEpisodes, editArchivedEpisode, editSceneEpisodeId])

  const commitEdit = (shotId: string, field: EditableField, value: string | number | null) => {
    setSaveError(null)
    const shot = shots.find((s) => s.id === shotId)
    if (!shot) return

    if (field === 'shot_number') {
      const trimmed =
        typeof value === 'string' ? value.trim() : String(value ?? '').trim()
      if (!trimmed) {
        setSaveError('Shot number is required.')
        return
      }
      if (trimmed === shot.shot_number) {
        setEditingCell(null)
        return
      }
      updateShotMutation.mutate({ shotId, data: { shot_number: trimmed } })
      return
    }

    if (field === 'estimated_shoot_minutes') {
      const parsed = parseEstMinutes(typeof value === 'string' ? value : String(value ?? ''))
      const validated = shotEstMinutesSchema.safeParse(parsed)
      if (!validated.success) {
        setSaveError('Est. min must be 0 or greater')
        return
      }
      setSaveError(null)
      updateShotMutation.mutate({
        shotId,
        data: { estimated_shoot_minutes: validated.data },
      })
      return
    }
    if (field === 'duration_seconds') {
      const parsed =
        typeof value === 'number' ? value : parseDurationMmSs(typeof value === 'string' ? value : '')
      const validated = shotDurationSecondsSchema.safeParse(parsed)
      if (!validated.success) {
        setSaveError('Duration must be 0 or greater (use m:ss)')
        return
      }
      setSaveError(null)
      updateShotMutation.mutate({
        shotId,
        data: { duration_seconds: validated.data },
      })
      return
    }
    if (field === 'lens') {
      const str = typeof value === 'string' ? value.trim() : ''
      if (str && currentProductionId) {
        if (authSession.authSupported && authSession.currentUser) {
          getDb()
            .then((db) =>
              upsertEquipmentTermForActor({
                db,
                actor: authSession.currentUser!,
                productionId: currentProductionId,
                type: 'LENS',
                value: str,
              })
            )
            .then(() => {
              updateShotMutation.mutate({ shotId, data: { lens: str } })
            })
        } else {
          upsertEquipmentTerm(currentProductionId, 'LENS', str).then(() => {
            updateShotMutation.mutate({ shotId, data: { lens: str } })
          })
        }
      } else {
        updateShotMutation.mutate({ shotId, data: { lens: null } })
      }
      return
    }
    if (field === 'support') {
      const str = typeof value === 'string' ? value.trim() : ''
      if (str && currentProductionId) {
        if (authSession.authSupported && authSession.currentUser) {
          getDb()
            .then((db) =>
              upsertEquipmentTermForActor({
                db,
                actor: authSession.currentUser!,
                productionId: currentProductionId,
                type: 'SUPPORT',
                value: str,
              })
            )
            .then(() => {
              updateShotMutation.mutate({ shotId, data: { support: str } })
            })
        } else {
          upsertEquipmentTerm(currentProductionId, 'SUPPORT', str).then(() => {
            updateShotMutation.mutate({ shotId, data: { support: str } })
          })
        }
      } else {
        updateShotMutation.mutate({ shotId, data: { support: null } })
      }
      return
    }

    const payload: Partial<Shot> = {}
    if (field === 'subject') payload.subject = value === '' ? null : String(value)
    if (field === 'shot_description') payload.shot_description = value === '' ? null : String(value)
    if (field === 'shot_size')
      payload.shot_size = value === '' || value === null ? null : (value as Shot['shot_size'])
    if (field === 'camera_movement')
      payload.camera_movement =
        value === '' || value === null ? null : (value as Shot['camera_movement'])
    if (field === 'notes') payload.notes = value === '' ? null : String(value)
    if (Object.keys(payload).length > 0) {
      updateShotMutation.mutate({ shotId, data: payload })
    }
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setSaveError(null)
  }

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
          <Label className="mb-2 block text-sm text-muted-foreground">Scene</Label>
          <Select
            value={selectedSceneId ?? SELECT_NONE}
            onValueChange={(v) => {
              setSelectedSceneId(v === SELECT_NONE ? null : v)
              setEditingCell(null)
            }}
          >
            <SelectTrigger
              className={cn(
                'h-9 w-full bg-zinc-800/80 text-zinc-200 border-zinc-600',
                'hover:bg-zinc-700/80 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500'
              )}
            >
              <SelectValue placeholder="Select scene…" />
            </SelectTrigger>
            <SelectContent
              className="bg-zinc-800 border-zinc-600 shadow-xl"
              sideOffset={4}
            >
              <SelectItem
                value={SELECT_NONE}
                className="text-zinc-300 focus:bg-zinc-700 focus:text-zinc-100 data-[highlight]:bg-emerald-600/20 data-[highlight]:text-emerald-100"
              >
                Select scene…
              </SelectItem>
              {scenesByNumber.map((s) => (
                <SelectItem
                  key={s.id}
                  value={s.id}
                  className="text-zinc-300 focus:bg-zinc-700 focus:text-zinc-100 data-[highlight]:bg-emerald-600/20 data-[highlight]:text-emerald-100"
                >
                  {s.scene_number}. {sceneScheduleLabel(s, getLocationName(s.location_id))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 border-zinc-600 text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100"
            onClick={async () => {
              await prepareNewSceneForm()
              setCreateSceneOpen(true)
            }}
            disabled={!currentProductionId}
          >
            <Plus className="mr-1.5 size-4" />
            New scene
          </Button>
          {selectedSceneId && selectedScene && (
            <Button
              type="button"
              variant="outline"
              className="h-9 border-zinc-600 text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100"
              onClick={() => {
                setEditSceneNumber(selectedScene.scene_number)
                setEditSceneTitle(selectedScene.title ?? '')
                setEditSceneIntExt(selectedScene.int_ext ?? null)
                setEditSceneDayNight(selectedScene.day_night ?? null)
                setEditSceneLocationId(selectedScene.location_id ?? null)
                setEditSceneEpisodeId(selectedScene.episode_id ?? '')
                setEditSceneError(null)
                setEditSceneOpen(true)
              }}
              disabled={!currentProductionId}
            >
              <Pencil className="mr-1.5 size-4" />
              Edit scene
            </Button>
          )}
        </div>
      </div>

      {selectedSceneId && (
        <>
          <Card className="border-zinc-700 bg-zinc-800/50">
            <CardHeader className="border-b border-zinc-700 py-3">
              <CardTitle className="text-sm font-medium text-zinc-200">Cast in this scene</CardTitle>
            </CardHeader>
            <CardContent className="py-3">
              {castInScene.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No cast on any shot in this scene. Add cast to individual shots in the list below.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {castInScene.map((person) => (
                    <span
                      key={person.id}
                      className="inline-flex items-center rounded-md bg-zinc-700/80 px-2.5 py-1 text-sm text-zinc-200"
                    >
                      {person.name}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {shots.length} shot{shots.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              {saveError && (
                <span className="text-sm text-destructive" role="alert">
                  {saveError}
                </span>
              )}
              {editMode && selectedSceneId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-zinc-600 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                  onClick={() => {
                    clearResetCastDialogResetTimer()
                    setResetCastError(null)
                    setResetCastDialogOpen(true)
                  }}
                  disabled={resetSceneCastMutation.isPending || castInScene.length === 0}
                >
                  <UsersRound className="size-3.5" />
                  Reset cast
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-zinc-600 text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100"
                onClick={() => {
                  clearAddShotDialogResetTimer()
                  setAddShotError(null)
                  setAddShotForm(createEmptyAddShotForm())
                  setAddShotOpen(true)
                }}
              >
                <Plus className="size-3.5" />
                Add shot
              </Button>
              <Button
                variant={editMode ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'gap-1.5',
                  editMode && 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                )}
                onClick={() => {
                  setEditMode((v) => !v)
                  if (editMode) setEditingCell(null)
                }}
              >
                <Pencil className="size-3.5" />
                {editMode ? 'Editing...' : 'Edit'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-0 bg-zinc-800/90 hover:bg-zinc-800/90">
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">
                    Scene / Shot #
                  </TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Subject</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">
                    Shot Description
                  </TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Shot size</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Duration</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Est. min</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Movement</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Lens</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Support</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Notes</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3 w-[180px]">Cast</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3 w-[170px]">Sections</TableHead>
                  {editMode && (
                    <TableHead className="text-zinc-100 font-medium h-11 px-2 w-20 text-right">
                      <span className="sr-only">Shot actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shots.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={editMode ? 13 : 12}
                      className="text-muted-foreground text-center py-8"
                    >
                      No shots. Add shots to this scene to see them here and on the stripboard.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedShots.map((shot) => (
                    <ShotRow
                      key={shot.id}
                      shot={shot}
                      sceneNumber={selectedScene?.scene_number ?? ''}
                      editMode={editMode}
                      editingCell={editingCell}
                      localValue={localValue}
                      setEditingCell={setEditingCell}
                      setLocalValue={setLocalValue}
                      commitEdit={commitEdit}
                      cancelEdit={cancelEdit}
                      lensOptions={lensTerms.map((t) => t.value)}
                      supportOptions={supportTerms.map((t) => t.value)}
                      isSaving={updateShotMutation.isPending}
                      shotCastList={shotCastByShotId.get(shot.id) ?? []}
                      castById={castById}
                      onRemoveShotCast={removeShotCastMutation.mutate}
                      onAddCastClick={() => setAddShotCastShotId(shot.id)}
                      isRemovingShotCast={removeShotCastMutation.isPending}
                      linkedSectionCount={sectionCountByShotId.get(shot.id) ?? 0}
                      sectionLinksNeedReview={outdatedLinkShotIds.has(shot.id)}
                      onManageSectionsClick={() => setManageSectionsShotId(shot.id)}
                      onDuplicate={
                        editMode && selectedSceneId
                          ? (s) => {
                              setSaveError(null)
                              duplicateShotMutation.mutate({
                                sceneId: selectedSceneId,
                                sourceShotId: s.id,
                                productionId: currentProductionId,
                              })
                            }
                          : undefined
                      }
                      isDuplicatePending={
                        duplicateShotMutation.isPending &&
                        duplicateShotMutation.variables?.sourceShotId === shot.id
                      }
                      onRequestDelete={
                        editMode && selectedSceneId
                          ? (s) => {
                              clearDeleteDialogResetTimer()
                              setDeleteShotError(null)
                              setDeleteShotTarget({ shot: s, sceneId: selectedSceneId })
                              setDeleteDialogOpen(true)
                            }
                          : undefined
                      }
                      isDeletePending={
                        deleteShotMutation.isPending &&
                        deleteShotMutation.variables?.shotId === shot.id
                      }
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={resetCastDialogOpen} onOpenChange={handleResetCastDialogOpenChange}>
        <DialogContent className="max-w-md bg-zinc-800 border-zinc-600">
          <h3 className="text-base font-semibold text-zinc-100">Reset cast for scene</h3>
          {selectedScene && (
            <p className="text-sm text-zinc-300 mt-1">
              Remove all cast from every shot in scene{' '}
              <span className="font-medium text-zinc-100">{selectedScene.scene_number}</span>? This
              cannot be undone from this screen, but you can add cast back to individual shots
              afterward.
            </p>
          )}
          {resetCastError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
              {resetCastError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleResetCastDialogOpenChange(false)}
              disabled={resetSceneCastMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={resetSceneCastMutation.isPending || !selectedSceneId}
              onClick={() => {
                if (!selectedSceneId) return
                setResetCastError(null)
                resetSceneCastMutation.mutate(selectedSceneId)
              }}
            >
              {resetSceneCastMutation.isPending ? 'Resetting…' : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
        <DialogContent className="max-w-md bg-zinc-800 border-zinc-600">
          <h3 className="text-base font-semibold text-zinc-100">Delete shot</h3>
          {deleteShotTarget && (
            <>
              <p className="text-sm text-zinc-300 mt-1">
                Are you sure you want to delete shot{' '}
                <span className="font-medium text-zinc-100">{deleteShotTarget.shot.shot_number}</span>
                {' '}
                in scene{' '}
                {scenes.find((sc) => sc.id === deleteShotTarget.sceneId)?.scene_number ??
                  deleteShotTarget.sceneId}
                ?
              </p>
              {(() => {
                const line = shotLabelForDeleteConfirm(deleteShotTarget.shot)
                return line ? (
                  <p className="text-sm text-zinc-400 mt-2 line-clamp-3">&ldquo;{line}&rdquo;</p>
                ) : null
              })()}
            </>
          )}
          {deleteShotError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
              {deleteShotError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleDeleteDialogOpenChange(false)}
              disabled={deleteShotMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteShotMutation.isPending || !deleteShotTarget}
              onClick={() => {
                if (!deleteShotTarget) return
                setDeleteShotError(null)
                deleteShotMutation.mutate({
                  shotId: deleteShotTarget.shot.id,
                  sceneId: deleteShotTarget.sceneId,
                })
              }}
            >
              {deleteShotMutation.isPending ? 'Deleting…' : 'Delete shot'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {!selectedSceneId && scenes.length > 0 && (
        <p className="text-muted-foreground">Select a scene to view its shots.</p>
      )}

      <Dialog open={createSceneOpen} onOpenChange={(open) => {
        setCreateSceneOpen(open)
        if (!open) {
          setCreateSceneError(null)
        }
      }}>
        <DialogContent className="max-w-md bg-zinc-800 border-zinc-600">
          <h3 className="text-base font-semibold text-zinc-100">New scene</h3>
          <p className="text-sm text-zinc-400">
            Create a scene in this production to start adding shots.
          </p>
          {createSceneError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {createSceneError}
            </p>
          )}
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="scene-number" className="text-sm text-zinc-200">
                Scene number<span className="text-destructive">*</span>
              </Label>
              <Input
                id="scene-number"
                value={newSceneNumber}
                onChange={(e) => setNewSceneNumber(e.target.value)}
                placeholder="e.g. 12A"
                className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                autoFocus
                disabled={createSceneMutation.isPending}
              />
            </div>
            <div>
              <Label htmlFor="scene-title" className="text-sm text-zinc-200">
                Title<span className="text-destructive">*</span>
              </Label>
              <Input
                id="scene-title"
                value={newSceneTitle}
                onChange={(e) => setNewSceneTitle(e.target.value)}
                placeholder="Defaults to scene number when empty"
                className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                disabled={createSceneMutation.isPending}
              />
            </div>
            {isEpisodicProduction && (
              <div>
                <Label className="text-sm text-zinc-200">
                  Episode<span className="text-destructive">*</span>
                </Label>
                <Select
                  value={newSceneEpisodeId.trim() ? newSceneEpisodeId : SELECT_NONE}
                  onValueChange={(v) => setNewSceneEpisodeId(v === SELECT_NONE ? '' : v)}
                  disabled={createSceneMutation.isPending || activeEpisodes.length === 0}
                >
                  <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                    <SelectValue placeholder="Select episode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-600">
                    <SelectItem value={SELECT_NONE}>Select episode…</SelectItem>
                    {activeEpisodes.map((ep) => (
                      <SelectItem key={ep.id} value={ep.id}>
                        {ep.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeEpisodes.length === 0 && (
                  <p className="mt-1 text-xs text-amber-400">
                    Add an episode in Settings before creating scenes.
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-zinc-200">
                  INT / EXT<span className="text-destructive">*</span>
                </Label>
                <Select
                  value={newSceneIntExt ?? undefined}
                  onValueChange={(v) => setNewSceneIntExt(v as Scene['int_ext'])}
                >
                  <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-600">
                    {SCENE_INT_EXT_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-zinc-200">
                  Time of day<span className="text-destructive">*</span>
                </Label>
                <Select
                  value={newSceneDayNight ?? undefined}
                  onValueChange={(v) => setNewSceneDayNight(v as Scene['day_night'])}
                >
                  <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-600">
                    {SCENE_DAY_NIGHT_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm text-zinc-200">
                Location<span className="text-destructive">*</span>
              </Label>
              <Select
                value={newSceneLocationId ?? undefined}
                onValueChange={(v) => setNewSceneLocationId(v)}
              >
                <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                  <SelectValue placeholder="Default City" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-600">
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreateSceneOpen(false)
                setCreateSceneError(null)
              }}
              disabled={createSceneMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => createSceneMutation.mutate()}
              disabled={
                createSceneMutation.isPending ||
                (isEpisodicProduction && (!newSceneEpisodeId.trim() || activeEpisodes.length === 0))
              }
            >
              {createSceneMutation.isPending ? 'Creating…' : 'Create scene'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editSceneOpen} onOpenChange={(open) => {
        setEditSceneOpen(open)
        if (!open) setEditSceneError(null)
      }}>
        <DialogContent className="max-w-md bg-zinc-800 border-zinc-600">
          <h3 className="text-base font-semibold text-zinc-100">Edit scene</h3>
          <p className="text-sm text-zinc-400">
            Update the selected scene’s metadata.
          </p>
          {editSceneError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {editSceneError}
            </p>
          )}
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="edit-scene-number" className="text-sm text-zinc-200">
                Scene number<span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-scene-number"
                value={editSceneNumber}
                onChange={(e) => setEditSceneNumber(e.target.value)}
                placeholder="e.g. 12A"
                className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                autoFocus
                disabled={updateSceneMutation.isPending}
              />
            </div>
            <div>
              <Label htmlFor="edit-scene-title" className="text-sm text-zinc-200">
                Title
              </Label>
              <Input
                id="edit-scene-title"
                value={editSceneTitle}
                onChange={(e) => setEditSceneTitle(e.target.value)}
                placeholder="Optional short description"
                className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                disabled={updateSceneMutation.isPending}
              />
            </div>
            {isEpisodicProduction && (
              <div>
                <Label className="text-sm text-zinc-200">
                  Episode<span className="text-destructive">*</span>
                </Label>
                <Select
                  value={editSceneEpisodeId.trim() ? editSceneEpisodeId : SELECT_NONE}
                  onValueChange={(v) => setEditSceneEpisodeId(v === SELECT_NONE ? '' : v)}
                  disabled={updateSceneMutation.isPending || editEpisodeSelectOptions.length === 0}
                >
                  <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                    <SelectValue placeholder="Select episode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-600">
                    <SelectItem value={SELECT_NONE}>Select episode…</SelectItem>
                    {editEpisodeSelectOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editEpisodeSelectOptions.length === 0 && (
                  <p className="mt-1 text-xs text-amber-400">
                    Add an episode in Settings before assigning scenes.
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-zinc-200">INT / EXT</Label>
                <Select
                  value={editSceneIntExt ?? SELECT_NONE}
                  onValueChange={(v) =>
                    setEditSceneIntExt(v === SELECT_NONE ? null : (v as Scene['int_ext']))
                  }
                >
                  <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-600">
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
                <Label className="text-sm text-zinc-200">Time of day</Label>
                <Select
                  value={editSceneDayNight ?? SELECT_NONE}
                  onValueChange={(v) =>
                    setEditSceneDayNight(v === SELECT_NONE ? null : (v as Scene['day_night']))
                  }
                >
                  <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-600">
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
            <div>
              <Label className="text-sm text-zinc-200">Location</Label>
              <Select
                value={editSceneLocationId ?? SELECT_NONE}
                onValueChange={(v) =>
                  setEditSceneLocationId(v === SELECT_NONE ? null : v)
                }
              >
                <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-600">
                  <SelectItem value={SELECT_NONE}>—</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditSceneOpen(false)
                setEditSceneError(null)
              }}
              disabled={updateSceneMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => updateSceneMutation.mutate()}
              disabled={
                updateSceneMutation.isPending ||
                (isEpisodicProduction && (!editSceneEpisodeId.trim() || editEpisodeSelectOptions.length === 0))
              }
            >
              {updateSceneMutation.isPending ? 'Updating…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addShotOpen} onOpenChange={handleAddShotDialogOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col bg-zinc-800 border-zinc-600">
          <h3 className="text-base font-semibold text-zinc-100">Add shot</h3>
          <p className="text-sm text-zinc-400">
            Add a shot to scene {selectedScene?.scene_number ?? ''}. Fields match the shot list and database schema.
          </p>
          {addShotError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
              {addShotError}
            </p>
          )}
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div>
              <Label htmlFor="add-shot-number" className="text-sm text-zinc-200">
                Shot number<span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-shot-number"
                value={addShotForm.shot_number}
                onChange={(e) =>
                  setAddShotForm((f) => ({ ...f, shot_number: e.target.value }))
                }
                placeholder="e.g. 1A"
                className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                autoFocus
                disabled={createShotMutation.isPending}
              />
            </div>
            <div>
              <Label htmlFor="add-shot-subject" className="text-sm text-zinc-200">
                Subject
              </Label>
              <Input
                id="add-shot-subject"
                value={addShotForm.subject}
                onChange={(e) => setAddShotForm((f) => ({ ...f, subject: e.target.value }))}
                className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                disabled={createShotMutation.isPending}
              />
            </div>
            <div>
              <Label htmlFor="add-shot-shot-description" className="text-sm text-zinc-200">
                Shot Description
              </Label>
              <Textarea
                id="add-shot-shot-description"
                value={addShotForm.shot_description}
                onChange={(e) =>
                  setAddShotForm((f) => ({ ...f, shot_description: e.target.value }))
                }
                className="mt-1 min-h-[56px] bg-zinc-900 border-zinc-600 text-zinc-100"
                placeholder="Optional"
                disabled={createShotMutation.isPending}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-zinc-200">Shot size</Label>
                <Select
                  value={addShotForm.shot_size ?? SELECT_NONE}
                  onValueChange={(v) =>
                    setAddShotForm((f) => ({
                      ...f,
                      shot_size: v === SELECT_NONE ? null : (v as Shot['shot_size']),
                    }))
                  }
                  disabled={createShotMutation.isPending}
                >
                  <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-600">
                    <SelectItem value={SELECT_NONE}>—</SelectItem>
                    {SHOT_SIZE_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-zinc-200">Movement</Label>
                <Select
                  value={addShotForm.camera_movement ?? SELECT_NONE}
                  onValueChange={(v) =>
                    setAddShotForm((f) => ({
                      ...f,
                      camera_movement:
                        v === SELECT_NONE ? null : (v as Shot['camera_movement']),
                    }))
                  }
                  disabled={createShotMutation.isPending}
                >
                  <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-600 max-h-[280px]">
                    <SelectItem value={SELECT_NONE}>—</SelectItem>
                    {CAMERA_MOVEMENT_VALUES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="add-shot-duration" className="text-sm text-zinc-200">
                  Duration (m:ss)
                </Label>
                <Input
                  id="add-shot-duration"
                  value={addShotForm.duration_mm_ss}
                  onChange={(e) =>
                    setAddShotForm((f) => ({
                      ...f,
                      duration_mm_ss: e.target.value.replace(/[^\d:]/g, ''),
                    }))
                  }
                  placeholder="e.g. 0:30"
                  className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                  disabled={createShotMutation.isPending}
                />
              </div>
              <div>
                <Label htmlFor="add-shot-est-min" className="text-sm text-zinc-200">
                  Est. minutes
                </Label>
                <Input
                  id="add-shot-est-min"
                  inputMode="numeric"
                  value={addShotForm.estimated_shoot_minutes}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '')
                    if (v === '' || parseInt(v, 10) <= 9999) {
                      setAddShotForm((f) => ({ ...f, estimated_shoot_minutes: v }))
                    }
                  }}
                  placeholder="Optional"
                  className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                  disabled={createShotMutation.isPending}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="add-shot-lens" className="text-sm text-zinc-200">
                Lens
              </Label>
              <datalist id="add-shot-lens-dl">
                {lensTerms.map((t) => (
                  <option key={t.id} value={t.value} />
                ))}
              </datalist>
              <Input
                id="add-shot-lens"
                list="add-shot-lens-dl"
                value={addShotForm.lens}
                onChange={(e) => setAddShotForm((f) => ({ ...f, lens: e.target.value }))}
                className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                placeholder="Optional"
                disabled={createShotMutation.isPending}
              />
            </div>
            <div>
              <Label htmlFor="add-shot-support" className="text-sm text-zinc-200">
                Support
              </Label>
              <datalist id="add-shot-support-dl">
                {supportTerms.map((t) => (
                  <option key={t.id} value={t.value} />
                ))}
              </datalist>
              <Input
                id="add-shot-support"
                list="add-shot-support-dl"
                value={addShotForm.support}
                onChange={(e) => setAddShotForm((f) => ({ ...f, support: e.target.value }))}
                className="mt-1 h-8 bg-zinc-900 border-zinc-600 text-zinc-100"
                placeholder="Optional"
                disabled={createShotMutation.isPending}
              />
            </div>
            <div>
              <Label htmlFor="add-shot-notes" className="text-sm text-zinc-200">
                Notes
              </Label>
              <Textarea
                id="add-shot-notes"
                value={addShotForm.notes}
                onChange={(e) => setAddShotForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1 min-h-[72px] bg-zinc-900 border-zinc-600 text-zinc-100"
                placeholder="Optional"
                disabled={createShotMutation.isPending}
              />
            </div>
            <div>
              <Label className="text-sm text-zinc-200">Cast on this shot</Label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Choose production cast (saved as linked people, not free text).
              </p>
              {cast.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">
                  No cast in this production. Add cast under People first.
                </p>
              ) : (
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border border-zinc-600 bg-zinc-900/50 p-2">
                  {cast.map((person) => (
                    <label
                      key={person.id}
                      className={cn(
                        'flex items-center gap-2 rounded px-1 py-1 text-sm text-zinc-200 hover:bg-zinc-800/80',
                        createShotMutation.isPending ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                      )}
                    >
                      <Checkbox
                        checked={addShotForm.cast_person_ids.includes(person.id)}
                        disabled={createShotMutation.isPending}
                        onCheckedChange={(checked) => {
                          setAddShotForm((f) => {
                            const on = checked === true
                            const set = new Set(f.cast_person_ids)
                            if (on) set.add(person.id)
                            else set.delete(person.id)
                            return { ...f, cast_person_ids: [...set] }
                          })
                        }}
                      />
                      <span>
                        {person.name}
                        {person.cast_number ? (
                          <span className="ml-1.5 text-zinc-500">#{person.cast_number}</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-zinc-700 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleAddShotDialogOpenChange(false)}
              disabled={createShotMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={createShotMutation.isPending}
              onClick={() => {
                if (!selectedSceneId) {
                  setAddShotError('Select a scene before adding a shot.')
                  return
                }
                const trimmed = addShotForm.shot_number.trim()
                if (!trimmed) {
                  setAddShotError('Shot number is required.')
                  return
                }
                if (addShotForm.duration_mm_ss.trim()) {
                  const sec = parseDurationMmSs(addShotForm.duration_mm_ss.trim())
                  if (sec === null) {
                    setAddShotError('Duration must be 0 or greater (use m:ss).')
                    return
                  }
                }
                if (addShotForm.estimated_shoot_minutes.trim()) {
                  const parsed = parseEstMinutes(addShotForm.estimated_shoot_minutes)
                  if (parsed === null) {
                    setAddShotError('Est. minutes must be 0 or greater.')
                    return
                  }
                }
                setAddShotError(null)
                createShotMutation.mutate({
                  sceneId: selectedSceneId,
                  form: addShotForm,
                  productionId: currentProductionId ?? null,
                })
              }}
            >
              {createShotMutation.isPending ? 'Creating…' : 'Add shot'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add cast to shot dialog */}
      <Dialog open={addShotCastShotId != null} onOpenChange={(open) => !open && setAddShotCastShotId(null)}>
        <DialogContent className="max-h-[85vh] flex flex-col bg-zinc-800 border-zinc-600">
          <h3 className="text-base font-semibold text-zinc-100">Add cast to shot</h3>
          <p className="text-sm text-zinc-400">
            {addShotCastShotId
              ? `Select a cast member to add to shot ${shots.find((s) => s.id === addShotCastShotId)?.shot_number ?? ''}. They will be added to the scene if not already in it.`
              : ''}
          </p>
          {addShotCastShotId && (() => {
            const onShot = shotCastByShotId.get(addShotCastShotId) ?? []
            const personIdsOnShot = new Set(onShot.map((sc) => sc.person_id))
            const available = cast.filter((c) => !personIdsOnShot.has(c.id))
            return available.length === 0 ? (
              <p className="py-4 text-sm text-zinc-500">All cast are already on this shot.</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto py-2">
                <div className="flex flex-col gap-1">
                  {available.map((person) => (
                    <Button
                      key={person.id}
                      variant="ghost"
                      className="justify-start text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100"
                      onClick={() => addShotCastMutation.mutate({ shotId: addShotCastShotId, personId: person.id })}
                      disabled={addShotCastMutation.isPending}
                    >
                      {person.name}
                      {person.cast_number && (
                        <span className="ml-2 text-zinc-500">#{person.cast_number}</span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <ShotScriptSectionLinkDialog
        open={manageSectionsShotId != null}
        onOpenChange={(open) => !open && setManageSectionsShotId(null)}
        shotNumber={shots.find((s) => s.id === manageSectionsShotId)?.shot_number ?? ''}
        scene={selectedSceneForScope ?? null}
        sections={sceneSections}
        rangesBySectionId={sceneSectionRanges}
        charactersBySectionId={sceneSectionCharacters}
        scriptVersions={scriptVersions}
        latestScriptVersion={latestScriptVersion ?? null}
        initialSectionIds={linkedSectionIds}
        isRemoteProduction={isRemoteProduction}
        isSaving={replaceShotSectionsMutation.isPending}
        error={sectionLinkError}
        onSave={(sectionIds) => {
          if (!manageSectionsShotId) return
          replaceShotSectionsMutation.mutate({ shotId: manageSectionsShotId, sectionIds })
        }}
      />
    </div>
  )
}

function ShotRow({
  shot,
  sceneNumber,
  editMode,
  editingCell,
  localValue,
  setEditingCell,
  setLocalValue,
  commitEdit,
  cancelEdit,
  lensOptions,
  supportOptions,
  isSaving,
  shotCastList,
  castById,
  onRemoveShotCast,
  onAddCastClick,
  isRemovingShotCast,
  linkedSectionCount,
  sectionLinksNeedReview,
  onManageSectionsClick,
  onRequestDelete,
  isDeletePending,
  onDuplicate,
  isDuplicatePending,
}: {
  shot: Shot
  sceneNumber: string
  editMode: boolean
  editingCell: { shotId: string; field: EditableField } | null
  localValue: string
  setEditingCell: (v: { shotId: string; field: EditableField } | null) => void
  setLocalValue: (v: string) => void
  commitEdit: (shotId: string, field: EditableField, value: string | number | null) => void
  cancelEdit: () => void
  lensOptions: string[]
  supportOptions: string[]
  isSaving: boolean
  shotCastList: ShotCast[]
  castById: Map<string, { id: string; name: string; cast_number?: string | null }>
  onRemoveShotCast: (shotCastId: string) => void
  onAddCastClick: () => void
  isRemovingShotCast: boolean
  linkedSectionCount: number
  sectionLinksNeedReview: boolean
  onManageSectionsClick: () => void
  onDuplicate?: (shot: Shot) => void
  isDuplicatePending?: boolean
  onRequestDelete?: (shot: Shot) => void
  isDeletePending?: boolean
}) {
  const isEditing = editingCell?.shotId === shot.id
  const editingField = isEditing ? editingCell!.field : null

  const startEdit = (field: EditableField) => {
    let val: string
    if (field === 'shot_number') val = shot.shot_number
    else if (field === 'subject') val = shot.subject ?? ''
    else if (field === 'shot_description') val = shot.shot_description ?? ''
    else if (field === 'shot_size') val = shot.shot_size ?? ''
    else if (field === 'duration_seconds')
      val = shot.duration_seconds != null ? formatDuration(shot.duration_seconds) : ''
    else if (field === 'estimated_shoot_minutes')
      val = shot.estimated_shoot_minutes != null ? String(shot.estimated_shoot_minutes) : ''
    else if (field === 'camera_movement') val = shot.camera_movement ?? ''
    else if (field === 'lens') val = shot.lens ?? ''
    else if (field === 'support') val = shot.support ?? ''
    else val = shot.notes ?? ''
    setLocalValue(val)
    setEditingCell({ shotId: shot.id, field })
  }

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field: EditableField,
    value: string | number | null
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit(shot.id, field, value)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const cellClass = (field: EditableField) =>
    cn(
      'align-middle px-3 py-2 max-w-[180px]',
      editMode && 'cursor-pointer hover:bg-zinc-800/50 rounded',
      editingField === field && 'ring-2 ring-emerald-500/50 ring-inset rounded bg-zinc-800/30'
    )

  return (
    <TableRow>
      <TableCell
        className={cn(
          'font-medium px-3 py-2 align-middle',
          editMode && 'cursor-pointer hover:bg-zinc-800/50 rounded',
          editingField === 'shot_number' &&
            'ring-2 ring-emerald-500/50 ring-inset rounded bg-zinc-800/30'
        )}
        onClick={() => editMode && !editingField && startEdit('shot_number')}
      >
        <span className="inline-flex items-center gap-1 flex-wrap">
          <span className="text-muted-foreground shrink-0">{sceneNumber} /</span>
          {editingField === 'shot_number' ? (
            <Input
              className="h-8 min-w-[4rem] max-w-[120px] bg-background border-zinc-600 focus-visible:ring-emerald-500/50"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onBlur={() => commitEdit(shot.id, 'shot_number', localValue)}
              onKeyDown={(e) => handleKeyDown(e, 'shot_number', localValue)}
              autoFocus
              disabled={isSaving}
              aria-label="Shot number"
            />
          ) : (
            <span>{shot.shot_number}</span>
          )}
        </span>
      </TableCell>

      {/* Subject */}
      <TableCell
        className={cellClass('subject')}
        onClick={() => editMode && !editingField && startEdit('subject')}
      >
        {editingField === 'subject' ? (
          <Input
            className="h-8 bg-background border-zinc-600 focus-visible:ring-emerald-500/50"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => commitEdit(shot.id, 'subject', localValue.trim() || null)}
            onKeyDown={(e) => handleKeyDown(e, 'subject', localValue.trim() || null)}
            autoFocus
            disabled={isSaving}
          />
        ) : (
          <span className="block truncate">{shot.subject ?? '—'}</span>
        )}
      </TableCell>

      {/* Shot Description */}
      <TableCell
        className={cn(cellClass('shot_description'), 'max-w-[200px]')}
        onClick={() => editMode && !editingField && startEdit('shot_description')}
      >
        {editingField === 'shot_description' ? (
          <Popover open>
            <PopoverTrigger asChild>
              <span className="block truncate text-sm">{localValue || '(empty)'}</span>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 bg-zinc-900 border-zinc-600"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={cancelEdit}
            >
              <Textarea
                className="min-h-[80px] bg-background border-zinc-600"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelEdit()
                }}
                placeholder="Shot description"
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => commitEdit(shot.id, 'shot_description', localValue.trim() || null)}
                >
                  <Check className="size-3.5 mr-1" />
                  Done
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          shot.shot_description ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate text-sm">{shot.shot_description}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                {shot.shot_description}
              </TooltipContent>
            </Tooltip>
          ) : (
            '—'
          )
        )}
      </TableCell>

      {/* Shot size */}
      <TableCell
        className={cellClass('shot_size')}
        onClick={() => editMode && !editingField && startEdit('shot_size')}
      >
        {editingField === 'shot_size' ? (
          <Select
            value={localValue || SELECT_NONE}
            onValueChange={(v) =>
              commitEdit(shot.id, 'shot_size', v === SELECT_NONE ? null : v)
            }
            defaultOpen
          >
            <SelectTrigger className="h-8 w-full max-w-[90px] bg-background border-zinc-600">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-600">
              <SelectItem value={SELECT_NONE}>—</SelectItem>
              {SHOT_SIZE_VALUES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          shot.shot_size ?? '—'
        )}
      </TableCell>

      {/* Duration */}
      <TableCell
        className={cn(
          cellClass('duration_seconds'),
          editingField === 'duration_seconds' && 'pr-1'
        )}
        onClick={() => editMode && !editingField && startEdit('duration_seconds')}
      >
        {editingField === 'duration_seconds' ? (
          <DurationEditor
            value={localValue}
            onChange={setLocalValue}
            onCommit={() => {
              const sec = parseDurationMmSs(localValue)
              commitEdit(shot.id, 'duration_seconds', sec)
            }}
            onCancel={cancelEdit}
            disabled={isSaving}
          />
        ) : (
          formatDuration(shot.duration_seconds)
        )}
      </TableCell>

      {/* Est. min */}
      <TableCell
        className={cellClass('estimated_shoot_minutes')}
        onClick={() => editMode && !editingField && startEdit('estimated_shoot_minutes')}
      >
        {editingField === 'estimated_shoot_minutes' ? (
          <EstMinutesEditor
            value={localValue}
            onChange={setLocalValue}
            onCommit={() => {
              const parsed = parseEstMinutes(localValue)
              if (parsed !== undefined) commitEdit(shot.id, 'estimated_shoot_minutes', parsed)
            }}
            onCancel={cancelEdit}
            disabled={isSaving}
          />
        ) : (
          shot.estimated_shoot_minutes != null
            ? `${shot.estimated_shoot_minutes} min`
            : '—'
        )}
      </TableCell>

      {/* Movement */}
      <TableCell
        className={cellClass('camera_movement')}
        onClick={() => editMode && !editingField && startEdit('camera_movement')}
      >
        {editingField === 'camera_movement' ? (
          <Select
            value={localValue || SELECT_NONE}
            onValueChange={(v) =>
              commitEdit(shot.id, 'camera_movement', v === SELECT_NONE ? null : v)
            }
            defaultOpen
          >
            <SelectTrigger className="h-8 w-full max-w-[140px] bg-background border-zinc-600">
              <SelectValue placeholder="Movement" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-600 max-h-[280px]">
              <SelectItem value={SELECT_NONE}>—</SelectItem>
              {CAMERA_MOVEMENT_VALUES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          shot.camera_movement ?? '—'
        )}
      </TableCell>

      {/* Lens */}
      <TableCell
        className={cellClass('lens')}
        onClick={() => editMode && !editingField && startEdit('lens')}
      >
        {editingField === 'lens' ? (
          <LensSupportCombobox
            value={localValue}
            options={lensOptions}
            onChange={setLocalValue}
            onCommit={(v) => commitEdit(shot.id, 'lens', v)}
            onCancel={cancelEdit}
            placeholder="Lens"
            disabled={isSaving}
          />
        ) : (
          shot.lens ?? '—'
        )}
      </TableCell>

      {/* Support */}
      <TableCell
        className={cellClass('support')}
        onClick={() => editMode && !editingField && startEdit('support')}
      >
        {editingField === 'support' ? (
          <LensSupportCombobox
            value={localValue}
            options={supportOptions}
            onChange={setLocalValue}
            onCommit={(v) => commitEdit(shot.id, 'support', v)}
            onCancel={cancelEdit}
            placeholder="Support"
            disabled={isSaving}
          />
        ) : (
          shot.support ?? '—'
        )}
      </TableCell>

      {/* Notes */}
      <TableCell
        className={cn(cellClass('notes'), 'max-w-[200px]')}
        onClick={() => editMode && !editingField && startEdit('notes')}
      >
        {editingField === 'notes' ? (
          <Popover open>
            <PopoverTrigger asChild>
              <span className="block truncate text-sm">{localValue || '(empty)'}</span>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 bg-zinc-900 border-zinc-600"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={cancelEdit}
            >
              <Textarea
                className="min-h-[100px] bg-background border-zinc-600"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelEdit()
                }}
                placeholder="Notes"
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => commitEdit(shot.id, 'notes', localValue.trim() || null)}
                >
                  <Check className="size-3.5 mr-1" />
                  Done
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          shot.notes ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate text-sm">{shot.notes}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                {shot.notes}
              </TooltipContent>
            </Tooltip>
          ) : (
            '—'
          )
        )}
      </TableCell>

      {/* Cast (shot-level) */}
      <TableCell className="align-middle px-3 py-2 w-[180px]">
        <div className="flex flex-wrap items-center gap-1.5">
          {shotCastList.map((sc) => {
            const person = castById.get(sc.person_id)
            return (
              <span
                key={sc.id}
                className="inline-flex items-center gap-1 rounded bg-zinc-700/80 px-1.5 py-0.5 text-xs text-zinc-200"
              >
                {person?.name ?? '—'}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 shrink-0 text-zinc-400 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveShotCast(sc.id)
                  }}
                  disabled={isRemovingShotCast}
                  aria-label={`Remove from shot`}
                >
                  <Trash2 className="size-3" />
                </Button>
              </span>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            onClick={onAddCastClick}
          >
            <Plus className="mr-1 size-3" />
            Add cast
          </Button>
        </div>
      </TableCell>

      {/* Script sections (coverage) */}
      <TableCell className="align-middle px-3 py-2 w-[170px]">
        <div className="flex flex-wrap items-center gap-1.5">
          {linkedSectionCount > 0 ? (
            <>
              <span
                className="inline-flex items-center gap-1 rounded bg-emerald-700/70 px-1.5 py-0.5 text-xs text-emerald-100"
                title={`${linkedSectionCount} linked script section${linkedSectionCount === 1 ? '' : 's'}`}
              >
                <FileText className="size-3" />
                {linkedSectionCount} linked
              </span>
              {sectionLinksNeedReview && (
                <span
                  className="inline-flex items-center gap-1 rounded bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300"
                  title="Linked sections reference an older script revision than the latest"
                >
                  Needs review
                </span>
              )}
            </>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300"
              title="This shot is not linked to any script section"
            >
              No coverage
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            onClick={onManageSectionsClick}
          >
            <Pencil className="mr-1 size-3" />
            Sections
          </Button>
        </div>
      </TableCell>

      {(onDuplicate != null || onRequestDelete != null) && (
        <TableCell className="align-middle px-2 py-2 w-20 text-right">
          <div className="flex items-center justify-end gap-0.5">
            {onDuplicate != null && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate(shot)
                }}
                disabled={isDuplicatePending || isDeletePending}
                aria-label={`Duplicate shot ${shot.shot_number}`}
              >
                <Copy className="size-4" />
              </Button>
            )}
            {onRequestDelete != null && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/15 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestDelete(shot)
                }}
                disabled={isDeletePending || isDuplicatePending}
                aria-label={`Delete shot ${shot.shot_number}`}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}

const HOLD_DELAY_MS = 1000
const REPEAT_INTERVAL_MS = 125

function DurationEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])
  const repeatRef = useRef<{
    timeoutId: ReturnType<typeof setTimeout>
    intervalId: ReturnType<typeof setInterval> | 0
  } | null>(null)

  const clearRepeat = useCallback(() => {
    if (repeatRef.current) {
      clearTimeout(repeatRef.current.timeoutId)
      if (repeatRef.current.intervalId) clearInterval(repeatRef.current.intervalId)
      repeatRef.current = null
    }
  }, [])

  const stepUp = useCallback(() => {
    const v = valueRef.current
    const sec = parseDurationMmSs(v)
    if (sec !== null && sec < 86400) onChange(formatDuration(sec + 1))
    else if (sec === null) onChange('0:01')
  }, [onChange])

  const stepDown = useCallback(() => {
    const v = valueRef.current
    const sec = parseDurationMmSs(v)
    if (sec !== null && sec > 0) onChange(formatDuration(sec - 1))
    else if (sec === null) onChange('0:00')
  }, [onChange])

  const handlePlusMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    if (disabled) return
    stepUp()
    const timeoutId = setTimeout(() => {
      const intervalId = setInterval(stepUp, REPEAT_INTERVAL_MS)
      if (repeatRef.current) repeatRef.current.intervalId = intervalId
    }, HOLD_DELAY_MS)
    repeatRef.current = { timeoutId, intervalId: 0 }
  }

  const handleMinusMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    if (disabled) return
    stepDown()
    const timeoutId = setTimeout(() => {
      const intervalId = setInterval(stepDown, REPEAT_INTERVAL_MS)
      if (repeatRef.current) repeatRef.current.intervalId = intervalId
    }, HOLD_DELAY_MS)
    repeatRef.current = { timeoutId, intervalId: 0 }
  }

  return (
    <div className="flex items-center gap-1 pr-0">
      <Input
        className="h-8 w-24 bg-background border-zinc-600 focus-visible:ring-emerald-500/50"
        placeholder="m:ss"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d:]/g, ''))}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit()
          if (e.key === 'Escape') onCancel()
        }}
        disabled={disabled}
        autoFocus
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onMouseDown={handlePlusMouseDown}
        onMouseUp={clearRepeat}
        onMouseLeave={clearRepeat}
        onClick={(e) => {
          e.preventDefault()
          // Step already done on mousedown; click would duplicate it
        }}
      >
        +
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onMouseDown={handleMinusMouseDown}
        onMouseUp={clearRepeat}
        onMouseLeave={clearRepeat}
        onClick={(e) => {
          e.preventDefault()
          // Step already done on mousedown; click would duplicate it
        }}
      >
        −
      </Button>
    </div>
  )
}

function EstMinutesEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  const parsed = parseEstMinutes(value)
  const invalid =
    value.trim() !== '' && !shotEstMinutesSchema.safeParse(parsed).success

  return (
    <Tooltip open={invalid}>
      <TooltipTrigger asChild>
        <Input
          type="text"
          inputMode="numeric"
          className={cn(
            'h-8 w-20 bg-background border-zinc-600 focus-visible:ring-emerald-500/50',
            invalid && 'border-destructive aria-invalid'
          )}
          placeholder="min"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            if (v === '' || parseInt(v, 10) <= 9999) onChange(v)
          }}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit()
            if (e.key === 'Escape') onCancel()
          }}
          disabled={disabled}
          autoFocus
          aria-invalid={invalid}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-destructive">
        Must be 0 or greater
      </TooltipContent>
    </Tooltip>
  )
}

function LensSupportCombobox({
  value,
  options,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  disabled,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  onCommit: (v: string | null) => void
  onCancel: () => void
  placeholder: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(true)
  const uniqueOptions = [...new Set(options)].filter(Boolean).sort()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span className="block w-full min-w-[80px]">{value || placeholder}</span>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0 bg-zinc-800 border-zinc-600"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command className="rounded-lg border-0">
          <CommandInput
            placeholder={placeholder}
            value={value}
            onValueChange={onChange}
            className="text-zinc-200"
          />
          <CommandList>
            <CommandEmpty>No match. Type to add new.</CommandEmpty>
            <CommandGroup>
              {uniqueOptions.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onCommit(opt)
                    setOpen(false)
                  }}
                  className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                >
                  {opt}
                </CommandItem>
              ))}
              {value.trim() && !uniqueOptions.includes(value.trim()) && (
                <CommandItem
                  value={`Add "${value.trim()}"`}
                  onSelect={() => {
                    onCommit(value.trim())
                    setOpen(false)
                  }}
                  className="text-emerald-400 focus:bg-zinc-700"
                >
                  Add &quot;{value.trim()}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex justify-end gap-1 p-2 border-t border-zinc-600">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={disabled}
            onClick={() => {
              onCommit(value.trim() || null)
              setOpen(false)
            }}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
