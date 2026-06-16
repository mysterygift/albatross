import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  applyAthenaImportToStoryboardForActor,
  createStoryboardImageForActor,
  deleteStoryboardImageForActor,
  listScenesByProductionForActor,
  listShotsByProductionForActor,
  listLocationsByProductionForActor,
  listStoryboardImagesByProductionForActor,
  updateStoryboardImageForActor,
  updateStoryboardImportForActor,
} from '@/lib/access/projectDomainService'
import { listScenesByProduction, listShotsByProduction } from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { getLinkedSectionCountsByShotIds } from '@/lib/db/repositories/scriptSections'
import {
  applyAthenaImportToStoryboard,
  createStoryboardImage,
  deleteStoryboardImage,
  listStoryboardImagesByProduction,
  updateStoryboardImport,
  updateStoryboardImage,
} from '@/lib/db/repositories/storyboard'
import type { Shot, StoryboardImage } from '@/lib/db/types'
import { sceneDisplayLabel } from '@/lib/schedule/sceneDisplay'
import {
  createStoryboardImageObjectUrl,
  getFileUrl,
  pickAthenaGalleryPdfForImport,
  pickStoryboardImageForManualImport,
  removeStoryboardImageFile,
  saveStoryboardImageFromLocalPath,
} from '@/lib/files'
import {
  buildAthenaImportReviewRows,
  extractAthenaPanelsFromPdf,
  type AthenaPanelCandidate,
  type AthenaImportConflictPolicy,
  matchAthenaPanelsToShots,
} from '@/lib/storyboard/athena-import'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const STORYBOARD_VIEW_MODES = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
] as const

const ALL_SCENES = '__all_scenes__'
type StoryboardViewMode = (typeof STORYBOARD_VIEW_MODES)[number]['value']

function shotSummary(shot: Shot): string {
  return shot.subject?.trim() || shot.shot_description?.trim() || 'No shot description'
}

/** Small script-coverage indicator for a storyboard shot card. */
function CoverageBadge({ count }: { count: number }) {
  if (count > 0) {
    return (
      <span
        className="inline-flex items-center rounded bg-emerald-700/70 px-1.5 py-0.5 text-xs text-emerald-100"
        title={`${count} linked script section${count === 1 ? '' : 's'}`}
      >
        {count} section{count === 1 ? '' : 's'}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center rounded bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300"
      title="This shot is not linked to any script section"
    >
      No coverage
    </span>
  )
}

async function cleanupImportCandidates(candidates: AthenaPanelCandidate[]): Promise<void> {
  for (const candidate of candidates) {
    if (candidate.preview_url.startsWith('blob:')) URL.revokeObjectURL(candidate.preview_url)
  }
  await Promise.all(candidates.map((candidate) => removeStoryboardImageFile(candidate.storage_key)))
}

export function StoryboardPage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<StoryboardImage | null>(null)
  const [viewMode, setViewMode] = useState<StoryboardViewMode>('list')
  const [selectedSceneId, setSelectedSceneId] = useState<string>(ALL_SCENES)
  const [importCandidates, setImportCandidates] = useState<AthenaPanelCandidate[]>([])
  const [lastImportId, setLastImportId] = useState<string | null>(null)
  const [excludeSelectionOpen, setExcludeSelectionOpen] = useState(false)
  const [excludedCandidateIds, setExcludedCandidateIds] = useState<Set<string>>(new Set())
  const [reviewOpen, setReviewOpen] = useState(false)
  const [manualShotIdByCandidateId, setManualShotIdByCandidateId] = useState<Map<string, string>>(new Map())
  const [conflictPolicyByCandidateId, setConflictPolicyByCandidateId] = useState<
    Map<string, AthenaImportConflictPolicy>
  >(new Map())
  const [allowMultiplePanelsPerShot, setAllowMultiplePanelsPerShot] = useState(false)

  const scenesQuery = useQuery({
    queryKey: ['scenes', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listScenesByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listScenesByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const shotsQuery = useQuery({
    queryKey: ['shots-by-production', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShotsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listShotsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const locationsQuery = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listLocationsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listLocationsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const loc of locationsQuery.data ?? []) {
      map.set(loc.id, loc.name)
    }
    return map
  }, [locationsQuery.data])

  const getLocationName = (locationId: string | null) =>
    locationId ? locationNameById.get(locationId) ?? null : null

  const imagesQuery = useQuery({
    queryKey: ['storyboard-images-by-production', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listStoryboardImagesByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listStoryboardImagesByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const scopedScenes = useMemo(
    () => (scenesQuery.data ?? []).filter((scene) => scene.production_id === currentProductionId),
    [scenesQuery.data, currentProductionId]
  )
  const scopedSceneIds = useMemo(() => new Set(scopedScenes.map((scene) => scene.id)), [scopedScenes])

  const shotsByScene = useMemo(() => {
    const grouped = new Map<string, Shot[]>()
    for (const shot of shotsQuery.data ?? []) {
      if (!scopedSceneIds.has(shot.scene_id)) continue
      const list = grouped.get(shot.scene_id) ?? []
      list.push(shot)
      grouped.set(shot.scene_id, list)
    }
    return grouped
  }, [shotsQuery.data, scopedSceneIds])

  const shotIds = useMemo(() => {
    const ids = new Set<string>()
    for (const list of shotsByScene.values()) {
      for (const shot of list) ids.add(shot.id)
    }
    return ids
  }, [shotsByScene])

  const shotIdsKey = useMemo(() => [...shotIds].sort().join(','), [shotIds])
  const { data: sectionCountByShotId = new Map<string, number>() } = useQuery({
    queryKey: ['storyboard-shot-section-counts', shotIdsKey],
    queryFn: () => getLinkedSectionCountsByShotIds([...shotIds]),
    enabled: shotIds.size > 0,
  })

  const imagesByShot = useMemo(() => {
    const grouped = new Map<string, StoryboardImage[]>()
    for (const image of imagesQuery.data ?? []) {
      if (image.production_id !== currentProductionId) continue
      if (!shotIds.has(image.shot_id)) continue
      const list = grouped.get(image.shot_id) ?? []
      list.push(image)
      grouped.set(image.shot_id, list)
    }
    return grouped
  }, [imagesQuery.data, shotIds, currentProductionId])

  const imagesNeedingUrls = useMemo(
    () => [...imagesByShot.values()].flatMap((list) => list),
    [imagesByShot]
  )

  const selectedScenes = useMemo(() => {
    if (selectedSceneId === ALL_SCENES) return scopedScenes
    return scopedScenes.filter((scene) => scene.id === selectedSceneId)
  }, [scopedScenes, selectedSceneId])

  const selectedScene = useMemo(
    () => (selectedSceneId === ALL_SCENES ? null : scopedScenes.find((scene) => scene.id === selectedSceneId) ?? null),
    [selectedSceneId, scopedScenes]
  )

  const activeImportCandidates = useMemo(
    () => importCandidates.filter((candidate) => !excludedCandidateIds.has(candidate.id)),
    [importCandidates, excludedCandidateIds]
  )

  const importPreviewRows = useMemo(() => {
    return matchAthenaPanelsToShots({
      candidates: activeImportCandidates,
      shots: shotsQuery.data ?? [],
      selectedSceneId: selectedSceneId === ALL_SCENES ? null : selectedSceneId,
    })
  }, [activeImportCandidates, shotsQuery.data, selectedSceneId])

  const existingImageCountByShotId = useMemo(() => {
    const map = new Map<string, number>()
    for (const [shotId, images] of imagesByShot.entries()) {
      map.set(shotId, images.length)
    }
    return map
  }, [imagesByShot])

  const reviewRows = useMemo(() => {
    return buildAthenaImportReviewRows({
      matchRows: importPreviewRows,
      shots: shotsQuery.data ?? [],
      existingImageCountByShotId,
      manualShotIdByCandidateId,
      conflictPolicyByCandidateId,
    })
  }, [
    importPreviewRows,
    shotsQuery.data,
    existingImageCountByShotId,
    manualShotIdByCandidateId,
    conflictPolicyByCandidateId,
  ])

  const assignableShots = useMemo(() => {
    const allShots = shotsQuery.data ?? []
    if (selectedSceneId === ALL_SCENES) return allShots
    return allShots.filter((shot) => shot.scene_id === selectedSceneId)
  }, [shotsQuery.data, selectedSceneId])

  const imageUrlsQuery = useQuery({
    queryKey: [
      'storyboard-image-urls',
      imagesNeedingUrls.map((img) => `${img.id}:${img.storage_key}`).join(','),
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        imagesNeedingUrls.map(async (img) => {
          try {
            const blobUrl = await createStoryboardImageObjectUrl(img.storage_key, img.mime_type)
            return [img.id, blobUrl] as const
          } catch {
            return [img.id, await getFileUrl(img.storage_key)] as const
          }
        })
      )
      return new Map(entries)
    },
    enabled: imagesNeedingUrls.length > 0,
  })

  useEffect(() => {
    return () => {
      const urls = imageUrlsQuery.data ? [...imageUrlsQuery.data.values()] : []
      for (const url of urls) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
    }
  }, [imageUrlsQuery.data])

  const refreshStoryboardQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['storyboard-images-by-production', currentProductionId] })
  }

  const addImageMutation = useMutation({
    mutationFn: async (shot: Shot) => {
      if (!currentProductionId) throw new Error('Select a production first.')
      const picked = await pickStoryboardImageForManualImport()
      if (!picked) return
      const saved = await saveStoryboardImageFromLocalPath({
        sourcePath: picked.sourcePath,
        productionId: currentProductionId,
        shotId: shot.id,
        sourceType: 'manual',
        originalFilename: picked.originalFilename,
      })
      try {
        if (authSession.authSupported && authSession.currentUser) {
          const db = await getDb()
          await createStoryboardImageForActor({
            db,
            actor: authSession.currentUser,
            data: {
              production_id: currentProductionId,
              scene_id: shot.scene_id,
              shot_id: shot.id,
              storage_key: saved.storageKey,
              original_filename: saved.originalFilename,
              mime_type: picked.mimeType,
              source_type: 'manual',
            },
          })
        } else {
          await createStoryboardImage({
          production_id: currentProductionId,
          scene_id: shot.scene_id,
          shot_id: shot.id,
          storage_key: saved.storageKey,
          original_filename: saved.originalFilename,
          mime_type: picked.mimeType,
          source_type: 'manual',
          })
        }
      } catch (error) {
        await removeStoryboardImageFile(saved.storageKey)
        throw error
      }
    },
    onSuccess: () => {
      setActionError(null)
      refreshStoryboardQueries()
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not add storyboard image.')
    },
  })

  const replaceImageMutation = useMutation({
    mutationFn: async (image: StoryboardImage) => {
      const picked = await pickStoryboardImageForManualImport()
      if (!picked) return
      const saved = await saveStoryboardImageFromLocalPath({
        sourcePath: picked.sourcePath,
        productionId: image.production_id,
        shotId: image.shot_id,
        sourceType: 'manual',
        originalFilename: picked.originalFilename,
      })
      try {
        if (authSession.authSupported && authSession.currentUser) {
          const db = await getDb()
          await updateStoryboardImageForActor({
            db,
            actor: authSession.currentUser,
            imageId: image.id,
            data: {
              storage_key: saved.storageKey,
              original_filename: saved.originalFilename,
              mime_type: picked.mimeType,
            },
          })
        } else {
          await updateStoryboardImage(image.id, {
            storage_key: saved.storageKey,
            original_filename: saved.originalFilename,
            mime_type: picked.mimeType,
          })
        }
      } catch (error) {
        await removeStoryboardImageFile(saved.storageKey)
        throw error
      }
      await removeStoryboardImageFile(image.storage_key)
    },
    onSuccess: () => {
      setActionError(null)
      refreshStoryboardQueries()
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not replace storyboard image.')
    },
  })

  const removeImageMutation = useMutation({
    mutationFn: async (image: StoryboardImage) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await deleteStoryboardImageForActor({ db, actor: authSession.currentUser, imageId: image.id })
      } else {
        await deleteStoryboardImage(image.id)
      }
      await removeStoryboardImageFile(image.storage_key)
    },
    onSuccess: () => {
      setActionError(null)
      refreshStoryboardQueries()
      setPreviewImage((prev) => (prev ? null : prev))
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not remove storyboard image.')
    },
  })

  const importAthenaPdfMutation = useMutation({
    mutationFn: async () => {
      if (!currentProductionId) throw new Error('Select a production first.')
      if (importCandidates.length > 0) {
        await cleanupImportCandidates(importCandidates)
      }
      const picked = await pickAthenaGalleryPdfForImport()
      if (!picked) return
      const selectedSceneIdOrNull = selectedSceneId === ALL_SCENES ? null : selectedSceneId
      const extracted = await extractAthenaPanelsFromPdf({
        productionId: currentProductionId,
        sourcePath: picked.sourcePath,
        sourceFilename: picked.originalFilename,
        sceneId: selectedSceneIdOrNull,
      })
      return extracted
    },
    onSuccess: (result) => {
      setActionError(null)
      if (!result) return
      setImportCandidates(result.candidates)
      setLastImportId(result.importId)
      setExcludedCandidateIds(new Set())
      setManualShotIdByCandidateId(new Map())
      setConflictPolicyByCandidateId(new Map())
      setAllowMultiplePanelsPerShot(false)
      setExcludeSelectionOpen(true)
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not import Athena Gallery PDF.')
    },
  })

  const discardImportMutation = useMutation({
    mutationFn: async () => {
      await cleanupImportCandidates(importCandidates)
      if (lastImportId) {
        const data = {
          status: 'failed' as const,
          metadata_json: JSON.stringify({
            reason: 'user_cancelled',
            discarded_candidate_count: importCandidates.length,
          }),
        }
        if (authSession.authSupported && authSession.currentUser) {
          const db = await getDb()
          await updateStoryboardImportForActor({ db, actor: authSession.currentUser, importId: lastImportId, data })
        } else {
          await updateStoryboardImport(lastImportId, data)
        }
      }
    },
    onSuccess: () => {
      setActionError(null)
      setExcludeSelectionOpen(false)
      setReviewOpen(false)
      setImportCandidates([])
      setExcludedCandidateIds(new Set())
      setManualShotIdByCandidateId(new Map())
      setConflictPolicyByCandidateId(new Map())
      setAllowMultiplePanelsPerShot(false)
      setLastImportId(null)
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not discard import.')
    },
  })

  const applyImportMutation = useMutation({
    mutationFn: async () => {
      if (!currentProductionId) throw new Error('Select a production first.')
      if (!lastImportId) throw new Error('No import selected.')

      const readyRows = reviewRows.filter((row) => row.is_ready_to_apply && row.matched_shot_id != null)
      const shotCounts = new Map<string, number>()
      for (const row of readyRows) {
        const shotId = row.matched_shot_id!
        shotCounts.set(shotId, (shotCounts.get(shotId) ?? 0) + 1)
      }
      const hasDuplicates = [...shotCounts.values()].some((count) => count > 1)
      if (hasDuplicates && !allowMultiplePanelsPerShot) {
        throw new Error('Multiple panels are assigned to the same shot. Enable multiple assignment first.')
      }

      const items = readyRows.map((row) => ({
        candidate_id: row.candidate.id,
        shot_id: row.matched_shot_id!,
        scene_id: (shotsQuery.data ?? []).find((shot) => shot.id === row.matched_shot_id)?.scene_id ?? '',
        storage_key: row.candidate.storage_key,
        original_filename: `athena-${row.candidate.page_number}-${row.candidate.panel_index + 1}.png`,
        mime_type: 'image/png',
        width: row.candidate.bbox.width,
        height: row.candidate.bbox.height,
        conflict_policy: (row.conflict_policy === 'replace' ? 'replace' : 'add') as 'replace' | 'add',
      }))
      if (items.some((item) => !item.scene_id)) {
        throw new Error('One or more matched shots are no longer available.')
      }
      const applyData = {
        production_id: currentProductionId,
        source_import_id: lastImportId,
        items,
      }
      const result = authSession.authSupported && authSession.currentUser
        ? await getDb().then((db) =>
            applyAthenaImportToStoryboardForActor({ db, actor: authSession.currentUser!, data: applyData })
          )
        : await applyAthenaImportToStoryboard(applyData)

      const appliedCandidateIds = new Set(items.map((item) => item.candidate_id))
      const skippedCandidates = importCandidates.filter((candidate) => !appliedCandidateIds.has(candidate.id))
      await Promise.all(skippedCandidates.map((candidate) => removeStoryboardImageFile(candidate.storage_key)))
      return result
    },
    onSuccess: (result) => {
      setActionError(null)
      refreshStoryboardQueries()
      setExcludeSelectionOpen(false)
      setReviewOpen(false)
      for (const candidate of importCandidates) {
        if (candidate.preview_url.startsWith('blob:')) URL.revokeObjectURL(candidate.preview_url)
      }
      setImportCandidates([])
      setExcludedCandidateIds(new Set())
      setManualShotIdByCandidateId(new Map())
      setConflictPolicyByCandidateId(new Map())
      setAllowMultiplePanelsPerShot(false)
      setLastImportId(null)
      if (result.appliedCount === 0) {
        setActionError('No storyboard panels were applied. Adjust review decisions and try again.')
      }
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not apply Athena import.')
    },
  })

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Schedule — Storyboard</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  if (scenesQuery.isError || shotsQuery.isError || imagesQuery.isError) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Schedule — Storyboard</h1>
        <p className="text-destructive">Could not load storyboard data.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Schedule — Storyboard</h1>
      <div className="grid gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,260px)_auto] md:items-end">
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Display</p>
          <SegmentedControl
            ariaLabel="Storyboard display mode"
            value={viewMode}
            onValueChange={setViewMode}
            options={[...STORYBOARD_VIEW_MODES]}
            size="sm"
            className="max-w-[220px]"
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Scene</p>
          <Select value={selectedSceneId} onValueChange={setSelectedSceneId}>
            <SelectTrigger className="h-9 max-w-[320px]">
              <SelectValue placeholder="All scenes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SCENES}>All scenes</SelectItem>
              {scopedScenes.map((scene) => (
                <SelectItem key={scene.id} value={scene.id}>
                  Scene {scene.scene_number} - {sceneDisplayLabel(scene, getLocationName(scene.location_id))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:justify-self-end">
          <Button
            variant="outline"
            className="h-9"
            onClick={() => {
              setActionError(null)
              importAthenaPdfMutation.mutate()
            }}
            disabled={importAthenaPdfMutation.isPending}
          >
            {importAthenaPdfMutation.isPending ? 'Importing Athena PDF...' : 'Import Athena Gallery PDF'}
          </Button>
        </div>
      </div>
      {(scenesQuery.isPending || shotsQuery.isPending || imagesQuery.isPending) && (
        <p className="text-muted-foreground">Loading storyboard...</p>
      )}
      {actionError && (
        <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{actionError}</p>
      )}
      {importCandidates.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Athena import preview ({activeImportCandidates.length} active of {importCandidates.length} candidate
              {importCandidates.length !== 1 ? 's' : ''})
            </CardTitle>
            {lastImportId && (
              <p className="text-xs text-muted-foreground">
                Import ID: {lastImportId}
              </p>
            )}
            <div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setExcludeSelectionOpen(true)}>
                  Choose panels
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => discardImportMutation.mutate()}
                  disabled={discardImportMutation.isPending}
                >
                  Discard import
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {importPreviewRows.map((row) => (
                <div key={row.candidate.id} className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-2 overflow-hidden rounded border border-border bg-muted">
                    <img
                      src={row.candidate.preview_url}
                      alt={`Imported panel ${row.candidate.global_order + 1}`}
                      className="h-36 w-full object-cover"
                      onError={() => {}}
                    />
                  </div>
                  <p className="text-xs font-medium">Order {row.candidate.global_order + 1}</p>
                  <p className="text-xs text-muted-foreground">
                    Page {row.candidate.page_number}, panel {row.candidate.panel_index + 1}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Number: {row.candidate.detected_number_text ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Match: {row.status}
                    {row.matched_shot_number ? ` -> Shot ${row.matched_shot_number}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Method: {row.match_method ?? 'none'}
                  </p>
                  {row.matched_shot_id && (existingImageCountByShotId.get(row.matched_shot_id) ?? 0) > 0 && (
                    <p className="text-xs text-amber-600">Conflict: shot already has storyboard images</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {scopedScenes.length === 0 ? (
        <p className="text-muted-foreground">
          No scenes yet. Add scenes and shots in Shot Lists to start storyboarding.
        </p>
      ) : selectedScenes.length === 0 ? (
        <p className="text-muted-foreground">
          Selected scene is unavailable. Choose another scene filter.
        </p>
      ) : selectedScenes.every((scene) => (shotsByScene.get(scene.id) ?? []).length === 0) ? (
        <p className="text-muted-foreground">
          {selectedScene
            ? `No shots in scene ${selectedScene.scene_number} yet.`
            : 'No shots in the selected scenes yet.'}
        </p>
      ) : (
        selectedScenes.map((scene) => {
          const sceneShots = shotsByScene.get(scene.id) ?? []
          return (
            <Card key={scene.id} className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Scene {scene.scene_number} — {sceneDisplayLabel(scene, getLocationName(scene.location_id))}
                </CardTitle>
              </CardHeader>
              <CardContent
                className="space-y-3"
                data-testid={viewMode === 'grid' ? 'storyboard-grid-layout' : 'storyboard-list-layout'}
              >
                {sceneShots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No shots in this scene yet.
                  </p>
                ) : (
                  viewMode === 'grid' ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {sceneShots.map((shot) => {
                        const images = imagesByShot.get(shot.id) ?? []
                        return (
                          <div key={shot.id} className="rounded-md border border-border p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="font-medium">Shot {shot.shot_number}</span>
                                <span className="text-muted-foreground">{shot.shot_size ?? '-'}</span>
                                <span className="text-muted-foreground">{shotSummary(shot)}</span>
                                <CoverageBadge count={sectionCountByShotId.get(shot.id) ?? 0} />
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActionError(null)
                                  addImageMutation.mutate(shot)
                                }}
                                disabled={addImageMutation.isPending || replaceImageMutation.isPending}
                              >
                                Add image
                              </Button>
                            </div>
                            {images.length === 0 ? (
                              <div className="rounded border border-dashed border-border bg-muted/30 px-3 py-5 text-sm text-muted-foreground">
                                No storyboard images yet.
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {images.map((image) => {
                                  const src = imageUrlsQuery.data?.get(image.id)
                                  return (
                                    <div key={image.id} className="w-[120px] overflow-hidden rounded border border-border bg-muted">
                                      <button
                                        type="button"
                                        className="h-24 w-full"
                                        onClick={() => setPreviewImage(image)}
                                        disabled={!src}
                                      >
                                        {src ? (
                                          <img
                                            src={src}
                                            alt={image.original_filename}
                                            className="h-full w-full object-cover"
                                            onError={() => {}}
                                          />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                                            Image preview unavailable
                                          </div>
                                        )}
                                      </button>
                                      <div className="flex items-center justify-between gap-1 border-t border-border p-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => {
                                            setActionError(null)
                                            replaceImageMutation.mutate(image)
                                          }}
                                          disabled={replaceImageMutation.isPending || addImageMutation.isPending}
                                        >
                                          Replace
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                          onClick={() => {
                                            const accepted = window.confirm(
                                              `Remove "${image.original_filename}" from this shot?`
                                            )
                                            if (!accepted) return
                                            setActionError(null)
                                            removeImageMutation.mutate(image)
                                          }}
                                          disabled={removeImageMutation.isPending}
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[140px]">Shot</TableHead>
                            <TableHead>Summary</TableHead>
                            <TableHead className="w-[300px]">Images</TableHead>
                            <TableHead className="w-[110px] text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sceneShots.map((shot) => {
                            const images = imagesByShot.get(shot.id) ?? []
                            return (
                              <TableRow key={shot.id}>
                                <TableCell className="align-top">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium">Shot {shot.shot_number}</p>
                                    <p className="text-xs text-muted-foreground">{shot.shot_size ?? '-'}</p>
                                    <CoverageBadge count={sectionCountByShotId.get(shot.id) ?? 0} />
                                  </div>
                                </TableCell>
                                <TableCell className="align-top text-sm text-muted-foreground">
                                  {shotSummary(shot)}
                                </TableCell>
                                <TableCell className="align-top">
                                  {images.length === 0 ? (
                                    <div className="rounded border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                                      No storyboard images yet.
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {images.map((image) => {
                                        const src = imageUrlsQuery.data?.get(image.id)
                                        return (
                                          <div key={image.id} className="w-[120px] overflow-hidden rounded border border-border bg-muted">
                                            <button
                                              type="button"
                                              className="h-24 w-full"
                                              onClick={() => setPreviewImage(image)}
                                              disabled={!src}
                                            >
                                              {src ? (
                                                <img
                                                  src={src}
                                                  alt={image.original_filename}
                                                  className="h-full w-full object-cover"
                                              onError={() => {}}
                                                />
                                              ) : (
                                                <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                                                  Image preview unavailable
                                                </div>
                                              )}
                                            </button>
                                            <div className="flex items-center justify-between gap-1 border-t border-border p-1">
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                  setActionError(null)
                                                  replaceImageMutation.mutate(image)
                                                }}
                                                disabled={replaceImageMutation.isPending || addImageMutation.isPending}
                                              >
                                                Replace
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                                onClick={() => {
                                                  const accepted = window.confirm(
                                                    `Remove "${image.original_filename}" from this shot?`
                                                  )
                                                  if (!accepted) return
                                                  setActionError(null)
                                                  removeImageMutation.mutate(image)
                                                }}
                                                disabled={removeImageMutation.isPending}
                                              >
                                                Remove
                                              </Button>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="align-top text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setActionError(null)
                                      addImageMutation.mutate(shot)
                                    }}
                                    disabled={addImageMutation.isPending || replaceImageMutation.isPending}
                                  >
                                    Add image
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          )
        })
      )}
      <Dialog open={excludeSelectionOpen} onOpenChange={setExcludeSelectionOpen}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>Exclude non-shot images</DialogTitle>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Deselect panels that should be excluded before matching and review.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExcludedCandidateIds(new Set(importCandidates.map((candidate) => candidate.id)))}
              >
                Exclude all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setExcludedCandidateIds(new Set())}>
                Include all
              </Button>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-md border border-border p-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {importCandidates.map((candidate) => {
                  const excluded = excludedCandidateIds.has(candidate.id)
                  return (
                    <label
                      key={candidate.id}
                      className={`rounded border p-2 ${excluded ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/20'}`}
                    >
                      <div className="mb-2 overflow-hidden rounded border border-border bg-muted">
                        <img
                          src={candidate.preview_url}
                          alt={`Exclude panel ${candidate.global_order + 1}`}
                          className="h-28 w-full object-cover"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={(event) => {
                            setExcludedCandidateIds((prev) => {
                              const next = new Set(prev)
                              if (event.target.checked) next.delete(candidate.id)
                              else next.add(candidate.id)
                              return next
                            })
                          }}
                        />
                        Include panel #{candidate.global_order + 1}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setExcludeSelectionOpen(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setExcludeSelectionOpen(false)
                  setReviewOpen(true)
                }}
              >
                Continue to review
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>Athena import review</DialogTitle>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Review matches, resolve conflicts, and choose how each panel should apply.
            </p>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={allowMultiplePanelsPerShot}
                onChange={(e) => setAllowMultiplePanelsPerShot(e.target.checked)}
              />
              Allow multiple panels to target the same shot
            </label>
            <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Panel</TableHead>
                    <TableHead className="w-[160px]">Detected #</TableHead>
                    <TableHead className="w-[220px]">Shot</TableHead>
                    <TableHead className="w-[140px]">Status</TableHead>
                    <TableHead className="w-[180px]">Conflict handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewRows.map((row) => (
                    <TableRow key={row.candidate.id}>
                      <TableCell className="align-top">
                        <img
                          src={row.candidate.preview_url}
                          alt={`Review panel ${row.candidate.global_order + 1}`}
                          className="h-20 w-28 rounded object-cover"
                          onError={() => {}}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          #{row.candidate.global_order + 1} p{row.candidate.page_number}:{row.candidate.panel_index + 1}
                        </p>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {row.candidate.detected_number_text ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="align-top">
                        <Select
                          value={manualShotIdByCandidateId.get(row.candidate.id) ?? row.matched_shot_id ?? '__none__'}
                          onValueChange={(value) => {
                            setManualShotIdByCandidateId((prev) => {
                              const next = new Map(prev)
                              if (value === '__none__') next.delete(row.candidate.id)
                              else next.set(row.candidate.id, value)
                              return next
                            })
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {assignableShots.map((shot) => (
                              <SelectItem key={shot.id} value={shot.id}>
                                Shot {shot.shot_number}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {row.status}
                        {row.match_method ? ` (${row.match_method})` : ''}
                        {row.has_existing_images ? ' +conflict' : ''}
                      </TableCell>
                      <TableCell className="align-top">
                        <Select
                          value={conflictPolicyByCandidateId.get(row.candidate.id) ?? (row.has_existing_images ? 'skip' : 'add')}
                          onValueChange={(value) => {
                            setConflictPolicyByCandidateId((prev) => {
                              const next = new Map(prev)
                              next.set(row.candidate.id, value as AthenaImportConflictPolicy)
                              return next
                            })
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip</SelectItem>
                            <SelectItem value="replace">Replace existing</SelectItem>
                            <SelectItem value="add">Add as additional</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReviewOpen(false)} disabled={applyImportMutation.isPending}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => discardImportMutation.mutate()}
                disabled={discardImportMutation.isPending || applyImportMutation.isPending}
              >
                {discardImportMutation.isPending ? 'Discarding...' : 'Discard import'}
              </Button>
              <Button onClick={() => applyImportMutation.mutate()} disabled={applyImportMutation.isPending}>
                {applyImportMutation.isPending ? 'Applying...' : 'Apply import'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={previewImage != null} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">Storyboard image preview</DialogTitle>
          {previewImage && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold">{previewImage.original_filename}</h3>
              <div className="max-h-[70vh] overflow-auto rounded border border-border bg-muted">
                {(() => {
                  const src = imageUrlsQuery.data?.get(previewImage.id)
                  if (!src) {
                    return (
                      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                        Image preview unavailable.
                      </div>
                    )
                  }
                  return (
                    <img
                      src={src}
                      alt={previewImage.original_filename}
                      className="mx-auto h-auto max-h-[70vh] w-auto object-contain"
                    />
                  )
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                {previewImage.mime_type}
                {previewImage.width && previewImage.height
                  ? ` — ${previewImage.width}x${previewImage.height}`
                  : ''}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

