import { useSearchParams } from 'react-router-dom'
import { RequireProduction } from '@/components/require-production'
import { PageHeader } from '@/components/page-header'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  listLocationsByProductionForActor,
  listScenesByProductionForActor,
  listShootDaysByProductionForActor,
  listShootingBlocsByProductionForActor,
  setShootDayUnitMovementOrderJsonForActor,
  updateShootDayForActor,
  listShootDayUnitsByShootDayForActor,
  listShotsByProductionForActor,
  listStripsByShootDayForActor,
  listUnitsByProductionForActor,
} from '@/lib/access/projectDomainService'
import {
  getShootDayById,
  updateShootDay,
  listScenesByProduction,
  listShootDaysByProduction,
  listShotsByProduction,
} from '@/lib/db/repositories/schedule'
import {
  listShootDayUnitsByShootDay,
  setShootDayUnitMovementOrderJson,
} from '@/lib/db/repositories/shoot-day-units'
import { listShootingBlocsByProduction } from '@/lib/db/repositories/shootingBlocs'
import { shootingBlocMastheadLabelForCallSheet } from '@/lib/call-sheets/callSheetEpisodic'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listStripsByShootDay } from '@/lib/db/repositories/stripboard-strips'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listBookingsByShootDay } from '@/lib/db/repositories/booking'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { getCastIdsByShotIds } from '@/lib/db/repositories/shot-cast'
import { listCast, listCrew } from '@/lib/db/repositories/person'
import { getProductionById } from '@/lib/db/repositories/production'
import {
  getDefaultCrewHierarchyConfig,
  getEffectiveCrewHierarchyOrDefault,
} from '@/lib/people/crewHierarchyResolver'
import { buildMovementOrderData } from '@/lib/movement-orders/buildMovementOrderData'
import { getMovementOrderPdfFileName } from '@/lib/movement-orders/fileNaming'
import { getOrderedMovementOrderLocationsForDayUnit } from '@/lib/movement-orders/orderedLocations'
import { getMovementOrderLocationContacts } from '@/lib/movement-orders/locationContacts'
import {
  applyResolvedLocationCoordinates,
  buildMovementOrderLegSkeleton,
  buildMovementOrderWaypoints,
} from '@/lib/movement-orders/movementLegs'
import {
  parseMovementPins,
  serializeMovementPins,
  type MovementPin,
} from '@/lib/movement-orders/pins'
import { renderMovementOrderMaps } from '@/lib/movement-orders/renderMovementOrderMaps'
import {
  DEFAULT_MAP_TILE_URL_TEMPLATE,
  getMapTileConfig,
} from '@/lib/maps/tileConfig'
import { MovementOrderMaps } from '@/features/movement-orders/MovementOrderMaps'
import { useSyncedDraft } from '@/features/movement-orders/useSyncedDraft'
import {
  normalizeMovementTime,
  parseMovementOrderInputs,
  serializeMovementOrderInputs,
  type MovementOrderInputs,
} from '@/lib/movement-orders/movementOrderInputs'
import { DEFAULT_PAPER_SIZE, PAPER_SIZES, isPaperSize, type PaperSize } from '@/lib/pdf/layoutKit'
import { enrichMovementLegsWithRouteData } from '@/lib/movement-orders/enrichMovementLegsWithRouteData'
import { generateMovementOrderPDF } from '@/lib/pdf/movementOrder'
import {
  persistPersonalizedDocuments,
  personIdFromRecipient,
} from '@/lib/documents/persistPersonalizedDocuments'
import { persistProductionDocument, documentsQueryKey } from '@/lib/documents/persistDocument'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { openInSystem, saveFileWithDialog } from '@/lib/files'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import {
  getCallSheetCastRequirements,
  type CallSheetCastResult,
} from '@/lib/call-sheets/castRequirements'
import { getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { MovementOrderData } from '@/lib/movement-orders/types'
import {
  MovementOrderDistributionDialog,
  type MovementOrderRecipient,
} from '@/features/movement-orders/MovementOrderDistributionDialog'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { buildDayRecipients } from '@/lib/call-sheets/recipients'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export function MovementOrdersPage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  // `?day=&unit=` preselects a shoot day and unit (links from Send Day Pack).
  const [searchParams] = useSearchParams()
  const [shootDayId, setShootDayId] = useState<string | null>(() => searchParams.get('day'))
  const [shootDayUnitId, setShootDayUnitId] = useState<string | null>(() => searchParams.get('unit'))
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [paperSize, setPaperSize] = useState<PaperSize>(DEFAULT_PAPER_SIZE)
  const [inputsError, setInputsError] = useState<string | null>(null)
  const [pinsError, setPinsError] = useState<string | null>(null)
  const [includeMaps, setIncludeMaps] = useState(true)
  const [mapWarning, setMapWarning] = useState<string | null>(null)
  const [distributionOpen, setDistributionOpen] = useState(false)
  const [distributionStatus, setDistributionStatus] = useState<{
    loading: boolean
    message: string | null
    error: string | null
  }>({ loading: false, message: null, error: null })
  const [distributionExportSuccessMessage, setDistributionExportSuccessMessage] = useState<
    string | null
  >(null)
  const defaultCrewHierarchy = getDefaultCrewHierarchyConfig()
  const canLoadProjectData = !authSession.authSupported || !!authSession.currentUser


  const { data: production } = useQuery({
    queryKey: ['production', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getProductionByIdForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return getProductionById(currentProductionId!)
    },
    enabled: !!currentProductionId && canLoadProjectData,
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listShootDaysByProduction(currentProductionId ?? '')
    },
    enabled: !!currentProductionId && canLoadProjectData,
  })

  const { data: units = [] } = useQuery({
    queryKey: ['units', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listUnitsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listUnitsByProduction(currentProductionId ?? '')
    },
    enabled: !!currentProductionId && canLoadProjectData,
  })

  const isEpisodic = production?.is_episodic === true
  const { data: shootingBlocs = [] } = useQuery({
    queryKey: ['shooting-blocs-callsheet', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootingBlocsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listShootingBlocsByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId && canLoadProjectData && isEpisodic,
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
    enabled: !!shootDayId && canLoadProjectData,
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
    enabled: !!shootDayId && canLoadProjectData,
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
    enabled: !!shootDayId && canLoadProjectData,
  })

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listScenesByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listScenesByProduction(currentProductionId ?? '')
    },
    enabled: !!currentProductionId && canLoadProjectData,
  })

  const { data: shots = [] } = useQuery({
    queryKey: ['shots', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShotsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listShotsByProduction(currentProductionId ?? '')
    },
    enabled: !!currentProductionId && canLoadProjectData,
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listLocationsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listLocationsByProduction(currentProductionId ?? '')
    },
    enabled: !!currentProductionId && canLoadProjectData,
  })

  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCastForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listCast(currentProductionId ?? '')
    },
    enabled: !!currentProductionId && canLoadProjectData,
  })

  const { data: crew = [] } = useQuery({
    queryKey: ['crew', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCrewForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listCrew(currentProductionId ?? '')
    },
    enabled: !!currentProductionId && canLoadProjectData,
  })

  const { data: bookingsForDay = [] } = useQuery({
    queryKey: ['bookings-by-shoot-day', shootDayId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBookingsByShootDayForActor({ db, actor: authSession.currentUser, shootDayId: shootDayId! })
      }
      return listBookingsByShootDay(shootDayId!)
    },
    enabled: !!shootDayId && canLoadProjectData,
  })

  const { data: hierarchyData } = useQuery({
    queryKey: ['crew-hierarchy', currentProductionId],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(currentProductionId),
    enabled: !!currentProductionId && canLoadProjectData,
  })
  const crewHierarchy = hierarchyData ?? defaultCrewHierarchy

  const selectedDayUnit = useMemo(
    () => dayUnits.find((dayUnit) => dayUnit.id === shootDayUnitId) ?? null,
    [dayUnits, shootDayUnitId]
  )
  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === selectedDayUnit?.unit_id) ?? null,
    [units, selectedDayUnit]
  )

  /** Same strip scope as call sheets for cast/crew recipients (all strips on the unit, any status). */
  const unitStrips = useMemo(
    () =>
      strips
        .filter((strip) => strip.shoot_day_unit_id === shootDayUnitId)
        .sort((a, b) => a.sort_index - b.sort_index),
    [strips, shootDayUnitId]
  )

  const sceneIdsScheduled = useMemo(
    () => unitStrips.filter((s) => s.scene_id).map((s) => s.scene_id!),
    [unitStrips]
  )
  const shotIdsScheduled = useMemo(
    () => unitStrips.filter((s) => s.shot_id).map((s) => s.shot_id!),
    [unitStrips]
  )

  const { data: castBySceneId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-scene-movement-order-distribution', sceneIdsScheduled.join(',')],
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
    enabled: sceneIdsScheduled.length > 0 && canLoadProjectData,
  })

  const { data: castByShotId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-shot-movement-order-distribution', shotIdsScheduled.join(',')],
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
    enabled: shotIdsScheduled.length > 0 && canLoadProjectData,
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

  const crewGroupsForPreview = useMemo(
    () => getCallSheetCrewRequirements(crewHierarchy, bookingsForDay, crew, shootDayUnitId),
    [crewHierarchy, bookingsForDay, crew, shootDayUnitId]
  )

  const selectedUnitScheduledStrips = useMemo(
    () =>
      strips.filter(
        (strip) =>
          strip.shoot_day_unit_id === shootDayUnitId &&
          strip.strip_status === 'SCHEDULED'
      ),
    [strips, shootDayUnitId]
  )

  const orderedLocations = useMemo(
    () =>
      getOrderedMovementOrderLocationsForDayUnit({
        strips: selectedUnitScheduledStrips,
        scenes,
        shots,
        locations,
      }),
    [selectedUnitScheduledStrips, scenes, shots, locations]
  )

  const locationContacts = useMemo(
    () => getMovementOrderLocationContacts(crew, crewHierarchy),
    [crew, crewHierarchy]
  )

  // The journey runs base -> locations -> base when the shoot day has a base address.
  const waypoints = useMemo(
    () => buildMovementOrderWaypoints(orderedLocations, shootDay?.parking_base_address ?? null),
    [orderedLocations, shootDay?.parking_base_address]
  )

  const skeletonLegs = useMemo(() => buildMovementOrderLegSkeleton(waypoints), [waypoints])

  const refreshTravelDataRef = useRef(false)

  const {
    data: enrichedLegs,
    isFetching: isEnrichingRouteData,
    refetch: refetchEnrichedLegs,
  } = useQuery({
    queryKey: [
      'movement-order-legs-enriched',
      shootDayId,
      shootDayUnitId,
      waypoints.map((location) => location.id).join(','),
      waypoints.map((location) => `${location.name}|${location.address ?? ''}`).join('||'),
    ],
    enabled: waypoints.length >= 2,
    queryFn: async () => {
      const forceRefresh = refreshTravelDataRef.current
      refreshTravelDataRef.current = false
      return enrichMovementLegsWithRouteData({ locations: waypoints, forceRefresh })
    },
  })

  // Hand-entered times live on the shoot day unit, pins on the shoot day. Each is a local draft
  // that saves after a short pause (see the effects below).
  const savedInputsJson = selectedDayUnit?.movement_order_json ?? null
  const [inputs, setInputs] = useSyncedDraft<MovementOrderInputs>({
    key: selectedDayUnit?.id ?? null,
    savedJson: savedInputsJson,
    parse: parseMovementOrderInputs,
    serialize: serializeMovementOrderInputs,
  })
  const savedPinsJson = shootDay?.movement_pins_json ?? null
  const [pins, setPins] = useSyncedDraft<MovementPin[]>({
    key: shootDay?.id ?? null,
    savedJson: savedPinsJson,
    parse: parseMovementPins,
    serialize: serializeMovementPins,
  })

  const locationsWithCoordinates = useMemo(
    () =>
      applyResolvedLocationCoordinates(
        orderedLocations,
        enrichedLegs ?? skeletonLegs,
        waypoints.length > orderedLocations.length
      ),
    [orderedLocations, enrichedLegs, skeletonLegs, waypoints.length]
  )

  const { data: tileConfig = { urlTemplate: DEFAULT_MAP_TILE_URL_TEMPLATE, apiKey: '' } } = useQuery({
    queryKey: ['map-tile-config'],
    queryFn: getMapTileConfig,
  })

  const movementOrderDataForView = useMemo<MovementOrderData | null>(() => {
    if (!production || !shootDay || !selectedUnit) return null
    return buildMovementOrderData({
      productionName: production.name,
      shootDay,
      totalShootDays: shootDays.length > 0 ? shootDays.length : null,
      shootingBlocLabel: shootingBlocMastheadLabelForCallSheet({
        isEpisodicProduction: isEpisodic,
        shootingBlocId: shootDay.shooting_bloc_id ?? null,
        blocsById: new Map(shootingBlocs.map((bloc) => [bloc.id, bloc])),
      }),
      unitName: selectedUnit.name,
      inputs,
      pins,
      locations: locationsWithCoordinates,
      locationContacts,
      movementLegs: enrichedLegs ?? skeletonLegs,
    })
  }, [
    production,
    shootDay,
    selectedUnit,
    shootDays.length,
    shootingBlocs,
    isEpisodic,
    inputs,
    pins,
    locationsWithCoordinates,
    locationContacts,
    enrichedLegs,
    skeletonLegs,
  ])

  // Hand-entered values live on the shoot day unit. Load them when the selection changes (or
  // another save lands); local edits are saved after a short pause.

  const saveInputsMutation = useMutation({
    mutationFn: async (args: { shootDayUnitId: string; json: string | null }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return setShootDayUnitMovementOrderJsonForActor({
          db,
          actor: authSession.currentUser,
          shootDayUnitId: args.shootDayUnitId,
          movementOrderJson: args.json,
        })
      }
      return setShootDayUnitMovementOrderJson(args.shootDayUnitId, args.json)
    },
    onSuccess: () => {
      setInputsError(null)
      void queryClient.invalidateQueries({ queryKey: ['shoot-day-units', shootDayId] })
    },
    onError: (error) => {
      setInputsError((error as Error)?.message ?? 'Failed to save movement order times.')
    },
  })

  useEffect(() => {
    if (!selectedDayUnit) return
    const json = serializeMovementOrderInputs(inputs)
    if (json === (selectedDayUnit.movement_order_json ?? null)) return
    const timer = window.setTimeout(() => {
      saveInputsMutation.mutate({ shootDayUnitId: selectedDayUnit.id, json })
    }, 600)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on edits only
  }, [inputs, selectedDayUnit?.id, selectedDayUnit?.movement_order_json])

  // Pins belong to the shoot day. Same pattern as the times: load on selection, save after a pause.

  const savePinsMutation = useMutation({
    mutationFn: async (args: { shootDayId: string; json: string | null }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return updateShootDayForActor({
          db,
          actor: authSession.currentUser,
          shootDayId: args.shootDayId,
          data: { movement_pins_json: args.json },
        })
      }
      return updateShootDay(args.shootDayId, { movement_pins_json: args.json })
    },
    onSuccess: () => {
      setPinsError(null)
      void queryClient.invalidateQueries({ queryKey: ['shoot-day', shootDayId] })
    },
    onError: (error) => {
      setPinsError((error as Error)?.message ?? 'Failed to save map pins.')
    },
  })

  useEffect(() => {
    if (!shootDay) return
    const json = serializeMovementPins(pins)
    if (json === (shootDay.movement_pins_json ?? null)) return
    const timer = window.setTimeout(() => {
      savePinsMutation.mutate({ shootDayId: shootDay.id, json })
    }, 600)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on edits only
  }, [pins, shootDay?.id, shootDay?.movement_pins_json])

  /** Builds the PDF, drawing the maps first when they are switched on. Never fails on maps. */
  const buildOrderPdf = async (data: MovementOrderData): Promise<Uint8Array> => {
    let maps = null
    if (includeMaps) {
      const rendered = await renderMovementOrderMaps(data, tileConfig)
      maps = rendered.maps
      setMapWarning(rendered.warning)
    } else {
      setMapWarning(null)
    }
    return generateMovementOrderPDF(data, { paperSize, maps })
  }

  const setLegTime = (legKey: string, field: 'departTime' | 'arriveTime', value: string) => {
    setInputs((previous) => {
      const existing = previous.legs[legKey] ?? { departTime: null, arriveTime: null }
      return {
        ...previous,
        legs: { ...previous.legs, [legKey]: { ...existing, [field]: normalizeMovementTime(value) } },
      }
    })
  }

  const distributionContext = useMemo(() => {
    if (!movementOrderDataForView) return null
    return {
      productionName: movementOrderDataForView.productionName,
      shootDate: movementOrderDataForView.shootDate,
      unitName: movementOrderDataForView.unitName,
      dayNumber: movementOrderDataForView.dayNumber,
    }
  }, [movementOrderDataForView])

  const distributionRecipients: MovementOrderRecipient[] = useMemo(
    () => (movementOrderDataForView ? buildDayRecipients(castResult.castRows ?? [], crewGroupsForPreview) : []),
    [movementOrderDataForView, castResult.castRows, crewGroupsForPreview]
  )

  const generateMutation = useMutation({
    mutationFn: async (options: {
      data: MovementOrderData | null
      save: boolean
      openAfter?: boolean
    }) => {
      if (!options.data) throw new Error('Missing movement order data.')
      const pdfBytes = await buildOrderPdf(options.data)
      const bytes = new Uint8Array(pdfBytes)
      if (!options.save) return { bytes, didCancel: false }

      if (!currentProductionId || !shootDayId) {
        throw new Error('Missing production or shoot day.')
      }

      const fileName = getMovementOrderPdfFileName(
        options.data.shootDate,
        options.data.unitName
      )
      await persistProductionDocument({
        productionId: currentProductionId,
        fileName,
        bytes,
        mimeType: 'application/pdf',
        entityType: DOCUMENT_ENTITY_TYPES.movementOrder,
        entityId: shootDayId,
      })

      const savedPath = await saveFileWithDialog(
        {
          defaultPath: fileName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          title: 'Export a copy of movement order',
        },
        bytes
      )
      if (!savedPath) return { bytes, didCancel: true, saved: true }
      if (savedPath && options.openAfter) {
        await openInSystem(savedPath)
      }
      return { bytes, didCancel: false, saved: true }
    },
    onSuccess: (result) => {
      if (!result?.bytes) return
      if (result.saved && currentProductionId) {
        void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
      }
      if (result.didCancel) return
      const blob = new Blob([result.bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setPreviewPdfUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return url
      })
      setPdfError(null)
    },
    onError: (error) => {
      setPdfError((error as Error)?.message ?? 'Failed to generate movement order PDF.')
    },
  })

  const handleGenerate = (save: boolean, openAfter?: boolean) => {
    setPdfError(null)
    setDistributionExportSuccessMessage(null)
    generateMutation.mutate({
      data: movementOrderDataForView,
      save,
      openAfter,
    })
  }

  useEffect(() => {
    return () => {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl)
    }
  }, [previewPdfUrl])

  useEffect(() => {
    // Selection changes invalidate previous preview context.
    setNumPages(null)
    setPdfError(null)
    setDistributionOpen(false)
    setDistributionStatus({ loading: false, message: null, error: null })
    setDistributionExportSuccessMessage(null)
    setPreviewPdfUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
  }, [shootDayId, shootDayUnitId])

  useEffect(() => {
    if (!distributionExportSuccessMessage) return
    const t = setTimeout(() => setDistributionExportSuccessMessage(null), 6000)
    return () => clearTimeout(t)
  }, [distributionExportSuccessMessage])

  if (!currentProductionId) {
    return (
      <RequireProduction title="Movement Orders">{null}</RequireProduction>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Movement Orders" description="Generate movement orders for a selected shoot day and unit." />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Shoot day & unit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Shoot day</Label>
              <Select
                value={shootDayId ?? ''}
                onValueChange={(value) => {
                  setShootDayId(value || null)
                  setShootDayUnitId(null)
                }}
              >
                <SelectTrigger className="w-full bg-input border-border">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {shootDays.map((day) => (
                    <SelectItem key={day.id} value={day.id}>
                      {day.shoot_date} {day.day_number != null ? `(Day ${day.day_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shootDays.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No shoot days available for this production yet.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Unit</Label>
              <Select
                value={shootDayUnitId ?? ''}
                onValueChange={(value) => setShootDayUnitId(value || null)}
                disabled={!shootDayId}
              >
                <SelectTrigger className="w-full bg-input border-border">
                  <SelectValue placeholder="Select unit..." />
                </SelectTrigger>
                <SelectContent>
                  {dayUnits.map((dayUnit) => {
                    const unit = units.find((candidate) => candidate.id === dayUnit.unit_id)
                    return (
                      <SelectItem key={dayUnit.id} value={dayUnit.id}>
                        {unit?.name ?? dayUnit.unit_id}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {shootDayId && dayUnits.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No units are set up for this shoot day yet.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Paper size</Label>
              <Select
                value={paperSize}
                onValueChange={(value) => {
                  if (isPaperSize(value)) setPaperSize(value)
                }}
              >
                <SelectTrigger className="w-full bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => (
                    <SelectItem key={size} value={size}>
                      {PAPER_SIZES[size].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  refreshTravelDataRef.current = true
                  void refetchEnrichedLegs()
                }}
                disabled={waypoints.length < 2 || isEnrichingRouteData}
              >
                {isEnrichingRouteData ? 'Refreshing travel…' : 'Refresh travel data'}
              </Button>
              <Button
                onClick={() => handleGenerate(false)}
                disabled={!movementOrderDataForView || generateMutation.isPending}
              >
                {generateMutation.isPending ? 'Generating...' : 'Preview Movement Order'}
              </Button>
              <Button data-tutorial="movement-generate"
                variant="outline"
                onClick={() => handleGenerate(true)}
                disabled={!movementOrderDataForView || generateMutation.isPending}
              >
                {generateMutation.isPending ? 'Generating...' : 'Save PDF'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleGenerate(true, true)}
                disabled={!movementOrderDataForView || generateMutation.isPending}
              >
                {generateMutation.isPending ? 'Generating...' : 'Save & Open'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDistributionExportSuccessMessage(null)
                  setDistributionStatus({ loading: false, message: null, error: null })
                  setDistributionOpen(true)
                }}
                disabled={
                  !movementOrderDataForView ||
                  !shootDayId ||
                  !shootDayUnitId ||
                  distributionStatus.loading
                }
              >
                Distribute Movement Orders
              </Button>
            </div>

            {distributionExportSuccessMessage && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
                {distributionExportSuccessMessage}
              </p>
            )}

            {pdfError && (
              <p className="text-sm text-destructive">{pdfError}</p>
            )}

            <p className="text-sm text-muted-foreground">
              Movement order document data is assembled below from selected shoot day and unit context.
            </p>
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
                  onLoadSuccess={({ numPages: loadedPages }) => setNumPages(loadedPages)}
                  onLoadError={() => {
                    setPdfError('Preview failed to load. Try generating the PDF again.')
                    setNumPages(null)
                  }}
                >
                  {numPages != null &&
                    Array.from({ length: numPages }, (_, index) => (
                      <Page key={index} pageNumber={index + 1} width={680} />
                    ))}
                </Document>
              </ScrollArea>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">
                Generate a preview to see the Movement Order PDF.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {movementOrderDataForView && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Route maps & pins</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Pins belong to this shoot day. The overview and one close-up per location are printed
              on the movement order, with the written directions kept alongside.
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeMaps}
                onChange={(event) => setIncludeMaps(event.target.checked)}
              />
              Include maps in the PDF
            </label>
            <MovementOrderMaps
              data={movementOrderDataForView}
              tileConfig={tileConfig}
              pins={pins}
              onPinsChange={setPins}
              canEdit={!!shootDay}
            />
            {pinsError && <p className="text-sm text-destructive">{pinsError}</p>}
            {mapWarning && <p className="text-sm text-amber-600 dark:text-amber-400">{mapWarning}</p>}
          </CardContent>
        </Card>
      )}

      {movementOrderDataForView && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Times & revision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Enter depart and arrive times by hand for each leg. Nothing is calculated from the
              crew call, so staggered or late departures print exactly as entered.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="movement-order-revision">Revision label</Label>
                <Input
                  id="movement-order-revision"
                  placeholder="e.g. Draft 2"
                  value={inputs.revisionLabel ?? ''}
                  onChange={(event) =>
                    setInputs((previous) => ({ ...previous, revisionLabel: event.target.value || null }))
                  }
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-order-base-time">Unit base opens</Label>
                <Input
                  id="movement-order-base-time"
                  type="time"
                  value={inputs.unitBaseTime ?? ''}
                  onChange={(event) =>
                    setInputs((previous) => ({
                      ...previous,
                      unitBaseTime: normalizeMovementTime(event.target.value),
                    }))
                  }
                  className="bg-input border-border"
                />
              </div>
            </div>

            {movementOrderDataForView.movementLegs.length > 0 ? (
              <div className="space-y-2">
                <div className="hidden grid-cols-[1fr_8rem_8rem] gap-3 text-xs text-muted-foreground md:grid">
                  <span>Leg</span>
                  <span>Depart</span>
                  <span>Arrive</span>
                </div>
                {movementOrderDataForView.movementLegs.map((leg, index) => (
                  <div
                    key={leg.key}
                    className="grid items-center gap-3 md:grid-cols-[1fr_8rem_8rem]"
                  >
                    <span className="font-medium">
                      {index + 1}. {leg.fromLocationName} to {leg.toLocationName}
                    </span>
                    <Input
                      type="time"
                      aria-label={`Depart time, leg ${index + 1}`}
                      value={inputs.legs[leg.key]?.departTime ?? ''}
                      onChange={(event) => setLegTime(leg.key, 'departTime', event.target.value)}
                      className="bg-input border-border"
                    />
                    <Input
                      type="time"
                      aria-label={`Arrive time, leg ${index + 1}`}
                      value={inputs.legs[leg.key]?.arriveTime ?? ''}
                      onChange={(event) => setLegTime(leg.key, 'arriveTime', event.target.value)}
                      className="bg-input border-border"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No legs yet. A journey needs at least two stops, or one location plus a base address
                on the shoot day.
              </p>
            )}
            {!shootDay?.parking_base_address?.trim() && (
              <p className="text-xs text-muted-foreground">
                Add a base address to the shoot day to start and end the journey at the unit base.
              </p>
            )}
            {inputsError && <p className="text-sm text-destructive">{inputsError}</p>}
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Movement order data summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {movementOrderDataForView ? (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Shoot day:</span>{' '}
                  {movementOrderDataForView.shootDate}
                  {movementOrderDataForView.dayNumber != null
                    ? ` (Day ${movementOrderDataForView.dayNumber})`
                    : ''}
                </p>
                <p>
                  <span className="text-muted-foreground">Unit:</span>{' '}
                  {movementOrderDataForView.unitName}
                </p>
                <p>
                  <span className="text-muted-foreground">Locations:</span>{' '}
                  {movementOrderDataForView.locations.length}
                </p>
                <p>
                  <span className="text-muted-foreground">Movement legs:</span>{' '}
                  {movementOrderDataForView.movementLegs.length}
                </p>
                <p>
                  <span className="text-muted-foreground">Locations contacts:</span>{' '}
                  {movementOrderDataForView.locationContacts.length}
                </p>
                <p>
                  <span className="text-muted-foreground">Travel enrichment:</span>{' '}
                  {isEnrichingRouteData ? 'Loading route data...' : 'Ready'}
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-medium">Ordered locations</p>
                {movementOrderDataForView.locations.length > 0 ? (
                  <ul className="space-y-2">
                    {movementOrderDataForView.locations.map((location) => (
                      <li key={location.id} className="rounded border border-border p-2">
                        <p className="font-medium">{location.name}</p>
                        <p className="text-muted-foreground">
                          {location.address ?? 'No address set'}
                        </p>
                        <p className="text-muted-foreground">
                          what3words: {location.what3words ?? 'Not set'}
                        </p>
                        <p className="text-muted-foreground">
                          Parking: {location.parkingInfo ?? 'Not set'}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    No locations found for this shoot day/unit yet.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="font-medium">Locations department contacts</p>
                {movementOrderDataForView.locationContacts.length > 0 ? (
                  <ul className="space-y-2">
                    {movementOrderDataForView.locationContacts.map((contact) => (
                      <li
                        key={`${contact.name}-${contact.role ?? 'none'}-${contact.phone ?? 'none'}`}
                        className="rounded border border-border p-2"
                      >
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-muted-foreground">
                          Role: {contact.role ?? 'Not set'}
                        </p>
                        <p className="text-muted-foreground">
                          Phone: {contact.phone ?? 'Not set'}
                        </p>
                        <p className="text-muted-foreground">
                          Email: {contact.email ?? 'Not set'}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    No Locations department contacts available.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="font-medium">Movement legs</p>
                {movementOrderDataForView.movementLegs.length > 0 ? (
                  <ul className="space-y-2">
                    {movementOrderDataForView.movementLegs.map((leg) => (
                      <li
                        key={leg.key}
                        className="rounded border border-border p-2"
                      >
                        <p className="font-medium">
                          {leg.fromLocationName} {'->'} {leg.toLocationName}
                        </p>
                        {(leg.departTime || leg.arriveTime) && (
                          <p className="text-muted-foreground">
                            Depart: {leg.departTime ?? '-'} | Arrive: {leg.arriveTime ?? '-'}
                          </p>
                        )}
                        <p className="text-muted-foreground">
                          Driving: {leg.drivingTimeMinutes != null ? `${leg.drivingTimeMinutes} min` : 'Unavailable'}
                          {leg.drivingDistanceText ? ` (${leg.drivingDistanceText})` : ''}
                        </p>
                        <p className="text-muted-foreground">
                          Walking: {leg.walkingTimeMinutes != null ? `${leg.walkingTimeMinutes} min` : 'Unavailable'}
                          {leg.walkingDistanceText ? ` (${leg.walkingDistanceText})` : ''}
                        </p>
                        <p className="text-muted-foreground">
                          Directions: {leg.writtenDirections ?? 'Unavailable'}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    No movement legs found. Add at least two locations on the selected day/unit.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Select a shoot day and unit to assemble Movement Order data.
            </p>
          )}
        </CardContent>
      </Card>

      <MovementOrderDistributionDialog
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
          if (!movementOrderDataForView) return
          setDistributionExportSuccessMessage(null)
          setDistributionStatus({ loading: true, message: null, error: null })
          try {
            let baseBytes: Uint8Array
            try {
              const pdfBytes = await buildOrderPdf(movementOrderDataForView)
              baseBytes = new Uint8Array(pdfBytes)
            } catch {
              throw new Error('Failed to generate movement order PDF. Please try again.')
            }
            if (!baseBytes || baseBytes.length === 0) {
              throw new Error('Failed to generate base PDF.')
            }

            const shootDate = movementOrderDataForView.shootDate
            const unitName = movementOrderDataForView.unitName

            const result = await persistPersonalizedDocuments({
              productionId: currentProductionId!,
              entityType: DOCUMENT_ENTITY_TYPES.movementOrderPersonalized,
              basePDFBytes: baseBytes,
              recipients: selected,
              resolveEntityId: personIdFromRecipient,
              buildFileName: (recipient) => {
                const safeDate = sanitizeForFilename(shootDate)
                const safeUnit = sanitizeForFilename(unitName || 'unit')
                const safeName = sanitizeForFilename(recipient.fullName)
                return `movement-order-${safeDate}-${safeUnit}-${safeName}.pdf`
              },
              directoryPickerTitle: 'Select directory for personalised movement order copies',
              onProgress: (current, total) => {
                setDistributionStatus((prev) => ({
                  ...prev,
                  message: `Generating ${current} of ${total} personalised movement orders…`,
                }))
              },
            })

            if (result.persisted > 0) {
              void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId!) })
              const pathSuffix = result.directoryPath
                ? ` Copies saved to: ${result.directoryPath}`
                : ''
              setDistributionExportSuccessMessage(
                `Saved ${result.persisted} personalised movement order${result.persisted === 1 ? '' : 's'} to Documents.${pathSuffix}`,
              )
              setDistributionOpen(false)
              setDistributionStatus({ loading: false, message: null, error: null })
            } else {
              // Directory cancel: end loading only; keep dialog and recipient selection unchanged.
              setDistributionStatus({ loading: false, message: null, error: null })
            }
          } catch (e) {
            setDistributionStatus({
              loading: false,
              message: null,
              error:
                (e as Error)?.message ?? 'Failed to generate personalised movement orders.',
            })
          }
        }}
      />
    </div>
  )
}
