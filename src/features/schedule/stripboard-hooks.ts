/**
 * TanStack Query hooks for Stripboard and Unscheduled Scenes.
 * Invalidate ['stripboard'], ['unscheduled-scenes'] after any strip/scene assignment mutation.
 */
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  bulkAssignShotsToDayForActor,
  createShotStripForActor,
  createStripForActor,
  deleteShootDayAndDiscardStripsForActor,
  deleteStripForActor,
  getCastIdsByShotIdsForActor,
  getEstimatedShootMinutesByShotIdsForActor,
  listBoneyardStripsForActor,
  listScenesByProductionForActor,
  listShootDayUnitsByProductionForActor,
  listShotsByProductionForActor,
  listStripsByProductionForActor,
  listUnitsByProductionForActor,
  listUnscheduledShotsForActor,
  moveStripForActor,
  moveStripToBoneyardForActor,
  moveStripToUnscheduledForActor,
  reorderStripForActor,
  setShootDayUnitLockedForActor,
  listShootDaysByProductionForActor,
  ensureMainUnitForActor,
  updateStripEstimatedMinutesForActor,
  updateCallWrapStripTimeForActor,
  updateStripForActor,
} from '@/lib/access/projectDomainService'
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
  deleteShootDayAndDiscardStrips,
  deleteStrip,
  reorderStrip,
  updateStripEstimatedMinutes,
  updateCallWrapStripTime,
  updateStrip,
  type CreateStripData,
  type UpdateStripData,
  type UnscheduledShotsFilters,
} from '@/lib/db/repositories/stripboard-strips'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listShootDayUnitsByProduction, setShootDayUnitLocked } from '@/lib/db/repositories/shoot-day-units'
import { ensureMainUnit } from '@/lib/db/repositories/units'
import { getCastIdsByShotIds } from '@/lib/db/repositories/shot-cast'
import { getEffectiveDataSourceForProduction, tanstackDataSourceKey } from '@/lib/db/projectDataSource'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'

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

/** Invalidate stripboard-related TanStack caches (includes data-source prefix). */
export async function invalidateStripboardCaches(
  queryClient: QueryClient,
  productionId: string | null,
): Promise<void> {
  const source = productionId ? await getEffectiveDataSourceForProduction(productionId) : 'local_sqlite'
  const prefix = tanstackDataSourceKey(productionId, source)
  await queryClient.invalidateQueries({ queryKey: [...prefix, ...stripboardQueryKeys.all] })
  await queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
  await queryClient.invalidateQueries({ queryKey: ['shoot-days'] })
  await queryClient.invalidateQueries({ queryKey: [...prefix, ...unscheduledShotsQueryKeys.all] })
  await queryClient.invalidateQueries({ queryKey: [...prefix, ...boneyardStripsQueryKeys.all] })
  await queryClient.invalidateQueries({ queryKey: [...prefix, 'shots'] })
}

/** Full stripboard data for a production: days, units, day-units, strips grouped by day/unit, scenes, estimated minutes. */
export function useStripboard(productionId: string | null) {
  const queryClient = useQueryClient()
  const authSession = useAuthSession()
  const { dataSourceKey } = useEffectiveDataSourceForProduction(productionId)
  const dsPrefix = useMemo(
    () => tanstackDataSourceKey(productionId, dataSourceKey),
    [productionId, dataSourceKey],
  )

  const unitsQuery = useQuery({
    queryKey: [...dsPrefix, ...stripboardQueryKeys.units(productionId ?? '')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await ensureMainUnitForActor({ db, actor: authSession.currentUser, productionId: productionId! })
        return listUnitsByProductionForActor({ db, actor: authSession.currentUser, productionId: productionId! })
      }
      await ensureMainUnit(productionId!)
      return listUnitsByProduction(productionId!)
    },
    enabled: !!productionId,
  })

  const shootDaysQuery = useQuery({
    queryKey: [...dsPrefix, ...stripboardQueryKeys.shootDays(productionId ?? '')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({ db, actor: authSession.currentUser, productionId: productionId! })
      }
      return listShootDaysByProduction(productionId!)
    },
    enabled: !!productionId,
  })

  const dayUnitsQuery = useQuery({
    queryKey: [...dsPrefix, ...stripboardQueryKeys.dayUnits(productionId ?? '')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDayUnitsByProductionForActor({ db, actor: authSession.currentUser, productionId: productionId! })
      }
      return listShootDayUnitsByProduction(productionId!)
    },
    enabled: !!productionId,
  })

  const stripsQuery = useQuery({
    queryKey: [...dsPrefix, ...stripboardQueryKeys.strips(productionId ?? '')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listStripsByProductionForActor({ db, actor: authSession.currentUser, productionId: productionId! })
      }
      return listStripsByProduction(productionId!)
    },
    enabled: !!productionId,
  })

  const scenesQuery = useQuery({
    queryKey: [...dsPrefix, ...stripboardQueryKeys.scenes(productionId ?? '')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listScenesByProductionForActor({ db, actor: authSession.currentUser, productionId: productionId! })
      }
      return listScenesByProduction(productionId!)
    },
    enabled: !!productionId,
  })

  const shotsQuery = useQuery({
    queryKey: [...dsPrefix, 'shots', productionId ?? ''],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShotsByProductionForActor({ db, actor: authSession.currentUser, productionId: productionId! })
      }
      return listShotsByProduction(productionId!)
    },
    enabled: !!productionId,
  })

  const shotIdsFromStrips = useMemo(
    () => [...new Set((stripsQuery.data ?? []).map((s) => s.shot_id).filter(Boolean) as string[])],
    [stripsQuery.data]
  )

  const shotIdsSortedForQueries = useMemo(() => {
    const ids = [...shotIdsFromStrips]
    ids.sort()
    return ids
  }, [shotIdsFromStrips])

  const estimatedMinutesQuery = useQuery({
    queryKey: [...dsPrefix, ...stripboardQueryKeys.estimatedMinutes(productionId ?? ''), shotIdsSortedForQueries],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getEstimatedShootMinutesByShotIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: productionId!,
          shotIds: shotIdsSortedForQueries,
        })
      }
      return getEstimatedShootMinutesByShotIds(shotIdsSortedForQueries)
    },
    enabled: !!productionId,
  })

  const shotCastIdsQuery = useQuery({
    queryKey: [...dsPrefix, ...stripboardQueryKeys.all, productionId ?? '', 'shot-cast-by-shot', shotIdsSortedForQueries],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getCastIdsByShotIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: productionId!,
          shotIds: shotIdsSortedForQueries,
        })
      }
      return getCastIdsByShotIds(shotIdsSortedForQueries)
    },
    enabled: !!productionId && shotIdsSortedForQueries.length > 0,
  })

  const units = unitsQuery.data ?? []
  const shootDays = shootDaysQuery.data ?? []
  const dayUnits = dayUnitsQuery.data ?? []
  const strips = stripsQuery.data ?? []
  const scenes = scenesQuery.data ?? []
  const shots = shotsQuery.data ?? []
  const estimatedShootMinutesByShotId = estimatedMinutesQuery.data ?? new Map<string, number>()
  /** Avoid showing cast from a previous fetch when there are no shot ids on strips. */
  const castPersonIdsByShotId =
    shotIdsSortedForQueries.length === 0
      ? new Map<string, string[]>()
      : (shotCastIdsQuery.data ?? new Map<string, string[]>())

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
    void invalidateStripboardCaches(queryClient, productionId)
  }

  const setLockedMutation = useMutation({
    mutationFn: ({ shootDayUnitId, isLocked }: { shootDayUnitId: string; isLocked: boolean }) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            setShootDayUnitLockedForActor({ db, actor: authSession.currentUser!, shootDayUnitId, isLocked })
          )
        : setShootDayUnitLocked(shootDayUnitId, isLocked),
    onSuccess: () => invalidate(),
  })

  const updateEstimatedMutation = useMutation({
    mutationFn: ({ stripId, minutes }: { stripId: string; minutes: number | null }) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            updateStripEstimatedMinutesForActor({
              db,
              actor: authSession.currentUser!,
              stripId,
              estimatedMinutes: minutes,
            })
          )
        : updateStripEstimatedMinutes(stripId, minutes),
    onSuccess: () => invalidate(),
  })

  const updateCallWrapTimeMutation = useMutation({
    mutationFn: ({ stripId, time }: { stripId: string; time: string }) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            updateCallWrapStripTimeForActor({ db, actor: authSession.currentUser!, stripId, time })
          )
        : updateCallWrapStripTime(stripId, time),
    onSuccess: () => invalidate(),
  })

  const updateStripMutation = useMutation({
    mutationFn: ({ stripId, data }: { stripId: string; data: UpdateStripData }) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            updateStripForActor({ db, actor: authSession.currentUser!, stripId, data })
          )
        : updateStrip(stripId, data),
    onSuccess: () => invalidate(),
  })

  /** Move a single strip from the board to Unscheduled. Does not delete; strip remains in DB. */
  const moveToUnscheduledMutation = useMutation({
    mutationFn: (stripId: string) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) => moveStripToUnscheduledForActor({ db, actor: authSession.currentUser!, stripId }))
        : moveStripToUnscheduled(stripId),
    onSuccess: () => invalidate(),
  })

  /** Move a single strip to Boneyard (discarded). Does not delete; strip can be recovered or deleted from Boneyard. */
  const moveToBoneyardMutation = useMutation({
    mutationFn: (stripId: string) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) => moveStripToBoneyardForActor({ db, actor: authSession.currentUser!, stripId }))
        : moveStripToBoneyard(stripId),
    onSuccess: () => invalidate(),
  })

  /** Permanently soft-delete a strip. Only for Boneyard delete action. */
  const deleteStripMutation = useMutation({
    mutationFn: (stripId: string) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) => deleteStripForActor({ db, actor: authSession.currentUser!, stripId }))
        : deleteStrip(stripId),
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
    }) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            moveStripForActor({
              db,
              actor: authSession.currentUser!,
              stripId,
              toShootDayId,
              toShootDayUnitId,
              toSortIndex,
            })
          )
        : moveStrip(stripId, toShootDayId, toShootDayUnitId, toSortIndex),
    onSuccess: () => invalidate(),
  })

  const reorderStripMutation = useMutation({
    mutationFn: ({ stripId, toSortIndex }: { stripId: string; toSortIndex: number }) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            reorderStripForActor({ db, actor: authSession.currentUser!, stripId, toSortIndex })
          )
        : reorderStrip(stripId, toSortIndex),
    onSuccess: () => invalidate(),
  })

  const createStripMutation = useMutation({
    mutationFn: (data: CreateStripData) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) => createStripForActor({ db, actor: authSession.currentUser!, data }))
        : createStrip(data),
    onSuccess: () => invalidate(),
  })

  const deleteShootDayMutation = useMutation({
    mutationFn: (shootDayId: string) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            deleteShootDayAndDiscardStripsForActor({
              db,
              actor: authSession.currentUser!,
              shootDayId,
            })
          )
        : deleteShootDayAndDiscardStrips(shootDayId),
    onSuccess: () => invalidate(),
  })

  const createShotStripMutation = useMutation({
    mutationFn: ({
      productionId,
      shotId,
      shootDayId,
      shootDayUnitId,
      toSortIndex,
    }: {
      productionId: string
      shotId: string
      shootDayId: string
      shootDayUnitId: string
      toSortIndex?: number
    }) =>
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            createShotStripForActor({
              db,
              actor: authSession.currentUser!,
              productionId,
              shotId,
              shootDayId,
              shootDayUnitId,
              toSortIndex,
            })
          )
        : createShotStrip(productionId, shotId, shootDayId, shootDayUnitId, toSortIndex),
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
    /** True while shot list or shot-level cast (for insights) is still loading. */
    isInsightsDataLoading: shotsQuery.isLoading || shotCastIdsQuery.isLoading,
    castPersonIdsByShotId,
    invalidate,
    setLockedMutation,
    updateEstimatedMutation,
    updateCallWrapTimeMutation,
    updateStripMutation,
    moveToUnscheduledMutation,
    moveToBoneyardMutation,
    deleteStripMutation,
    deleteShootDayMutation,
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
  const authSession = useAuthSession()
  const { dataSourceKey } = useEffectiveDataSourceForProduction(productionId)
  const dsPrefix = useMemo(
    () => tanstackDataSourceKey(productionId, dataSourceKey),
    [productionId, dataSourceKey],
  )
  const query = useQuery({
    queryKey: [...dsPrefix, ...unscheduledShotsQueryKeys.list(productionId, filters)],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listUnscheduledShotsForActor({
          db,
          actor: authSession.currentUser,
          productionId: productionId!,
          filters,
        })
      }
      return listUnscheduledShots(productionId!, filters)
    },
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
      authSession.authSupported && authSession.currentUser
        ? getDb().then((db) =>
            bulkAssignShotsToDayForActor({
              db,
              actor: authSession.currentUser!,
              productionId: productionId!,
              shotIds,
              shootDayId,
              shootDayUnitId,
            })
          )
        : bulkAssignShotsToDay(productionId!, shotIds, shootDayId, shootDayUnitId),
    onSuccess: async () => {
      if (!productionId) return
      await invalidateStripboardCaches(queryClient, productionId)
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
  const authSession = useAuthSession()
  const { dataSourceKey } = useEffectiveDataSourceForProduction(productionId)
  const dsPrefix = useMemo(
    () => tanstackDataSourceKey(productionId, dataSourceKey),
    [productionId, dataSourceKey],
  )
  const query = useQuery({
    queryKey: [...dsPrefix, ...boneyardStripsQueryKeys.list(productionId ?? '')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBoneyardStripsForActor({ db, actor: authSession.currentUser, productionId: productionId! })
      }
      return listBoneyardStrips(productionId!)
    },
    enabled: !!productionId,
  })
  return {
    boneyardStrips: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}
