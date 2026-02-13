import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Document, Page, pdfjs } from 'react-pdf'
import { useCurrentProduction } from '@/features/productions/context'
import { listShootDaysByProduction, getShootDayById } from '@/lib/db/repositories/schedule'
import { listStripsByShootDay } from '@/lib/db/repositories/stripboard-strips'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listScenesByProduction } from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listKeyContactsByProduction } from '@/lib/db/repositories/key-contacts'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { listCast } from '@/lib/db/repositories/person'
import { getProductionById } from '@/lib/db/repositories/production'
import { generateCallSheetPdf } from '@/lib/pdf/callSheet'
import { saveFileWithDialog, openInSystem } from '@/lib/files'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const { data: castBySceneId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-scene-callsheet', sceneIdsScheduled.join(',')],
    queryFn: () => getCastIdsBySceneIds(sceneIdsScheduled),
    enabled: sceneIdsScheduled.length > 0,
  })

  const castCalledIds = useMemo(() => {
    const set = new Set<string>()
    for (const ids of castBySceneId.values()) for (const id of ids) set.add(id)
    return Array.from(set)
  }, [castBySceneId])
  const castCalledNames = useMemo(
    () => castCalledIds.map((id) => cast.find((p) => p.id === id)?.name ?? id).sort(),
    [castCalledIds, cast]
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
      if ((s.strip_type === 'SHOT' || s.strip_type === 'SCENE') && s.scene_id) {
        const scene = scenes.find((c) => c.id === s.scene_id)
        return {
          strip_type: 'SCENE' as const,
          scene_number: scene?.scene_number ?? null,
          scene_title: scene?.title ?? scene?.heading ?? null,
          int_ext: scene?.int_ext ?? null,
          day_night: scene?.day_night ?? null,
          page_eighths: scene?.page_eighths ?? null,
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
        title: s.title ?? null,
        description: s.description ?? null,
      }
    })
    const mealTimes = mealTimesFromDay.length ? mealTimesFromDay : [{ name: 'Lunch', time: '13:00' }]
    const weather = weatherSummary || weatherFromDay || undefined
    return {
      productionName: production.name,
      shootDate: shootDay.shoot_date,
      unitName,
      callTime: shootDay.call_time ?? null,
      wrapTime: shootDay.wrap_time ?? null,
      keyContacts: keyContacts.map((c) => ({
        department: c.department,
        name: c.name ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
      })),
      hospitalName: shootDay.hospital_name ?? null,
      hospitalAddress: shootDay.hospital_address ?? null,
      policeStationName: shootDay.police_station_name ?? null,
      policeStationAddress: shootDay.police_station_address ?? null,
      weatherSummary: weather ?? null,
      parkingBaseAddress: shootDay.parking_base_address ?? null,
      mealTimes,
      specialNotes: shootDay.special_notes ?? null,
      schedule,
      castCalled: castCalledNames,
      locations: locationsForDay.map((l) => ({ name: l.name, address: l.address })),
    }
  }, [
    production,
    shootDay,
    shootDayUnitId,
    dayUnits,
    units,
    unitStrips,
    scenes,
    keyContacts,
    mealTimesFromDay,
    weatherSummary,
    weatherFromDay,
    castCalledNames,
    locationsForDay,
  ])

  const generateMutation = useMutation({
    mutationFn: async (options: { save: boolean; openAfter?: boolean }) => {
      const data = buildCallSheetData
      if (!data || !currentProductionId || !shootDay) throw new Error('Missing data')
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
        return { bytes }
      }
      return { bytes }
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
    },
  })

  const handleGenerate = (save: boolean, openAfter?: boolean) => {
    generateMutation.mutate({ save, openAfter })
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
              <Label>Weather (manual)</Label>
              <Input
                className="bg-input border-border"
                value={weatherSummary || weatherFromDay}
                onChange={(e) => setWeatherSummary(e.target.value)}
                placeholder="e.g. Sunny, 72°F"
              />
            </div>
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
