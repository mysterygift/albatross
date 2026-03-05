/**
 * TanStack Query hooks for Stripboard and Unscheduled Scenes.
 * Invalidate ['stripboard'], ['unscheduled-scenes'] after any strip/scene assignment mutation.
 */
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listShootDaysByProduction,
  listScenesByProduction,
  listShotsByProduction,
  getEstimatedShootMinutesByShotIds,
} from '@/lib/db/repositories/schedule'
import {
  listStripsByProduction,
  listUnscheduledShots,
  bulkAssignShotsToDay,
  createStrip,
  createShotStrip,
  moveStrip,
  moveStripToUnscheduled,
  moveStripToBoneyard,
  listBoneyardStrips,
  deleteStrip,
  reorderStrip,
  updateStripEstimatedMinutes,
  type CreateStripData,
  type UnscheduledShotsFilters,
} from '@/lib/db/repositories/stripboard-strips'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listShootDayUnitsByProduction, setShootDayUnitLocked } from '@/lib/db/repositories/shoot-day-units'
import { ensureMainUnit } from '@/lib/db/repositories/units'

export const stripboardQueryKeys = {
  all: ['stripboard'] as const,
  shootDays: (productionId: string) => [...stripboardQueryKeys.all, productionId, 'shoot-days'] as const,
  strips: (productionId: string) => [...stripboardQueryKeys.all, productionId, 'strips'] as const,
  scenes: (productionId: string) => [...stripboardQueryKeys.all, productionId, 'scenes'] as const,
  units: (productionId: string) => [...stripboardQueryKeys.all, productionId, 'units'] as const,
  dayUnits: (productionId: string) => [...stripboardQueryKeys.all, productionId, 'day-units'] as const,
  estimatedMinutes: (productionId: string) => [...stripboardQueryKeys.all, productionId, 'estimated-minutes'] as const,
}

export const unscheduledShotsQueryKeys = {
  all: ['unscheduled-shots'] as const,
  list: (productionId: string | null, filters?: UnscheduledShotsFilters) =>
    [
      ...unscheduledShotsQueryKeys.all,
      productionId || 'no-production',
      filters?.search?.trim() || null,
      filters?.locationId === undefined || filters?.locationId === '' ? null : filters?.locationId,
    ] as const,
}

export const boneyardStripsQueryKeys = {
  all: ['boneyard-strips'] as const,
  list: (productionId: string) => [...boneyardStripsQueryKeys.all, productionId] as const,
}

/** Full stripboard data for a production: days, units, day-units, strips grouped by day/unit, scenes, estimated minutes. */
export function useStripboard(productionId: string | null) {
  const queryClient = useQueryClient()

  const unitsQuery = useQuery({
    queryKey: stripboardQueryKeys.units(productionId ?? ''),
    queryFn: async () => {
      await ensureMainUnit(productionId!)
      return listUnitsByProduction(productionId!)
    },
    enabled: !!productionId,
  })

  const shootDaysQuery = useQuery({
    queryKey: stripboardQueryKeys.shootDays(productionId ?? ''),
    queryFn: () => listShootDaysByProduction(productionId!),
    enabled: !!productionId,
  })

  const dayUnitsQuery = useQuery({
    queryKey: stripboardQueryKeys.dayUnits(productionId ?? ''),
    queryFn: () => listShootDayUnitsByProduction(productionId!),
    enabled: !!productionId,
  })

  const stripsQuery = useQuery({
    queryKey: stripboardQueryKeys.strips(productionId ?? ''),
    queryFn: () => listStripsByProduction(productionId!),
    enabled: !!productionId,
  })

  const scenesQuery = useQuery({
    queryKey: stripboardQueryKeys.scenes(productionId ?? ''),
    queryFn: () => listScenesByProduction(productionId!),
    enabled: !!productionId,
  })

  const shotsQuery = useQuery({
    queryKey: ['shots', productionId ?? ''],
    queryFn: () => listShotsByProduction(productionId!),
    enabled: !!productionId,
  })

  const shotIdsFromStrips = useMemo(
    () => [...new Set((stripsQuery.data ?? []).map((s) => s.shot_id).filter(Boolean) as string[])],
    [stripsQuery.data]
  )

  const estimatedMinutesQuery = useQuery({
    queryKey: [...stripboardQueryKeys.estimatedMinutes(productionId ?? ''), shotIdsFromStrips],
    queryFn: () => getEstimatedShootMinutesByShotIds(shotIdsFromStrips),
    enabled: !!productionId,
  })

  const units = unitsQuery.data ?? []
  const shootDays = shootDaysQuery.data ?? []
  const dayUnits = dayUnitsQuery.data ?? []
  const strips = stripsQuery.data ?? []
  const scenes = scenesQuery.data ?? []
  const shots = shotsQuery.data ?? []
  const estimatedShootMinutesByShotId = estimatedMinutesQuery.data ?? new Map<string, number>()

  const dayUnitsByDayId = useMemo(() => {
    const map = new Map<string, typeof dayUnits>()
    for (const du of dayUnits) {
      const list = map.get(du.shoot_day_id) ?? []
      list.push(du)
      map.set(du.shoot_day_id, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.unit_id.localeCompare(b.unit_id))
    }
    return map
  }, [dayUnits])

  const stripsByDayUnit = useMemo(() => {
    const map = new Map<string, typeof strips>()
    for (const s of strips) {
      const key = s.shoot_day_unit_id
        ? `${s.shoot_day_id}:${s.shoot_day_unit_id}`
        : `${s.shoot_day_id}:`
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return map
  }, [strips])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: stripboardQueryKeys.all })
    queryClient.invalidateQueries({ queryKey: unscheduledShotsQueryKeys.all })
    queryClient.invalidateQueries({ queryKey: boneyardStripsQueryKeys.all })
    queryClient.invalidateQueries({ queryKey: ['shots'] })
  }

  const setLockedMutation = useMutation({
    mutationFn: ({ shootDayUnitId, isLocked }: { shootDayUnitId: string; isLocked: boolean }) =>
      setShootDayUnitLocked(shootDayUnitId, isLocked),
    onSuccess: () => invalidate(),
  })

  const updateEstimatedMutation = useMutation({
    mutationFn: ({ stripId, minutes }: { stripId: string; minutes: number | null }) =>
      updateStripEstimatedMinutes(stripId, minutes),
    onSuccess: () => invalidate(),
  })

  /** Move a single strip from the board to Unscheduled. Does not delete; strip remains in DB. */
  const moveToUnscheduledMutation = useMutation({
    mutationFn: (stripId: string) => moveStripToUnscheduled(stripId),
    onSuccess: () => invalidate(),
  })

  /** Move a single strip to Boneyard (discarded). Does not delete; strip can be recovered or deleted from Boneyard. */
  const moveToBoneyardMutation = useMutation({
    mutationFn: (stripId: string) => moveStripToBoneyard(stripId),
    onSuccess: () => invalidate(),
  })

  /** Permanently soft-delete a strip. Only for Boneyard delete action. */
  const deleteStripMutation = useMutation({
    mutationFn: (stripId: string) => deleteStrip(stripId),
    onSuccess: () => invalidate(),
  })

  const moveStripMutation = useMutation({
    mutationFn: ({
      stripId,
      toShootDayId,
      toShootDayUnitId,
      toSortIndex,
    }: {
      stripId: string
      toShootDayId: string
      toShootDayUnitId: string
      toSortIndex: number
    }) => moveStrip(stripId, toShootDayId, toShootDayUnitId, toSortIndex),
    onSuccess: () => invalidate(),
  })

  const reorderStripMutation = useMutation({
    mutationFn: ({ stripId, toSortIndex }: { stripId: string; toSortIndex: number }) =>
      reorderStrip(stripId, toSortIndex),
    onSuccess: () => invalidate(),
  })

  const createStripMutation = useMutation({
    mutationFn: (data: CreateStripData) => createStrip(data),
    onSuccess: () => invalidate(),
  })

  const createShotStripMutation = useMutation({
    mutationFn: ({
      productionId,
      shotId,
      shootDayId,
      shootDayUnitId,
    }: {
      productionId: string
      shotId: string
      shootDayId: string
      shootDayUnitId: string
    }) => createShotStrip(productionId, shotId, shootDayId, shootDayUnitId),
    onSuccess: () => invalidate(),
  })

  return {
    units,
    shootDays,
    dayUnits,
    dayUnitsByDayId,
    strips,
    stripsByDayUnit,
    scenes,
    shots,
    estimatedShootMinutesByShotId,
    isLoading:
      unitsQuery.isLoading ||
      shootDaysQuery.isLoading ||
      dayUnitsQuery.isLoading ||
      stripsQuery.isLoading ||
      scenesQuery.isLoading,
    invalidate,
    setLockedMutation,
    updateEstimatedMutation,
    moveToUnscheduledMutation,
    moveToBoneyardMutation,
    deleteStripMutation,
    moveStripMutation,
    reorderStripMutation,
    createStripMutation,
    createShotStripMutation,
  }
}

export function useUnscheduledShots(
  productionId: string | null,
  filters?: UnscheduledShotsFilters
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: unscheduledShotsQueryKeys.list(productionId, filters),
    queryFn: () => listUnscheduledShots(productionId!, filters),
    enabled: !!productionId,
  })

  const bulkAssignMutation = useMutation({
    mutationFn: ({
      shotIds,
      shootDayId,
      shootDayUnitId,
    }: {
      shotIds: string[]
      shootDayId: string
      shootDayUnitId: string
    }) =>
      bulkAssignShotsToDay(productionId!, shotIds, shootDayId, shootDayUnitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stripboardQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: unscheduledShotsQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: boneyardStripsQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: ['shots'] })
    },
  })

  return {
    unscheduledShots: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    bulkAssignMutation,
  }
}

export function useBoneyardStrips(productionId: string | null) {
  const query = useQuery({
    queryKey: boneyardStripsQueryKeys.list(productionId ?? ''),
    queryFn: () => listBoneyardStrips(productionId!),
    enabled: !!productionId,
  })
  return {
    boneyardStrips: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}
