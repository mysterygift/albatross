import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { getPersonById, updatePerson } from '@/lib/db/repositories/person'
import { listBookingsByPerson } from '@/lib/db/repositories/booking'
import { listAvailabilityByPerson } from '@/lib/db/repositories/cast-availability'
import { listSceneCastByPerson, addSceneCast, removeSceneCast } from '@/lib/db/repositories/scene-cast'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import {
  listShotCastByPersonInProduction,
  addShotCast,
  removeShotCast,
} from '@/lib/db/repositories/shot-cast'
import {
  listShootDaysByProduction,
  listScenesByProduction,
  getSceneById,
  listShotsByProduction,
} from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { getScheduledSceneIdsByShootDay } from '@/lib/db/repositories/stripboard-strips'
import { isUnavailableOnDate } from '@/lib/db/repositories/cast-availability'
import { getPersonBookingsSummary } from '@/lib/people/bookingsSummary'
import { getPersonBookingNeedSummary } from '@/lib/people/bookingIntelligence'
import {
  listRecentPersonActivity,
  personRecentActivityQueryKey,
  type PersonActivityItem,
} from '@/lib/db/repositories/personActivity'
import { listShootDayUnitsByProduction } from '@/lib/db/repositories/shoot-day-units'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import {
  addSceneCastForActor,
  addShotCastForActor,
  getCastIdsBySceneIdsForActor,
  getPersonByIdForActor,
  getSceneByIdForActor,
  getScheduledSceneIdsByShootDayForActor,
  listAvailabilityByPersonForActor,
  listBookingsByPersonForActor,
  listLocationsByProductionForActor,
  listRecentPersonActivityForActor,
  listSceneCastByPersonForActor,
  listScenesByProductionForActor,
  listShootDayUnitsByProductionForActor,
  listShootDaysByProductionForActor,
  listShotCastByPersonInProductionForActor,
  listShotsByProductionForActor,
  listUnitsByProductionForActor,
  removeSceneCastForActor,
  removeShotCastForActor,
  updatePersonForActor,
} from '@/lib/access/projectDomainService'
import { PersonForm, type PersonFormValues } from '@/features/people/components/PersonForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Pencil, ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { Person } from '@/lib/db/types'
import type { Scene } from '@/lib/db/types'

const CONTRIBUTOR_FORM_LABELS: Record<Person['contributor_form_status'], string> = {
  not_requested: 'Not requested',
  requested: 'Requested',
  signed: 'Signed',
  expired: 'Expired',
}

export function CastDetailPage() {
  const { personId } = useParams<{ personId: string }>()
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [addScenesOpen, setAddScenesOpen] = useState(false)
  const [sceneSearchFilter, setSceneSearchFilter] = useState('')
  const [selectedSceneIdsToAdd, setSelectedSceneIdsToAdd] = useState<Set<string>>(new Set())
  const [addShotsOpen, setAddShotsOpen] = useState(false)
  const [shotSearchFilter, setShotSearchFilter] = useState('')
  const [selectedShotIdsToAdd, setSelectedShotIdsToAdd] = useState<Set<string>>(new Set())

  const { data: person, isLoading: personLoading } = useQuery({
    queryKey: ['person', personId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getPersonByIdForActor({
          db,
          actor: authSession.currentUser,
          personId: personId!,
        })
      }
      return getPersonById(personId!)
    },
    enabled: !!personId,
  })

  const { data: bookingsSummary } = useQuery({
    queryKey: ['person-bookings-summary', currentProductionId, personId],
    queryFn: () => getPersonBookingsSummary(currentProductionId!, personId!),
    enabled: !!currentProductionId && !!personId,
  })

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-by-person', personId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBookingsByPersonForActor({
          db,
          actor: authSession.currentUser,
          personId: personId!,
        })
      }
      return listBookingsByPerson(personId!)
    },
    enabled: !!personId,
  })

  const { data: availability = [] } = useQuery({
    queryKey: ['availability-by-person', personId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listAvailabilityByPersonForActor({
          db,
          actor: authSession.currentUser,
          personId: personId!,
        })
      }
      return listAvailabilityByPerson(personId!)
    },
    enabled: !!personId,
  })

  const { data: sceneCastList = [] } = useQuery({
    queryKey: ['scene-cast-by-person', personId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listSceneCastByPersonForActor({
          db,
          actor: authSession.currentUser,
          personId: personId!,
        })
      }
      return listSceneCastByPerson(personId!)
    },
    enabled: !!personId,
  })

  const { data: shotCastList = [] } = useQuery({
    queryKey: ['shot-cast-by-person', currentProductionId, personId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShotCastByPersonInProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId!,
          personId: personId!,
        })
      }
      return listShotCastByPersonInProduction(currentProductionId!, personId!)
    },
    enabled: !!currentProductionId && !!personId,
  })

  const { data: allShots = [] } = useQuery({
    queryKey: ['shots-by-production', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShotsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listShotsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId && (addShotsOpen || shotCastList.length > 0),
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listShootDaysByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: sceneIdsByDay = new Map<string, string[]>() } = useQuery({
    queryKey: ['dood-scenes-by-day', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return new Map<string, string[]>()
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getScheduledSceneIdsByShootDayForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return getScheduledSceneIdsByShootDay(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const allSceneIds = useMemo(() => {
    const set = new Set<string>()
    for (const ids of sceneIdsByDay.values()) {
      for (const id of ids) set.add(id)
    }
    return Array.from(set)
  }, [sceneIdsByDay])

  const { data: castBySceneId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-scene', allSceneIds.join(',')],
    queryFn: async () => {
      if (!currentProductionId) return new Map<string, string[]>()
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getCastIdsBySceneIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          sceneIds: allSceneIds,
        })
      }
      return getCastIdsBySceneIds(allSceneIds)
    },
    enabled: allSceneIds.length > 0,
  })

  const workDatesForPerson = useMemo(() => {
    if (!personId) return new Set<string>()
    const workDates = new Set<string>()
    for (const day of shootDays) {
      const sceneIds = sceneIdsByDay.get(day.id) ?? []
      const personIds = new Set<string>()
      for (const sid of sceneIds) {
        for (const pid of castBySceneId.get(sid) ?? []) personIds.add(pid)
      }
      if (personIds.has(personId)) workDates.add(day.shoot_date)
    }
    return workDates
  }, [personId, shootDays, sceneIdsByDay, castBySceneId])

  const doodSummary = useMemo(() => {
    const workDateList = Array.from(workDatesForPerson).sort()
    let clashCount = 0
    for (const d of workDateList) {
      if (isUnavailableOnDate(availability, d)) clashCount++
    }
    return {
      firstWorkDay: workDateList[0] ?? null,
      lastWorkDay: workDateList[workDateList.length - 1] ?? null,
      workDays: workDateList.length,
      clashCount,
    }
  }, [workDatesForPerson, availability])

  const { data: recentActivity = [] } = useQuery({
    queryKey: personRecentActivityQueryKey(currentProductionId ?? '', personId ?? ''),
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listRecentPersonActivityForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId!,
          personId: personId!,
          limit: 8,
        })
      }
      return listRecentPersonActivity(currentProductionId!, personId!, 8)
    },
    enabled: !!currentProductionId && !!personId,
  })

  const { data: personNeedSummary } = useQuery({
    queryKey: ['person-booking-need', currentProductionId, personId],
    queryFn: () => getPersonBookingNeedSummary(currentProductionId!, personId!),
    enabled: !!currentProductionId && !!personId,
  })

  const { data: shootDayUnits = [] } = useQuery({
    queryKey: ['shoot-day-units', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDayUnitsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listShootDayUnitsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: units = [] } = useQuery({
    queryKey: ['units', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listUnitsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listUnitsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const shootDayById = useMemo(() => {
    const m = new Map<string, { shoot_date: string; day_number?: number }>()
    for (const d of shootDays)
      m.set(d.id, { shoot_date: d.shoot_date, day_number: d.day_number ?? undefined })
    return m
  }, [shootDays])

  const unitNamesByShootDayId = useMemo(() => {
    const m = new Map<string, string[]>()
    const unitById = new Map(units.map((u) => [u.id, u.name]))
    for (const sdu of shootDayUnits) {
      const name = unitById.get(sdu.unit_id)
      if (name) {
        const arr = m.get(sdu.shoot_day_id) ?? []
        if (!arr.includes(name)) arr.push(name)
        m.set(sdu.shoot_day_id, arr)
      }
    }
    return m
  }, [shootDayUnits, units])

  const sceneIdsFromCast = useMemo(() => new Set(sceneCastList.map((sc) => sc.scene_id)), [sceneCastList])

  const shotIdsFromShotCast = useMemo(() => new Set(shotCastList.map((sc) => sc.shot_id)), [shotCastList])
  const shotsForShotCast = useMemo(
    () => allShots.filter((s) => shotIdsFromShotCast.has(s.id)),
    [allShots, shotIdsFromShotCast]
  )
  const sceneIdsFromShotCast = useMemo(
    () => new Set(shotsForShotCast.map((s) => s.scene_id)),
    [shotsForShotCast]
  )

  const { data: allScenes = [] } = useQuery({
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
    enabled: !!currentProductionId && !!person?.is_cast,
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

  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations])

  const allSceneIdsForQuery = useMemo(
    () => Array.from(new Set([...sceneIdsFromCast, ...sceneIdsFromShotCast])),
    [sceneIdsFromCast, sceneIdsFromShotCast]
  )

  const { data: scenesById = new Map<string, Scene>() } = useQuery({
    queryKey: ['scenes-by-ids', allSceneIdsForQuery.join(',')],
    queryFn: async () => {
      const map = new Map<string, Scene>()
      for (const id of allSceneIdsForQuery) {
        const scene =
          authSession.authSupported && authSession.currentUser
            ? await (async () => {
                const db = await getDb()
                return getSceneByIdForActor({
                  db,
                  actor: authSession.currentUser!,
                  sceneId: id,
                })
              })()
            : await getSceneById(id)
        if (scene) map.set(id, scene)
      }
      return map
    },
    enabled: allSceneIdsForQuery.length > 0,
  })

  const scenesAvailableToAdd = useMemo(() => {
    const attached = sceneIdsFromCast
    return allScenes
      .filter((s) => !attached.has(s.id))
      .sort((a, b) => (a.scene_number ?? '').localeCompare(b.scene_number ?? ''))
  }, [allScenes, sceneIdsFromCast])

  const scenesAvailableToAddFiltered = useMemo(() => {
    if (!sceneSearchFilter.trim()) return scenesAvailableToAdd
    const q = sceneSearchFilter.trim().toLowerCase()
    return scenesAvailableToAdd.filter(
      (s) =>
        (s.scene_number ?? '').toLowerCase().includes(q) ||
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.heading ?? '').toLowerCase().includes(q)
    )
  }, [scenesAvailableToAdd, sceneSearchFilter])

  const shotsById = useMemo(() => new Map(allShots.map((s) => [s.id, s])), [allShots])
  const scenesByIdForProduction = useMemo(() => new Map(allScenes.map((s) => [s.id, s])), [allScenes])
  const shotsAvailableToAdd = useMemo(() => {
    const attached = shotIdsFromShotCast
    return allShots
      .filter((s) => !attached.has(s.id))
      .sort((a, b) => {
        const sceneA = scenesByIdForProduction.get(a.scene_id)
        const sceneB = scenesByIdForProduction.get(b.scene_id)
        const snA = sceneA?.scene_number ?? ''
        const snB = sceneB?.scene_number ?? ''
        if (snA !== snB) return snA.localeCompare(snB)
        return (a.shot_number ?? '').localeCompare(b.shot_number ?? '')
      })
  }, [allShots, shotIdsFromShotCast, scenesByIdForProduction])

  const shotsAvailableToAddFiltered = useMemo(() => {
    if (!shotSearchFilter.trim()) return shotsAvailableToAdd
    const q = shotSearchFilter.trim().toLowerCase()
    return shotsAvailableToAdd.filter((s) => {
      const scene = scenesByIdForProduction.get(s.scene_id)
      const sceneNum = (scene?.scene_number ?? '').toLowerCase()
      const shotNum = (s.shot_number ?? '').toLowerCase()
      const desc = (s.description ?? s.shot_description ?? s.subject ?? '').toLowerCase()
      return sceneNum.includes(q) || shotNum.includes(q) || desc.includes(q)
    })
  }, [shotsAvailableToAdd, shotSearchFilter, scenesByIdForProduction])

  const addScenesMutation = useMutation({
    mutationFn: async (sceneIds: string[]) => {
      if (!currentProductionId || !personId) return
      for (const sceneId of sceneIds) {
        if (authSession.authSupported && authSession.currentUser) {
          const db = await getDb()
          await addSceneCastForActor({
            db,
            actor: authSession.currentUser,
            data: {
              production_id: currentProductionId,
              scene_id: sceneId,
              person_id: personId,
            },
          })
        } else {
          await addSceneCast({
            production_id: currentProductionId,
            scene_id: sceneId,
            person_id: personId,
          })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-person', personId] })
      queryClient.invalidateQueries({ queryKey: personRecentActivityQueryKey(currentProductionId!, personId!) })
      queryClient.invalidateQueries({ queryKey: ['cast-by-scene'] })
      queryClient.invalidateQueries({ queryKey: ['dood-scenes-by-day', currentProductionId] })
      setAddScenesOpen(false)
      setSelectedSceneIdsToAdd(new Set())
    },
  })

  const removeSceneCastMutation = useMutation({
    mutationFn: async (sceneCastId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return removeSceneCastForActor({
          db,
          actor: authSession.currentUser,
          sceneCastId,
        })
      }
      return removeSceneCast(sceneCastId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-person', personId] })
      queryClient.invalidateQueries({ queryKey: personRecentActivityQueryKey(currentProductionId!, personId!) })
      queryClient.invalidateQueries({ queryKey: ['cast-by-scene'] })
      queryClient.invalidateQueries({ queryKey: ['dood-scenes-by-day', currentProductionId] })
    },
  })

  const addShotsMutation = useMutation({
    mutationFn: async (shotIds: string[]) => {
      if (!currentProductionId || !personId) return
      for (const shotId of shotIds) {
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shot-cast-by-person', currentProductionId, personId] })
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-person', personId] })
      queryClient.invalidateQueries({ queryKey: personRecentActivityQueryKey(currentProductionId!, personId!) })
      queryClient.invalidateQueries({ queryKey: ['scenes-by-ids'] })
      setAddShotsOpen(false)
      setSelectedShotIdsToAdd(new Set())
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
      queryClient.invalidateQueries({ queryKey: ['shot-cast-by-person', currentProductionId, personId] })
      queryClient.invalidateQueries({ queryKey: personRecentActivityQueryKey(currentProductionId!, personId!) })
      queryClient.invalidateQueries({ queryKey: ['scenes-by-ids'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<PersonFormValues>) => {
      const payload = {
        ...data,
        is_cast: data.is_cast !== undefined ? (data.is_cast ? 1 : 0) : undefined,
        cast_number: data.cast_number !== undefined ? (data.cast_number?.trim() || null) : undefined,
        agent_name: data.agent_name !== undefined ? (data.agent_name?.trim() || null) : undefined,
        agent_email: data.agent_email !== undefined ? (data.agent_email?.trim() || null) : undefined,
        agent_phone: data.agent_phone !== undefined ? (data.agent_phone?.trim() || null) : undefined,
      }
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return updatePersonForActor({
          db,
          actor: authSession.currentUser,
          personId: personId!,
          data: payload,
        })
      }
      return updatePerson(personId!, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] })
      queryClient.invalidateQueries({ queryKey: ['people', currentProductionId] })
      setEditOpen(false)
    },
  })

  if (!personId || !currentProductionId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        Select a production first.
      </div>
    )
  }

  if (personLoading || person == null) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        {personLoading ? 'Loading…' : 'Person not found.'}
      </div>
    )
  }

  if (person.production_id !== currentProductionId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        Person not found for this production.
      </div>
    )
  }

  const nextBookedDay = bookingsSummary?.start_date ?? null
  const typeLabel = person.is_cast ? 'Cast' : 'Crew'

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link to="/people/cast" aria-label="Back to People">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground truncate">{person.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{typeLabel}</span>
            {person.department && <span>{person.department}</span>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 size-4" />
          Edit
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 min-w-0">
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Bookings</p>
            <p className="text-lg font-semibold text-foreground">{bookingsSummary?.booked_days_count ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Next booked</p>
            <p className="text-lg font-semibold text-foreground truncate" title={nextBookedDay ?? undefined}>
              {nextBookedDay
                ? new Date(nextBookedDay).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Clashes</p>
            <p className="text-lg font-semibold text-foreground">{doodSummary.clashCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Availability entries</p>
            <p className="text-lg font-semibold text-foreground">{availability.length}</p>
          </CardContent>
        </Card>
        {person.is_cast && (
          <>
            <Card className="border-border bg-card min-w-0 overflow-hidden">
              <CardContent className="px-4 pt-4 pb-4 min-w-0">
                <p className="text-xs text-muted-foreground truncate">Contributor form</p>
                <p className="text-lg font-semibold text-foreground truncate">
                  {CONTRIBUTOR_FORM_LABELS[person.contributor_form_status]}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card min-w-0 overflow-hidden">
              <CardContent className="px-4 pt-4 pb-4 min-w-0">
                <p className="text-xs text-muted-foreground truncate">Cast #</p>
                <p className="text-lg font-semibold text-foreground truncate">{person.cast_number ?? '—'}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Overview */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-1">
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
            <div><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{person.name}</dd></div>
            <div><dt className="text-muted-foreground">Type</dt><dd className="font-medium">{typeLabel}</dd></div>
            <div><dt className="text-muted-foreground">Department</dt><dd className="font-medium">{person.department ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium">{person.email ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{person.phone ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Phases</dt><dd className="font-medium">{person.phases ?? '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="font-medium">{person.notes ?? '—'}</dd></div>
          </dl>
          {person.is_cast && (
            <>
              <h3 className="text-sm font-medium text-foreground pt-2">Cast / contributor</h3>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                <div><dt className="text-muted-foreground">Cast number</dt><dd className="font-medium">{person.cast_number ?? '—'}</dd></div>
                <div><dt className="text-muted-foreground">Contributor form</dt><dd className="font-medium">{CONTRIBUTOR_FORM_LABELS[person.contributor_form_status]}</dd></div>
                <div><dt className="text-muted-foreground">Agent name</dt><dd className="font-medium">{person.agent_name ?? '—'}</dd></div>
                <div><dt className="text-muted-foreground">Agent email</dt><dd className="font-medium">{person.agent_email ?? '—'}</dd></div>
                <div><dt className="text-muted-foreground">Agent phone</dt><dd className="font-medium">{person.agent_phone ?? '—'}</dd></div>
              </dl>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bookings */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Bookings</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/people/bookings">
              <ExternalLink className="mr-2 size-4" />
              View in Bookings
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Total: {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
            {nextBookedDay && ` · Next: ${new Date(nextBookedDay).toLocaleDateString('en-GB')}`}
          </p>
          {personNeedSummary && (
            <p className="text-sm text-muted-foreground mb-3">
              Days needed: {personNeedSummary.daysNeeded} · Booked: {personNeedSummary.daysBooked}
              {personNeedSummary.daysMissingBooking > 0 && (
                <span className="text-amber-600 dark:text-amber-400"> · Missing: {personNeedSummary.daysMissingBooking}</span>
              )}
              {personNeedSummary.daysBookedButNotNeeded > 0 && (
                <span className="text-zinc-500"> · Booked but not needed: {personNeedSummary.daysBookedButNotNeeded}</span>
              )}
            </p>
          )}
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings
                  .map((b) => ({
                    ...b,
                    shootDate: b.shoot_day_id ? shootDayById.get(b.shoot_day_id)?.shoot_date : null,
                    unitNames: b.shoot_day_id ? unitNamesByShootDayId.get(b.shoot_day_id) ?? [] : [],
                  }))
                  .sort((a, b) => (a.shootDate ?? '').localeCompare(b.shootDate ?? ''))
                  .map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.shootDate ? new Date(b.shootDate).toLocaleDateString('en-GB') : b.start_date ?? '—'}</TableCell>
                      <TableCell>{b.unitNames.length ? b.unitNames.join(', ') : '—'}</TableCell>
                      <TableCell>{b.role ?? '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{b.notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Availability */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-1">
          <CardTitle className="text-base">Availability</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {availability.length === 0 ? (
            <p className="text-sm text-muted-foreground">No availability entries.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availability.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{new Date(a.start_date).toLocaleDateString('en-GB')}</TableCell>
                    <TableCell>{new Date(a.end_date).toLocaleDateString('en-GB')}</TableCell>
                    <TableCell>{a.availability}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{a.notes ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Scene participation (cast) */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Scene participation</CardTitle>
          {person.is_cast && (
            <Button variant="outline" size="sm" onClick={() => setAddScenesOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add to scenes
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {!person.is_cast ? (
            <p className="text-sm text-muted-foreground">No scene participation (crew).</p>
          ) : sceneCastList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scenes assigned. Use “Add to scenes” to assign this cast member to scenes.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {sceneCastList.length} scene{sceneCastList.length !== 1 ? 's' : ''}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scene</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Heading</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Int/Ext</TableHead>
                    <TableHead>Day/Night</TableHead>
                    {person.is_cast && <TableHead className="w-[80px]"> </TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sceneCastList
                    .map((sc) => ({ sc, scene: scenesById.get(sc.scene_id) }))
                    .filter(({ scene }) => scene != null)
                    .sort((a, b) => (a.scene?.scene_number ?? '').localeCompare(b.scene?.scene_number ?? ''))
                    .map(({ sc, scene }) => (
                      <TableRow key={sc.id}>
                        <TableCell>{scene!.scene_number}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{scene!.title ?? '—'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{scene!.heading ?? '—'}</TableCell>
                        <TableCell className="max-w-[120px] truncate">{scene!.location_id ? (locationById.get(scene!.location_id) ?? '—') : '—'}</TableCell>
                        <TableCell>{scene!.int_ext ?? '—'}</TableCell>
                        <TableCell>{scene!.day_night ?? '—'}</TableCell>
                        {person.is_cast && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeSceneCastMutation.mutate(sc.id)}
                              disabled={removeSceneCastMutation.isPending}
                              aria-label="Remove from scene"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Shot participation (cast) */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Shot participation</CardTitle>
          {person.is_cast && (
            <Button variant="outline" size="sm" onClick={() => setAddShotsOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add to shots
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {!person.is_cast ? (
            <p className="text-sm text-muted-foreground">No shot participation (crew).</p>
          ) : shotCastList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shots assigned. Use “Add to shots” to assign this cast member to specific shots within their scenes.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {shotCastList.length} shot{shotCastList.length !== 1 ? 's' : ''}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shot</TableHead>
                    <TableHead>Scene</TableHead>
                    <TableHead>Description / subject</TableHead>
                    {person.is_cast && <TableHead className="w-[80px]"> </TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shotCastList
                    .map((sc) => ({ sc, shot: shotsById.get(sc.shot_id) }))
                    .filter(({ shot }) => shot != null)
                    .map(({ sc, shot }) => ({ sc, shot: shot!, scene: scenesById.get(shot!.scene_id) }))
                    .filter(({ scene }) => scene != null)
                    .sort((a, b) => {
                      const snA = a.scene!.scene_number ?? ''
                      const snB = b.scene!.scene_number ?? ''
                      if (snA !== snB) return snA.localeCompare(snB)
                      return (a.shot.shot_number ?? '').localeCompare(b.shot.shot_number ?? '')
                    })
                    .map(({ sc, shot, scene }) => (
                      <TableRow key={sc.id}>
                        <TableCell>{shot.shot_number}</TableCell>
                        <TableCell>{scene!.scene_number}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {shot.description ?? shot.shot_description ?? shot.subject ?? '—'}
                        </TableCell>
                        {person.is_cast && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeShotCastMutation.mutate(sc.id)}
                              disabled={removeShotCastMutation.isPending}
                              aria-label="Remove from shot"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add to scenes dialog */}
      <Dialog open={addScenesOpen} onOpenChange={(open) => { setAddScenesOpen(open); if (!open) setSelectedSceneIdsToAdd(new Set()); setSceneSearchFilter(''); }}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <h3 className="text-base font-semibold">Add to scenes</h3>
          <p className="text-sm text-muted-foreground">Select scenes to assign this cast member to.</p>
          <Input
            placeholder="Filter by scene number, title…"
            value={sceneSearchFilter}
            onChange={(e) => setSceneSearchFilter(e.target.value)}
            className="mt-2"
          />
          <div className="flex-1 min-h-0 overflow-auto border rounded-md mt-2">
            {scenesAvailableToAddFiltered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {scenesAvailableToAdd.length === 0 ? 'All production scenes are already assigned.' : 'No scenes match the filter.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"> </TableHead>
                    <TableHead>Scene</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Heading</TableHead>
                    <TableHead>Int/Ext</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenesAvailableToAddFiltered.map((scene) => (
                    <TableRow
                      key={scene.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedSceneIdsToAdd((prev) => {
                        const next = new Set(prev)
                        if (next.has(scene.id)) next.delete(scene.id)
                        else next.add(scene.id)
                        return next
                      })}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedSceneIdsToAdd.has(scene.id)}
                          onChange={(e) => setSelectedSceneIdsToAdd((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(scene.id)
                            else next.delete(scene.id)
                            return next
                          })}
                        />
                      </TableCell>
                      <TableCell>{scene.scene_number}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{scene.title ?? '—'}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{scene.heading ?? '—'}</TableCell>
                      <TableCell>{scene.int_ext ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setAddScenesOpen(false); setSelectedSceneIdsToAdd(new Set()); }}>
              Cancel
            </Button>
            <Button
              disabled={selectedSceneIdsToAdd.size === 0 || addScenesMutation.isPending}
              onClick={() => addScenesMutation.mutate(Array.from(selectedSceneIdsToAdd))}
            >
              Add selected ({selectedSceneIdsToAdd.size})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to shots dialog */}
      <Dialog
        open={addShotsOpen}
        onOpenChange={(open) => {
          setAddShotsOpen(open)
          if (!open) setSelectedShotIdsToAdd(new Set())
          setShotSearchFilter('')
        }}
      >
        <DialogContent className="max-h-[85vh] flex flex-col">
          <h3 className="text-base font-semibold">Add to shots</h3>
          <p className="text-sm text-muted-foreground">
            Select shots to assign this cast member to. They will be added to the parent scene if not already in it.
          </p>
          <Input
            placeholder="Filter by scene, shot number, description…"
            value={shotSearchFilter}
            onChange={(e) => setShotSearchFilter(e.target.value)}
            className="mt-2"
          />
          <div className="flex-1 min-h-0 overflow-auto border rounded-md mt-2">
            {shotsAvailableToAddFiltered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {shotsAvailableToAdd.length === 0
                  ? 'All production shots are already assigned to this cast member.'
                  : 'No shots match the filter.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"> </TableHead>
                    <TableHead>Shot</TableHead>
                    <TableHead>Scene</TableHead>
                    <TableHead>Description / subject</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shotsAvailableToAddFiltered.map((shot) => {
                    const scene = scenesByIdForProduction.get(shot.scene_id)
                    return (
                      <TableRow
                        key={shot.id}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedShotIdsToAdd((prev) => {
                            const next = new Set(prev)
                            if (next.has(shot.id)) next.delete(shot.id)
                            else next.add(shot.id)
                            return next
                          })
                        }
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedShotIdsToAdd.has(shot.id)}
                            onChange={(e) =>
                              setSelectedShotIdsToAdd((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(shot.id)
                                else next.delete(shot.id)
                                return next
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>{shot.shot_number}</TableCell>
                        <TableCell>{scene?.scene_number ?? '—'}</TableCell>
                        <TableCell className="max-w-[180px] truncate">
                          {shot.description ?? shot.shot_description ?? shot.subject ?? '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setAddShotsOpen(false)
                setSelectedShotIdsToAdd(new Set())
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={selectedShotIdsToAdd.size === 0 || addShotsMutation.isPending}
              onClick={() => addShotsMutation.mutate(Array.from(selectedShotIdsToAdd))}
            >
              Add selected ({selectedShotIdsToAdd.size})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DooD summary */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Day out of Days</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/people/day-out-of-days">
              <ExternalLink className="mr-2 size-4" />
              View in DooD
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div>
              <p className="text-muted-foreground">First work day</p>
              <p className="font-medium">
                {doodSummary.firstWorkDay
                  ? new Date(doodSummary.firstWorkDay).toLocaleDateString('en-GB')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Last work day</p>
              <p className="font-medium">
                {doodSummary.lastWorkDay
                  ? new Date(doodSummary.lastWorkDay).toLocaleDateString('en-GB')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Work days</p>
              <p className="font-medium">{doodSummary.workDays}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Clashes</p>
              <p className="font-medium">{doodSummary.clashCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentActivity.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentActivity.map((item: PersonActivityItem) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="shrink-0 w-[52px] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.entity_type === 'booking'
                      ? 'Booking'
                      : item.entity_type === 'availability'
                        ? 'Availability'
                        : 'Scene'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground font-medium">{item.title}</p>
                    {item.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                  <span className="text-muted-foreground shrink-0 w-[82px] text-right">
                    {new Date(item.activity_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <PersonForm
            defaultValues={person}
            onSubmit={(d) => updateMutation.mutate(d)}
            onCancel={() => setEditOpen(false)}
            isLoading={updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
