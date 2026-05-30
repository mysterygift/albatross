import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Document, Page, pdfjs } from 'react-pdf'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  getCastIdsBySceneIdsForActor,
  getCastIdsByShotIdsForActor,
  getProductionByIdForActor,
  getShootDayByIdForActor,
  listBookingsByShootDayForActor,
  listCastForActor,
  listCrewForActor,
  listEpisodesByProductionForActor,
  listKeyContactsByProductionForActor,
  listLocationsByProductionForActor,
  listScenesByProductionForActor,
  listShootDaysByProductionForActor,
  listShootDayUnitsByProductionForActor,
  listShootDayUnitsByShootDayForActor,
  listShotsByProductionForActor,
  listShootingBlocsByProductionForActor,
  listStripsByProductionForActor,
  listStripsByShootDayForActor,
  listUnitsByProductionForActor,
  updateShootDayForActor,
} from '@/lib/access/projectDomainService'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { callSheetsTutorialSteps } from '@/features/tutorial/sections/callSheetsTutorial'
import { listShootDaysByProduction, getShootDayById, updateShootDay } from '@/lib/db/repositories/schedule'
import { listStripsByShootDay, listStripsByProduction } from '@/lib/db/repositories/stripboard-strips'
import { listShootDayUnitsByShootDay, listShootDayUnitsByProduction } from '@/lib/db/repositories/shoot-day-units'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listScenesByProduction, listShotsByProduction } from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listKeyContactsByProduction } from '@/lib/db/repositories/key-contacts'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { getCastIdsByShotIds } from '@/lib/db/repositories/shot-cast'
import { listBookingsByShootDay } from '@/lib/db/repositories/booking'
import { listCast, listCrew } from '@/lib/db/repositories/person'
import {
  getCallSheetCastRequirements,
  getCastCalledNames,
  type CallSheetCastResult,
  type CallSheetCastRow,
} from '@/lib/call-sheets/castRequirements'
import { getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
import {
  getEffectiveCrewHierarchyOrDefault,
  getDefaultCrewHierarchyConfig,
} from '@/lib/people/crewHierarchyResolver'
import { getProductionById } from '@/lib/db/repositories/production'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import { listShootingBlocsByProduction } from '@/lib/db/repositories/shootingBlocs'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import {
  callSheetIncludeEpisodesSettingKey,
  enrichCallSheetStripEpisodeLabel,
  shootingBlocMastheadLabelForCallSheet,
} from '@/lib/call-sheets/callSheetEpisodic'
import { generateCallSheetPdf, parseCallSheetWeatherJson } from '@/lib/pdf/callSheet'
import type { CallSheetData } from '@/lib/pdf/callSheet'
import { selectPrimaryCallSheetContacts } from '@/lib/call-sheets/primaryContacts'
import {
  buildCallSheetStripFromStripboard,
  castPersonIdsForStrip,
  resolveSceneAndShotForStripboardStrip,
  type BuildScheduleStripContext,
} from '@/lib/call-sheets/scheduleStripRow'
import { bookingStartSortKey, formatBookingTimeWindow } from '@/lib/call-sheets/bookingCallTimes'
import { buildAdvancedScheduleForCallSheet } from '@/lib/call-sheets/advancedSchedule'
import { saveFileWithDialog, openInSystem } from '@/lib/files'
import { getWeatherForCallSheet } from '@/lib/weather/openMeteo'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { CallSheetDistributionDialog, type CallSheetRecipient } from '@/features/call-sheets/CallSheetDistributionDialog'
import { exportDistributedCallSheets } from '@/features/call-sheets/exportDistributedCallSheets'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const defaultCrewHierarchy = getDefaultCrewHierarchyConfig()

export function CallSheetsPage() {
  const queryClient = useQueryClient()
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [shootDayId, setShootDayId] = useState<string | null>(null)
  const [shootDayUnitId, setShootDayUnitId] = useState<string | null>(null)
  const [weatherSummary, setWeatherSummary] = useState('')
  const [sunriseManual, setSunriseManual] = useState('')
  const [sunsetManual, setSunsetManual] = useState('')
  const [safetyInformation, setSafetyInformation] = useState('')
  const [safetySaveStatus, setSafetySaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const safetyDirtyRef = useRef(false)
  const [weatherFallbackMessage, setWeatherFallbackMessage] = useState<string | null>(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [distributionOpen, setDistributionOpen] = useState(false)
  const [distributionStatus, setDistributionStatus] = useState<{
    loading: boolean
    message: string | null
    error: string | null
  }>({ loading: false, message: null, error: null })
  const [distributionExportSuccessMessage, setDistributionExportSuccessMessage] = useState<
    string | null
  >(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  useEffect(() => {
    if (progress?.currentSection === 'call_sheets') {
      setTutorialOpen(true)
    }
  }, [progress?.currentSection])

  const { data: production } = useQuery({
    queryKey: ['production', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getProductionByIdForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return getProductionById(currentProductionId!)
    },
    enabled: !!currentProductionId,
  })

  const { data: episodesForProduction = [] } = useQuery({
    queryKey: ['episodes-callsheet', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listEpisodesByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listEpisodesByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId && production?.is_episodic === true,
  })

  const { data: shootingBlocsForProduction = [] } = useQuery({
    queryKey: ['shooting-blocs-callsheet', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootingBlocsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listShootingBlocsByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId && production?.is_episodic === true,
  })

  const includeEpisodesSettingKey =
    currentProductionId != null ? callSheetIncludeEpisodesSettingKey(currentProductionId) : null

  const { data: includeEpisodesRaw = null } = useQuery({
    queryKey: ['call-sheet-include-episodes', includeEpisodesSettingKey],
    queryFn: () => getSetting(includeEpisodesSettingKey!),
    enabled: !!includeEpisodesSettingKey && production?.is_episodic === true,
  })

  const includeEpisodesPersisted = includeEpisodesRaw === 'true'

  const persistIncludeEpisodesMutation = useMutation({
    mutationFn: async (checked: boolean) => {
      if (!includeEpisodesSettingKey) return
      await setSetting(includeEpisodesSettingKey, checked ? 'true' : 'false')
    },
    onSuccess: () => {
      if (includeEpisodesSettingKey) {
        void queryClient.invalidateQueries({ queryKey: ['call-sheet-include-episodes', includeEpisodesSettingKey] })
      }
    },
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listShootDaysByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: shootDay } = useQuery({
    queryKey: ['shoot-day', shootDayId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getShootDayByIdForActor({ db, actor: authSession.currentUser, shootDayId: shootDayId! })
      }
      return getShootDayById(shootDayId!)
    },
    enabled: !!shootDayId,
  })

  const { data: dayUnits = [] } = useQuery({
    queryKey: ['shoot-day-units', shootDayId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDayUnitsByShootDayForActor({ db, actor: authSession.currentUser, shootDayId: shootDayId! })
      }
      return listShootDayUnitsByShootDay(shootDayId!)
    },
    enabled: !!shootDayId,
  })

  const { data: strips = [] } = useQuery({
    queryKey: ['strips', shootDayId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listStripsByShootDayForActor({ db, actor: authSession.currentUser, shootDayId: shootDayId! })
      }
      return listStripsByShootDay(shootDayId!)
    },
    enabled: !!shootDayId,
  })

  const { data: scenes = [] } = useQuery({
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

  const { data: shots = [] } = useQuery({
    queryKey: ['shots', currentProductionId],
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

  const { data: locations = [] } = useQuery({
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

  const { data: keyContacts = [] } = useQuery({
    queryKey: ['key-contacts', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listKeyContactsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listKeyContactsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: hierarchyData } = useQuery({
    queryKey: ['crew-hierarchy', currentProductionId],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(currentProductionId),
    enabled: !!currentProductionId,
  })
  const crewHierarchy = hierarchyData ?? defaultCrewHierarchy

  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCastForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listCast(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: crew = [] } = useQuery({
    queryKey: ['crew', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCrewForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listCrew(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: units = [] } = useQuery({
    queryKey: ['units', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listUnitsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listUnitsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: allProductionStrips = [] } = useQuery({
    queryKey: ['strips-production-callsheet', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listStripsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listStripsByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId,
  })

  const { data: allShootDayUnits = [] } = useQuery({
    queryKey: ['shoot-day-units-production', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDayUnitsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listShootDayUnitsByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId,
  })

  const unitStrips = useMemo(
    () => strips.filter((s) => s.shoot_day_unit_id === shootDayUnitId).sort((a, b) => a.sort_index - b.sort_index),
    [strips, shootDayUnitId]
  )

  const sceneIdsScheduled = useMemo(() => unitStrips.filter((s) => s.scene_id).map((s) => s.scene_id!), [unitStrips])
  const shotIdsScheduled = useMemo(() => unitStrips.filter((s) => s.shot_id).map((s) => s.shot_id!), [unitStrips])

  const { data: castBySceneId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-scene-callsheet', sceneIdsScheduled.join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsBySceneIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          sceneIds: sceneIdsScheduled,
        })
      }
      return getCastIdsBySceneIds(sceneIdsScheduled)
    },
    enabled: sceneIdsScheduled.length > 0,
  })

  const { data: castByShotId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-shot-callsheet', shotIdsScheduled.join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsByShotIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          shotIds: shotIdsScheduled,
        })
      }
      return getCastIdsByShotIds(shotIdsScheduled)
    },
    enabled: shotIdsScheduled.length > 0,
  })

  const advancedFutureShootDayIds = useMemo(() => {
    if (!shootDay) return [] as string[]
    return shootDays
      .filter((d) => d.shoot_date.localeCompare(shootDay.shoot_date) > 0)
      .sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
      .slice(0, 2)
      .map((d) => d.id)
  }, [shootDay, shootDays])

  const advancedSceneIds = useMemo(() => {
    if (advancedFutureShootDayIds.length === 0) return [] as string[]
    const daySet = new Set(advancedFutureShootDayIds)
    const ids = new Set<string>()
    for (const s of allProductionStrips) {
      if (s.shoot_day_id && daySet.has(s.shoot_day_id) && s.scene_id) ids.add(s.scene_id)
    }
    return [...ids]
  }, [advancedFutureShootDayIds, allProductionStrips])

  const advancedShotIds = useMemo(() => {
    if (advancedFutureShootDayIds.length === 0) return [] as string[]
    const daySet = new Set(advancedFutureShootDayIds)
    const ids = new Set<string>()
    for (const s of allProductionStrips) {
      if (s.shoot_day_id && daySet.has(s.shoot_day_id) && s.shot_id) ids.add(s.shot_id)
    }
    return [...ids]
  }, [advancedFutureShootDayIds, allProductionStrips])

  const { data: advCastBySceneId = new Map<string, string[]>() } = useQuery({
    queryKey: ['adv-cast-scenes-callsheet', [...advancedSceneIds].sort().join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsBySceneIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          sceneIds: advancedSceneIds,
        })
      }
      return getCastIdsBySceneIds(advancedSceneIds)
    },
    enabled: advancedSceneIds.length > 0,
  })

  const { data: advCastByShotId = new Map<string, string[]>() } = useQuery({
    queryKey: ['adv-cast-shots-callsheet', [...advancedShotIds].sort().join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsByShotIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          shotIds: advancedShotIds,
        })
      }
      return getCastIdsByShotIds(advancedShotIds)
    },
    enabled: advancedShotIds.length > 0,
  })

  const castBySceneMerged = useMemo(() => {
    const m = new Map(castBySceneId)
    for (const [k, v] of advCastBySceneId) m.set(k, v)
    return m
  }, [castBySceneId, advCastBySceneId])

  const castByShotMerged = useMemo(() => {
    const m = new Map(castByShotId)
    for (const [k, v] of advCastByShotId) m.set(k, v)
    return m
  }, [castByShotId, advCastByShotId])

  const { data: bookingsForDay = [] } = useQuery({
    queryKey: ['bookings-by-shoot-day', shootDayId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBookingsByShootDayForActor({ db, actor: authSession.currentUser, shootDayId: shootDayId! })
      }
      return listBookingsByShootDay(shootDayId!)
    },
    enabled: !!shootDayId,
  })

  const castResult: CallSheetCastResult = useMemo(() => {
    const bookedPersonIds = new Set(bookingsForDay.map((b) => b.person_id))
    return getCallSheetCastRequirements({
      sceneIdsScheduled,
      shotIdsScheduled,
      castBySceneId,
      castByShotId,
      bookedPersonIds,
      cast,
    })
  }, [sceneIdsScheduled, shotIdsScheduled, castBySceneId, castByShotId, bookingsForDay, cast])

  /** Principal cast for PDF: required+booked, enriched from person + day booking; ordered by booking time then cast ID. */
  const principalCastRows: CallSheetCastRow[] = useMemo(() => {
    const rows = castResult.castRows
    if (!rows.length) return []
    const peopleById = new Map(cast.map((p) => [p.id, p]))
    const bookingByPerson = new Map(bookingsForDay.map((b) => [b.person_id, b]))
    const enriched: CallSheetCastRow[] = rows.map((row) => {
      const p = peopleById.get(row.person_id)
      const b = bookingByPerson.get(row.person_id)
      const character_name = (b?.role?.trim() || p?.role_name?.trim()) || null
      const booking_schedule_line = formatBookingTimeWindow(b?.start_date, b?.end_date)
      const booking_notes = b?.notes?.trim() || null
      return { ...row, character_name, booking_schedule_line, booking_notes }
    })
    enriched.sort((a, b) => {
      const ba = bookingByPerson.get(a.person_id)
      const bb = bookingByPerson.get(b.person_id)
      const ka = bookingStartSortKey(ba?.start_date)
      const kb = bookingStartSortKey(bb?.start_date)
      if (ka !== kb) return ka - kb
      const na = a.cast_number?.trim() ?? ''
      const nb = b.cast_number?.trim() ?? ''
      if (na !== nb) return na.localeCompare(nb, undefined, { numeric: true })
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
    return enriched
  }, [castResult.castRows, cast, bookingsForDay])

  const castCalledNames = useMemo(() => getCastCalledNames(principalCastRows), [principalCastRows])

  const crewGroupsForPreview = useMemo(
    () => getCallSheetCrewRequirements(crewHierarchy, bookingsForDay, crew),
    [crewHierarchy, bookingsForDay, crew]
  )

  const locationIdsUsed = useMemo(() => {
    const shotById = new Map(shots.map((h) => [h.id, h]))
    const set = new Set<string>()
    for (const s of unitStrips) {
      const sceneId =
        s.scene_id ??
        (s.shot_id ? (shotById.get(s.shot_id)?.scene_id ?? null) : null)
      if (!sceneId) continue
      const scene = scenes.find((c) => c.id === sceneId)
      if (scene?.location_id) set.add(scene.location_id)
    }
    return Array.from(set)
  }, [unitStrips, scenes, shots])
  const locationsForDay = useMemo(
    () => locations.filter((l) => locationIdsUsed.includes(l.id)),
    [locations, locationIdsUsed]
  )

  const mealTimesFromDay = useMemo(() => {
    if (!shootDay?.meal_times_json) return []
    try {
      const arr = JSON.parse(shootDay.meal_times_json) as Array<{ name?: string; time?: string }>
      return Array.isArray(arr) ? arr.map((m) => ({ name: m.name ?? 'Meal', time: m.time ?? '—' })) : []
    } catch {
      return []
    }
  }, [shootDay?.meal_times_json])

  const weatherFromDay = shootDay?.weather_json
    ? (() => {
        try {
          const o = JSON.parse(shootDay.weather_json) as Record<string, unknown>
          const parts = [o.summary, o.high, o.low].filter(Boolean)
          return parts.length ? parts.join(' / ') : ''
        } catch {
          return ''
        }
      })()
    : ''

  const weatherStoredForDay = useMemo(
    () => parseCallSheetWeatherJson(shootDay?.weather_json ?? null),
    [shootDay?.weather_json],
  )

  useEffect(() => {
    setSunriseManual('')
    setSunsetManual('')
    safetyDirtyRef.current = false
    setSafetyInformation('')
    setSafetySaveStatus('idle')
  }, [shootDayId])

  useEffect(() => {
    if (!shootDayId || shootDay?.id !== shootDayId || safetyDirtyRef.current) return
    setSafetyInformation(shootDay.special_notes ?? '')
  }, [shootDayId, shootDay?.id, shootDay?.special_notes])

  const persistSafetyMutation = useMutation({
    mutationFn: async (vars: { shootDayId: string; special_notes: string | null }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return updateShootDayForActor({
          db,
          actor: authSession.currentUser,
          shootDayId: vars.shootDayId,
          data: { special_notes: vars.special_notes },
        })
      }
      return updateShootDay(vars.shootDayId, { special_notes: vars.special_notes })
    },
    onSuccess: (_data, vars) => {
      safetyDirtyRef.current = false
      setSafetySaveStatus('saved')
      void queryClient.invalidateQueries({ queryKey: ['shoot-day', vars.shootDayId] })
      if (currentProductionId) {
        void queryClient.invalidateQueries({ queryKey: ['shoot-days', currentProductionId] })
      }
    },
    onError: () => {
      setSafetySaveStatus('error')
    },
  })

  useEffect(() => {
    if (!shootDayId || !shootDay || shootDay.id !== shootDayId) return
    const dbValue = shootDay.special_notes ?? ''
    if (safetyInformation === dbValue) return
    setSafetySaveStatus('saving')
    const timer = window.setTimeout(() => {
      persistSafetyMutation.mutate({
        shootDayId,
        special_notes: safetyInformation.trim() || null,
      })
    }, 500)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on text input only
  }, [safetyInformation, shootDayId, shootDay?.id, shootDay?.special_notes])

  useEffect(() => {
    setDistributionExportSuccessMessage(null)
  }, [shootDayId, shootDayUnitId])

  useEffect(() => {
    if (!distributionExportSuccessMessage) return
    const t = setTimeout(() => setDistributionExportSuccessMessage(null), 6000)
    return () => clearTimeout(t)
  }, [distributionExportSuccessMessage])

  const buildCallSheetData = useMemo(() => {
    if (!production || !shootDay || !shootDayUnitId) return null
    const dayUnit = dayUnits.find((u) => u.id === shootDayUnitId)
    const unit = dayUnit ? units.find((u) => u.id === dayUnit.unit_id) : null
    const unitName = unit?.name ?? 'Main Unit'
    const isEpisodic = production.is_episodic === true
    const includeEpisodesInSchedule = isEpisodic && includeEpisodesPersisted
    const blocsById = new Map(shootingBlocsForProduction.map((b) => [b.id, b]))
    const episodeById = new Map(episodesForProduction.map((e) => [e.id, e]))
    const shotById = new Map(shots.map((h) => [h.id, h]))
    const sceneById = new Map(scenes.map((sc) => [sc.id, sc]))
    const shootingBlocMastheadLabel = shootingBlocMastheadLabelForCallSheet({
      isEpisodicProduction: isEpisodic,
      shootingBlocId: shootDay.shooting_bloc_id ?? null,
      blocsById,
    })
    const scheduleCtx: BuildScheduleStripContext = {
      castBySceneId: castBySceneMerged,
      castByShotId: castByShotMerged,
      castPeople: cast,
    }
    const locationNameById = new Map(locations.map((l) => [l.id, l.name]))
    const locState = { lastLocationId: null as string | null }
    const schedule = unitStrips.map((s) => {
      const { scene, shot } = resolveSceneAndShotForStripboardStrip(s, scenes, shots, sceneById)
      const locName =
        scene?.location_id != null
          ? (locations.find((l) => l.id === scene.location_id)?.name ?? null)
          : null
      const castIds = castPersonIdsForStrip(s, shot?.scene_id ?? scene?.id ?? null, scheduleCtx)
      const row = buildCallSheetStripFromStripboard(
        s,
        scene,
        shot,
        locName,
        locState,
        castIds,
        cast,
        locationNameById
      )
      if (!includeEpisodesInSchedule) return row
      const ep = enrichCallSheetStripEpisodeLabel({
        strip: s,
        shotById,
        sceneById,
        episodeById,
        includeEpisodes: true,
      })
      return { ...row, ...ep }
    })
    /** Only rows from `shoot_days.meal_times_json`; no fabricated defaults. */
    const mealTimes = mealTimesFromDay
    const keyContactsPdf = keyContacts.map((c) => ({
      department: c.department,
      name: c.name ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      notes: c.notes ?? null,
    }))
    /** Input shows text from typed state or stored summary/high/low (`weather_json`). */
    const manualFallbackFilled = !!(weatherSummary.trim() || weatherFromDay.trim())
    /** DB long-form `weather_manual` only when fallback is “on” from stored data, not when the user typed (typed text is not duplicated into this block). */
    const typedWeatherFallback = weatherSummary.trim()
    const weatherManualForPdf =
      manualFallbackFilled && !typedWeatherFallback ? (shootDay.weather_manual ?? null) : null
    return {
      productionName: production.name,
      isEpisodicProduction: isEpisodic,
      includeEpisodesInSchedule,
      shootingBlocMastheadLabel,
      shootDate: shootDay.shoot_date,
      unitName,
      dayNumber: shootDay.day_number ?? null,
      callTime: shootDay.call_time ?? null,
      wrapTime: shootDay.wrap_time ?? null,
      dayNotes: shootDay.notes ?? null,
      unitNotes: dayUnit?.notes ?? null,
      keyContacts: keyContactsPdf,
      primaryContactsTop: selectPrimaryCallSheetContacts(keyContactsPdf),
      weatherManual: weatherManualForPdf,
      weatherStored: weatherStoredForDay,
      weatherSunrise: sunriseManual.trim() || weatherStoredForDay?.sunrise?.trim() || null,
      weatherSunset: sunsetManual.trim() || weatherStoredForDay?.sunset?.trim() || null,
      hospitalName: shootDay.hospital_name ?? null,
      hospitalAddress: shootDay.hospital_address ?? null,
      policeStationName: shootDay.police_station_name ?? null,
      policeStationAddress: shootDay.police_station_address ?? null,
      weatherSummary: null,
      parkingBaseAddress: shootDay.parking_base_address ?? null,
      mealTimes,
      specialNotes: shootDay.special_notes ?? null,
      schedule,
      castCalled: castCalledNames,
      castCalledRows: principalCastRows,
      crewGroups: getCallSheetCrewRequirements(crewHierarchy, bookingsForDay, crew),
      locations: locationsForDay.map((l) => ({
        name: l.name,
        address: l.address,
        what3words: l.what3words ?? null,
        notes: l.notes ?? null,
      })),
      advancedScheduleDays: buildAdvancedScheduleForCallSheet({
        currentShootDate: shootDay.shoot_date,
        shootDays,
        currentUnitId: dayUnit?.unit_id ?? null,
        allStrips: allProductionStrips,
        allShootDayUnits: allShootDayUnits,
        scenes,
        shots,
        locations,
        castBySceneId: castBySceneMerged,
        castByShotId: castByShotMerged,
        castPeople: cast,
        includeEpisodesInSchedule,
        episodeById: includeEpisodesInSchedule ? episodeById : undefined,
      }),
      /* `CallSheetData.radioChannels` / `transportRows` are supported by the PDF when set; this
       * route does not populate them from the DB/UI yet — leave unset so those sections stay omitted. */
    }
  }, [
    production,
    shootDay,
    shootDayUnitId,
    dayUnits,
    units,
    unitStrips,
    scenes,
    shots,
    locations,
    episodesForProduction,
    shootingBlocsForProduction,
    includeEpisodesPersisted,
    castBySceneMerged,
    castByShotMerged,
    cast,
    keyContacts,
    mealTimesFromDay,
    castCalledNames,
    principalCastRows,
    crewHierarchy,
    bookingsForDay,
    crew,
    locationsForDay,
    shootDays,
    allProductionStrips,
    allShootDayUnits,
    weatherStoredForDay,
    sunriseManual,
    sunsetManual,
    weatherSummary,
    weatherFromDay,
  ])

  const distributionContext = useMemo(() => {
    if (!buildCallSheetData) return null
    return {
      productionName: buildCallSheetData.productionName,
      shootDate: buildCallSheetData.shootDate,
      unitName: buildCallSheetData.unitName,
      dayNumber: buildCallSheetData.dayNumber,
    }
  }, [buildCallSheetData])

  const distributionRecipients: CallSheetRecipient[] = useMemo(() => {
    if (!buildCallSheetData) return []
    const castRecipients: CallSheetRecipient[] = (castResult.castRows ?? []).map((row) => ({
      id: `cast-${row.person_id}`,
      fullName: row.name,
      type: 'cast',
    }))
    const crewRecipients: CallSheetRecipient[] = crewGroupsForPreview.flatMap((group) =>
      group.rows.map((row) => ({
        id: `crew-${row.person_id}`,
        fullName: row.name,
        type: 'crew' as const,
      })),
    )
    // Deduplicate by id in case the same person appears multiple times defensively.
    const map = new Map<string, CallSheetRecipient>()
    for (const r of [...castRecipients, ...crewRecipients]) {
      if (!map.has(r.id)) map.set(r.id, r)
    }
    return Array.from(map.values())
  }, [buildCallSheetData, castResult.castRows, crewGroupsForPreview])

  const generateMutation = useMutation({
    mutationFn: async (options: {
      save: boolean
      openAfter?: boolean
      baseData: CallSheetData | null
      locationQuery: string
      shootDate: string
      fallbackWeather: string | null
      weatherAddressHint: string | null
    }) => {
      const { baseData, locationQuery, shootDate, fallbackWeather, weatherAddressHint } = options
      if (!baseData || !currentProductionId || !shootDay) throw new Error('Missing data')
      let apiWeather: Awaited<ReturnType<typeof getWeatherForCallSheet>> = null
      let usedFallback = true
      try {
        apiWeather = await getWeatherForCallSheet(locationQuery, shootDate, {
          addressHint: weatherAddressHint,
        })
        if (apiWeather != null) usedFallback = false
      } catch {
        // use fallback below
      }
      const finalWeather = apiWeather?.summary ?? fallbackWeather ?? null
      const finalSunrise =
        apiWeather != null
          ? apiWeather.sunrise?.trim() || baseData.weatherSunrise
          : baseData.weatherSunrise
      const finalSunset =
        apiWeather != null
          ? apiWeather.sunset?.trim() || baseData.weatherSunset
          : baseData.weatherSunset
      const data: CallSheetData = {
        ...baseData,
        weatherSummary: finalWeather,
        weatherSunrise: finalSunrise,
        weatherSunset: finalSunset,
      }
      const pdfBytes = await generateCallSheetPdf(data)
      const bytes = new Uint8Array(pdfBytes)
      if (options.save) {
        const fileName = `call-sheet-${shootDay.shoot_date}-${shootDayUnitId ?? 'main'}.pdf`
        const savedPath = await saveFileWithDialog(
          {
            defaultPath: fileName,
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
            title: 'Save call sheet',
          },
          bytes
        )
        if (savedPath && options.openAfter) {
          await openInSystem(savedPath)
        }
        return { bytes, weatherFallback: usedFallback }
      }
      return { bytes, weatherFallback: usedFallback }
    },
    onError: (err) => {
      setGenerateError(err instanceof Error ? err.message : String(err))
    },
    onSuccess: (result) => {
      setGenerateError(null)
      if (result.bytes) {
        const blob = new Blob([result.bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        setPreviewPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      }
      setWeatherFallbackMessage(
        result.weatherFallback ? 'Weather lookup unavailable; used manual or stored weather.' : null
      )
    },
  })

  const handleGenerate = (save: boolean, openAfter?: boolean) => {
    const baseData = buildCallSheetData
    if (!baseData || !shootDay) return
    setDistributionExportSuccessMessage(null)
    setGenerateError(null)
    setWeatherFallbackMessage(null)
    const locationQuery =
      locationsForDay.length > 0
        ? [locationsForDay[0].name, locationsForDay[0].address].filter(Boolean).join(', ')
        : ''
    const fallbackWeather = weatherSummary || weatherFromDay || null
    const weatherAddressHint = locationsForDay[0]?.address?.trim() || null
    generateMutation.mutate({
      save,
      openAfter,
      baseData,
      locationQuery,
      shootDate: shootDay.shoot_date,
      fallbackWeather,
      weatherAddressHint,
    })
  }

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Call Sheets</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Call Sheets</h1>
      <p className="text-muted-foreground text-sm">
        Select shoot day and unit. Edit fields below. Generate PDF with required sections; preview and save.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Shoot day & unit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Shoot day</Label>
              <Select value={shootDayId ?? ''} onValueChange={(v) => { setShootDayId(v || null); setShootDayUnitId(null) }}>
                <SelectTrigger className="w-full bg-input border-border">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {shootDays.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.shoot_date} {d.day_number != null ? `(Day ${d.day_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select
                value={shootDayUnitId ?? ''}
                onValueChange={(v) => setShootDayUnitId(v || null)}
                disabled={!shootDayId}
              >
                <SelectTrigger className="w-full bg-input border-border">
                  <SelectValue placeholder="Select unit..." />
                </SelectTrigger>
                <SelectContent>
                  {dayUnits.map((u) => {
                    const unit = units.find((x) => x.id === u.unit_id)
                    return (
                      <SelectItem key={u.id} value={u.id}>
                        {unit?.name ?? u.unit_id}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            {production?.is_episodic && (
              <div className="space-y-2 rounded-md border border-border p-3 bg-muted/30">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="call-sheet-include-episodes"
                    checked={includeEpisodesPersisted}
                    onCheckedChange={(v) => persistIncludeEpisodesMutation.mutate(v === true)}
                    disabled={persistIncludeEpisodesMutation.isPending}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="call-sheet-include-episodes" className="font-medium cursor-pointer">
                      Include episodes
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Adds an EP column (episode identity per row) to the shooting schedule on the PDF.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Weather (manual fallback)</Label>
              <Input
                className="bg-input border-border"
                value={weatherSummary || weatherFromDay}
                onChange={(e) => setWeatherSummary(e.target.value)}
                placeholder="e.g. Sunny, 72°F — used if forecast lookup fails"
              />
              {weatherFallbackMessage && (
                <p className="text-muted-foreground text-xs">{weatherFallbackMessage}</p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Sunrise (optional)</Label>
                <Input
                  className="bg-input border-border"
                  value={sunriseManual || (weatherStoredForDay?.sunrise ?? '')}
                  onChange={(e) => setSunriseManual(e.target.value)}
                  placeholder="e.g. 06:15"
                />
              </div>
              <div className="space-y-2">
                <Label>Sunset (optional)</Label>
                <Input
                  className="bg-input border-border"
                  value={sunsetManual || (weatherStoredForDay?.sunset ?? '')}
                  onChange={(e) => setSunsetManual(e.target.value)}
                  placeholder="e.g. 19:42"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="call-sheet-safety-information">Safety information</Label>
              <Textarea
                id="call-sheet-safety-information"
                className="bg-input border-border min-h-[84px] resize-y"
                value={safetyInformation}
                onChange={(e) => {
                  safetyDirtyRef.current = true
                  setSafetyInformation(e.target.value)
                  if (safetySaveStatus === 'saved') setSafetySaveStatus('idle')
                }}
                placeholder="e.g. Hard hats required on set. Marine safety officer on standby."
                disabled={!shootDayId}
              />
              {safetySaveStatus === 'error' && (
                <p className="text-destructive text-xs">Could not save safety information.</p>
              )}
            </div>
            {shootDayId && shootDayUnitId && (
              <>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Cast called (booked & required)</Label>
                  {castResult.castRows.length > 0 ? (
                    <div className="rounded-md border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border">
                            <TableHead className="w-[4rem] text-muted-foreground">#</TableHead>
                            <TableHead className="text-muted-foreground">Name</TableHead>
                            <TableHead className="text-muted-foreground">Phone</TableHead>
                            <TableHead className="text-muted-foreground hidden sm:table-cell">Agent</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {castResult.castRows.map((row: CallSheetCastRow) => (
                            <TableRow key={row.person_id} className="border-border">
                              <TableCell className="font-mono text-muted-foreground">{row.cast_number ?? '—'}</TableCell>
                              <TableCell>{row.name}</TableCell>
                              <TableCell className="text-muted-foreground">{row.phone ?? '—'}</TableCell>
                              <TableCell className="text-muted-foreground hidden sm:table-cell">
                                {[row.agent_name, row.agent_phone].filter(Boolean).join('  ') || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No cast called for this day/unit.</p>
                  )}
                </div>
                {(castResult.requiredButNotBooked.length > 0 || castResult.bookedButNotRequired.length > 0) && (
              <div className="space-y-2">
                {castResult.requiredButNotBooked.length > 0 && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTitle>
                      {castResult.requiredButNotBooked.length} required cast not booked for this day
                    </AlertTitle>
                    <AlertDescription>
                      {castResult.requiredButNotBooked.map((w) => w.name).join(', ')}
                      {' — add bookings to include them on the call sheet.'}
                    </AlertDescription>
                  </Alert>
                )}
                {castResult.bookedButNotRequired.length > 0 && (
                  <Alert className="py-2">
                    <AlertTitle>
                      {castResult.bookedButNotRequired.length} booked cast not required by scheduled material
                    </AlertTitle>
                    <AlertDescription>
                      {castResult.bookedButNotRequired.map((w) => w.name).join(', ')}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
                )}
                <div className="space-y-2 border-t border-border pt-4 mt-1">
                  <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Departmental requirements (booked crew by department)
                  </Label>
                  {crewGroupsForPreview.length > 0 ? (
                    <div className="rounded-md border border-border overflow-hidden">
                      {crewGroupsForPreview.map((group) => (
                        <div key={group.department} className="border-b border-border last:border-b-0">
                          <div className="bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground">
                            {group.department}
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="border-border">
                                <TableHead className="h-8 text-muted-foreground font-medium">Name</TableHead>
                                <TableHead className="h-8 text-muted-foreground font-medium">Role</TableHead>
                                <TableHead className="h-8 text-muted-foreground font-medium">Phone</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.rows.map((row) => (
                                <TableRow key={row.person_id} className="border-border">
                                  <TableCell className="py-1.5 font-medium">{row.name}</TableCell>
                                  <TableCell className="py-1.5 text-muted-foreground">
                                    {row.role_name ?? '—'}
                                    {row.is_hod && (
                                      <span className="ml-1 text-muted-foreground">(HOD)</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-1.5 text-muted-foreground tabular-nums">
                                    {row.phone ?? '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No crew booked for this day.</p>
                  )}
                </div>
              </>
            )}
            {generateError && (
              <Alert variant="destructive" className="py-2">
                <AlertTitle>Call sheet generation failed</AlertTitle>
                <AlertDescription>{generateError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleGenerate(false)}
                disabled={!buildCallSheetData || generateMutation.isPending}
              >
                Preview PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => handleGenerate(true)}
                disabled={!buildCallSheetData || generateMutation.isPending}
              >
                Save PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDistributionExportSuccessMessage(null)
                  setDistributionStatus({ loading: false, message: null, error: null })
                  setDistributionOpen(true)
                }}
                disabled={
                  !buildCallSheetData ||
                  generateMutation.isPending ||
                  distributionStatus.loading
                }
              >
                Distribute Call Sheets
              </Button>
            </div>
            {distributionExportSuccessMessage && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
                {distributionExportSuccessMessage}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {previewPdfUrl ? (
              <ScrollArea className="h-[960px] w-full rounded border border-border">
                <Document
                  file={previewPdfUrl}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                >
                  {numPages != null && Array.from({ length: numPages }, (_, i) => (
                    <Page key={i} pageNumber={i + 1} width={680} />
                  ))}
                </Document>
              </ScrollArea>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">
                Generate a preview to see the call sheet PDF.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <CallSheetDistributionDialog
        open={distributionOpen}
        onOpenChange={(open) => {
          if (!open && distributionStatus.loading) return
          setDistributionOpen(open)
        }}
        context={distributionContext}
        recipients={distributionRecipients}
        loading={distributionStatus.loading}
        statusMessage={distributionStatus.message}
        error={distributionStatus.error}
        onGenerateSelected={async (selected) => {
          if (!buildCallSheetData) return
          setDistributionExportSuccessMessage(null)
          setDistributionStatus({ loading: true, message: null, error: null })
          try {
            const result = await exportDistributedCallSheets({
              baseData: buildCallSheetData,
              recipients: selected,
              onProgress: (current, total) => {
                setDistributionStatus((prev) => ({
                  ...prev,
                  message: `Generating ${current} of ${total} personalised call sheets…`,
                }))
              },
            })
            if (result && result.written > 0) {
              const pathSuffix = result.directoryPath
                ? ` Saved to: ${result.directoryPath}`
                : ''
              setDistributionExportSuccessMessage(
                `Generated ${result.written} personalised call sheet${result.written === 1 ? '' : 's'}.${pathSuffix}`,
              )
              setDistributionOpen(false)
              setDistributionStatus({ loading: false, message: null, error: null })
            } else {
              setDistributionStatus({ loading: false, message: null, error: null })
            }
          } catch (e) {
            setDistributionStatus({
              loading: false,
              message: null,
              error: (e as Error)?.message ?? 'Failed to generate personalised call sheets.',
            })
          }
        }}
      />
      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'call_sheets' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                call_sheets:
                  prev.sections.call_sheets === 'not_started'
                    ? 'in_progress'
                    : prev.sections.call_sheets,
              },
            }))
          }
        }}
        sectionId="call_sheets"
        sectionTitle="Call Sheets"
        steps={callSheetsTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'call_sheets' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              call_sheets: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}
