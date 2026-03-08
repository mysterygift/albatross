import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Document, Page, pdfjs } from 'react-pdf'
import { useCurrentProduction } from '@/features/productions/context'
import { listShootDaysByProduction, getShootDayById } from '@/lib/db/repositories/schedule'
import { listStripsByShootDay } from '@/lib/db/repositories/stripboard-strips'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
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
import { getProductionById } from '@/lib/db/repositories/production'
import { generateCallSheetPdf } from '@/lib/pdf/callSheet'
import type { CallSheetData } from '@/lib/pdf/callSheet'
import { saveFileWithDialog, openInSystem } from '@/lib/files'
import { getWeatherSummaryForCallSheet } from '@/lib/weather/openMeteo'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export function CallSheetsPage() {
  const { currentProductionId } = useCurrentProduction()
  const [shootDayId, setShootDayId] = useState<string | null>(null)
  const [shootDayUnitId, setShootDayUnitId] = useState<string | null>(null)
  const [weatherSummary, setWeatherSummary] = useState('')
  const [weatherFallbackMessage, setWeatherFallbackMessage] = useState<string | null>(null)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)

  const { data: production } = useQuery({
    queryKey: ['production', currentProductionId],
    queryFn: () => getProductionById(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: () => listShootDaysByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: shootDay } = useQuery({
    queryKey: ['shoot-day', shootDayId],
    queryFn: () => getShootDayById(shootDayId!),
    enabled: !!shootDayId,
  })

  const { data: dayUnits = [] } = useQuery({
    queryKey: ['shoot-day-units', shootDayId],
    queryFn: () => listShootDayUnitsByShootDay(shootDayId!),
    enabled: !!shootDayId,
  })

  const { data: strips = [] } = useQuery({
    queryKey: ['strips', shootDayId],
    queryFn: () => listStripsByShootDay(shootDayId!),
    enabled: !!shootDayId,
  })

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', currentProductionId],
    queryFn: () => listScenesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: shots = [] } = useQuery({
    queryKey: ['shots', currentProductionId],
    queryFn: () => listShotsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: keyContacts = [] } = useQuery({
    queryKey: ['key-contacts', currentProductionId],
    queryFn: () => listKeyContactsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId],
    queryFn: () => listCast(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: crew = [] } = useQuery({
    queryKey: ['crew', currentProductionId],
    queryFn: () => listCrew(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: units = [] } = useQuery({
    queryKey: ['units', currentProductionId],
    queryFn: () => listUnitsByProduction(currentProductionId ?? ''),
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
    queryFn: () => getCastIdsBySceneIds(sceneIdsScheduled),
    enabled: sceneIdsScheduled.length > 0,
  })

  const { data: castByShotId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-shot-callsheet', shotIdsScheduled.join(',')],
    queryFn: () => getCastIdsByShotIds(shotIdsScheduled),
    enabled: shotIdsScheduled.length > 0,
  })

  const { data: bookingsForDay = [] } = useQuery({
    queryKey: ['bookings-by-shoot-day', shootDayId],
    queryFn: () => listBookingsByShootDay(shootDayId!),
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

  const castCalledNames = useMemo(() => getCastCalledNames(castResult.castRows), [castResult.castRows])

  const crewGroupsForPreview = useMemo(
    () => getCallSheetCrewRequirements(bookingsForDay, crew),
    [bookingsForDay, crew]
  )

  const locationIdsUsed = useMemo(() => {
    const set = new Set<string>()
    for (const s of unitStrips) {
      if (s.scene_id) {
        const scene = scenes.find((c) => c.id === s.scene_id)
        if (scene?.location_id) set.add(scene.location_id)
      }
    }
    return Array.from(set)
  }, [unitStrips, scenes])
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

  const buildCallSheetData = useMemo(() => {
    if (!production || !shootDay || !shootDayUnitId) return null
    const dayUnit = dayUnits.find((u) => u.id === shootDayUnitId)
    const unit = dayUnit ? units.find((u) => u.id === dayUnit.unit_id) : null
    const unitName = unit?.name ?? 'Main Unit'
    const schedule = unitStrips.map((s) => {
      const shot = s.shot_id ? shots.find((sh) => sh.id === s.shot_id) : null
      const shotNumber = shot?.shot_number ?? null
      if ((s.strip_type === 'SHOT' || s.strip_type === 'SCENE') && s.scene_id) {
        const scene = scenes.find((c) => c.id === s.scene_id)
        return {
          strip_type: 'SCENE' as const,
          scene_number: scene?.scene_number ?? null,
          scene_title: scene?.title ?? scene?.heading ?? null,
          int_ext: scene?.int_ext ?? null,
          day_night: scene?.day_night ?? null,
          page_eighths: scene?.page_eighths ?? null,
          shot_number: shotNumber,
          title: null,
          description: null,
        }
      }
      return {
        strip_type: s.strip_type === 'SHOT' ? 'SCENE' as const : s.strip_type,
        scene_number: null,
        scene_title: null,
        int_ext: null,
        day_night: null,
        page_eighths: null,
        shot_number: shotNumber,
        title: s.title ?? null,
        description: s.description ?? null,
      }
    })
    const mealTimes = mealTimesFromDay.length ? mealTimesFromDay : [{ name: 'Lunch', time: '13:00' }]
    return {
      productionName: production.name,
      shootDate: shootDay.shoot_date,
      unitName,
      dayNumber: shootDay.day_number ?? null,
      callTime: shootDay.call_time ?? null,
      wrapTime: shootDay.wrap_time ?? null,
      dayNotes: shootDay.notes ?? null,
      unitNotes: dayUnit?.notes ?? null,
      keyContacts: keyContacts.map((c) => ({
        department: c.department,
        name: c.name ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        notes: c.notes ?? null,
      })),
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
      castCalledRows: castResult.castRows,
      crewGroups: getCallSheetCrewRequirements(bookingsForDay, crew),
      locations: locationsForDay.map((l) => ({
        name: l.name,
        address: l.address,
        what3words: l.what3words ?? null,
        notes: l.notes ?? null,
      })),
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
    keyContacts,
    mealTimesFromDay,
    castCalledNames,
    castResult.castRows,
    bookingsForDay,
    crew,
    locationsForDay,
  ])

  const generateMutation = useMutation({
    mutationFn: async (options: {
      save: boolean
      openAfter?: boolean
      baseData: CallSheetData | null
      locationQuery: string
      shootDate: string
      fallbackWeather: string | null
    }) => {
      const { baseData, locationQuery, shootDate, fallbackWeather } = options
      if (!baseData || !currentProductionId || !shootDay) throw new Error('Missing data')
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b93f2f'},body:JSON.stringify({sessionId:'b93f2f',location:'page.tsx:generateMutation',message:'weather lookup inputs',data:{locationQuery,shootDate,locationQueryLength:locationQuery?.length,fallbackWeather:!!fallbackWeather},hypothesisId:'H1-H4',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      let weather: string | null = null
      let usedFallback = true
      try {
        weather = await getWeatherSummaryForCallSheet(locationQuery, shootDate)
        if (weather != null) usedFallback = false
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b93f2f'},body:JSON.stringify({sessionId:'b93f2f',location:'page.tsx:after getWeatherSummary',message:'weather result',data:{weather:weather??'null',usedFallback},hypothesisId:'H2-H4',timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b93f2f'},body:JSON.stringify({sessionId:'b93f2f',location:'page.tsx:catch',message:'weather lookup threw',data:{message:String((e as Error)?.message)},hypothesisId:'H5',timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        // use fallback below
      }
      const finalWeather = weather ?? fallbackWeather ?? null
      const data: CallSheetData = { ...baseData, weatherSummary: finalWeather }
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
    onSuccess: (result) => {
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
    setWeatherFallbackMessage(null)
    const locationQuery =
      locationsForDay.length > 0
        ? [locationsForDay[0].name, locationsForDay[0].address].filter(Boolean).join(', ')
        : ''
    const fallbackWeather = weatherSummary || weatherFromDay || null
    generateMutation.mutate({
      save,
      openAfter,
      baseData,
      locationQuery,
      shootDate: shootDay.shoot_date,
      fallbackWeather,
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
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Crew called (booked crew by department)
                  </Label>
                  {crewGroupsForPreview.length > 0 ? (
                    <div className="rounded-md border border-border overflow-hidden">
                      {crewGroupsForPreview.map((group) => (
                        <div key={group.department} className="border-b border-border last:border-b-0">
                          <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            {group.department}
                          </div>
                          <Table>
                            <TableBody>
                              {group.rows.map((row) => (
                                <TableRow key={row.person_id} className="border-border">
                                  <TableCell className="py-1.5">{row.name}</TableCell>
                                  <TableCell className="text-muted-foreground py-1.5">
                                    {row.role_name ?? '—'}
                                    {row.is_hod && (
                                      <span className="ml-1.5 text-xs text-muted-foreground">(HOD)</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground py-1.5">{row.phone ?? '—'}</TableCell>
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
                onClick={() => handleGenerate(true, true)}
                disabled={!buildCallSheetData || generateMutation.isPending}
              >
                Save & Open
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {previewPdfUrl ? (
              <ScrollArea className="h-[480px] w-full rounded border border-border">
                <Document
                  file={previewPdfUrl}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                >
                  {numPages != null && Array.from({ length: numPages }, (_, i) => (
                    <Page key={i} pageNumber={i + 1} width={340} />
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
    </div>
  )
}
