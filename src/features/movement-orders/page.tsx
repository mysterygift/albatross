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
  listShootDayUnitsByShootDayForActor,
  listShotsByProductionForActor,
  listStripsByShootDayForActor,
  listUnitsByProductionForActor,
} from '@/lib/access/projectDomainService'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { movementOrdersTutorialSteps } from '@/features/tutorial/sections/movementOrdersTutorial'
import {
  getShootDayById,
  listScenesByProduction,
  listShootDaysByProduction,
  listShotsByProduction,
} from '@/lib/db/repositories/schedule'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
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
import { buildMovementOrderLegSkeleton } from '@/lib/movement-orders/movementLegs'
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

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export function MovementOrdersPage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [shootDayId, setShootDayId] = useState<string | null>(null)
  const [shootDayUnitId, setShootDayUnitId] = useState<string | null>(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [distributionOpen, setDistributionOpen] = useState(false)
  const [distributionStatus, setDistributionStatus] = useState<{
    loading: boolean
    message: string | null
    error: string | null
  }>({ loading: false, message: null, error: null })
  const [distributionExportSuccessMessage, setDistributionExportSuccessMessage] = useState<
    string | null
  >(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const defaultCrewHierarchy = getDefaultCrewHierarchyConfig()
  const canLoadProjectData = !authSession.authSupported || !!authSession.currentUser

  useEffect(() => {
    if (progress?.currentSection === 'movement_orders') {
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
    () => getCallSheetCrewRequirements(crewHierarchy, bookingsForDay, crew),
    [crewHierarchy, bookingsForDay, crew]
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

  const movementLegs = useMemo(
    () => buildMovementOrderLegSkeleton(orderedLocations),
    [orderedLocations]
  )

  const movementOrderData = useMemo<MovementOrderData | null>(() => {
    if (!production || !shootDay || !selectedUnit) return null
    return buildMovementOrderData({
      productionName: production.name,
      shootDate: shootDay.shoot_date,
      dayNumber: shootDay.day_number ?? null,
      unitName: selectedUnit.name,
      locations: orderedLocations,
      locationContacts,
      movementLegs,
    })
  }, [production, shootDay, selectedUnit, orderedLocations, locationContacts, movementLegs])

  const refreshTravelDataRef = useRef(false)

  const {
    data: enrichedMovementOrderData,
    isFetching: isEnrichingRouteData,
    refetch: refetchEnrichedMovementOrder,
  } = useQuery({
    queryKey: [
      'movement-order-data-enriched',
      shootDayId,
      shootDayUnitId,
      movementOrderData?.locations.map((location) => location.id).join(',') ?? '',
      movementOrderData?.locations
        .map((location) => `${location.name}|${location.address ?? ''}`)
        .join('||') ?? '',
    ],
    enabled: !!movementOrderData,
    queryFn: async () => {
      if (!movementOrderData) return null
      const forceRefresh = refreshTravelDataRef.current
      refreshTravelDataRef.current = false
      const enrichedLegs = await enrichMovementLegsWithRouteData({
        locations: movementOrderData.locations,
        forceRefresh,
      })
      return buildMovementOrderData({
        productionName: movementOrderData.productionName,
        shootDate: movementOrderData.shootDate,
        dayNumber: movementOrderData.dayNumber,
        unitName: movementOrderData.unitName,
        locations: movementOrderData.locations,
        locationContacts: movementOrderData.locationContacts,
        movementLegs: enrichedLegs,
      })
    },
  })
  const movementOrderDataForView = enrichedMovementOrderData ?? movementOrderData

  const distributionContext = useMemo(() => {
    if (!movementOrderDataForView) return null
    return {
      productionName: movementOrderDataForView.productionName,
      shootDate: movementOrderDataForView.shootDate,
      unitName: movementOrderDataForView.unitName,
      dayNumber: movementOrderDataForView.dayNumber,
    }
  }, [movementOrderDataForView])

  const distributionRecipients: MovementOrderRecipient[] = useMemo(() => {
    if (!movementOrderDataForView) return []
    const castRecipients: MovementOrderRecipient[] = (castResult.castRows ?? []).map((row) => ({
      id: `cast-${row.person_id}`,
      fullName: row.name,
      type: 'cast' as const,
    }))
    const crewRecipients: MovementOrderRecipient[] = crewGroupsForPreview.flatMap((group) =>
      group.rows.map((row) => ({
        id: `crew-${row.person_id}`,
        fullName: row.name,
        type: 'crew' as const,
      }))
    )
    const map = new Map<string, MovementOrderRecipient>()
    for (const r of [...castRecipients, ...crewRecipients]) {
      if (!map.has(r.id)) map.set(r.id, r)
    }
    return Array.from(map.values())
  }, [movementOrderDataForView, castResult.castRows, crewGroupsForPreview])

  const generateMutation = useMutation({
    mutationFn: async (options: {
      data: MovementOrderData | null
      save: boolean
      openAfter?: boolean
    }) => {
      if (!options.data) throw new Error('Missing movement order data.')
      const pdfBytes = await generateMovementOrderPDF(options.data)
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
      <div>
        <h1 className="text-2xl font-semibold">Movement Orders</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Movement Orders</h1>
      <p className="text-muted-foreground text-sm">
        Generate movement orders for a selected shoot day and unit.
      </p>

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

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  refreshTravelDataRef.current = true
                  void refetchEnrichedMovementOrder()
                }}
                disabled={!movementOrderData || isEnrichingRouteData}
              >
                {isEnrichingRouteData ? 'Refreshing travel…' : 'Refresh travel data'}
              </Button>
              <Button
                onClick={() => handleGenerate(false)}
                disabled={!movementOrderDataForView || generateMutation.isPending}
              >
                {generateMutation.isPending ? 'Generating...' : 'Preview Movement Order'}
              </Button>
              <Button
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
                        key={`${leg.fromLocationName}-${leg.toLocationName}`}
                        className="rounded border border-border p-2"
                      >
                        <p className="font-medium">
                          {leg.fromLocationName} {'->'} {leg.toLocationName}
                        </p>
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
              const pdfBytes = await generateMovementOrderPDF(movementOrderDataForView)
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
      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'movement_orders' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                movement_orders:
                  prev.sections.movement_orders === 'not_started'
                    ? 'in_progress'
                    : prev.sections.movement_orders,
              },
            }))
          }
        }}
        sectionId="movement_orders"
        sectionTitle="Movement Orders"
        steps={movementOrdersTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'movement_orders' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              movement_orders: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}
