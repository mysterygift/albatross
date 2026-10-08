import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Info, Mails, PackageCheck } from 'lucide-react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { ExperimentalBadge } from '@/components/experimental-badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { useCurrentProduction } from '@/features/productions/context'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { buildDayPackFiles, type DayPackBuildResult } from '@/lib/day-pack/buildDayPackFiles'
import { openMailDraft, type OpenMailDraftResult } from '@/lib/day-pack/composeMail'
import {
  DEFAULT_DAY_PACK_BODY,
  DEFAULT_DAY_PACK_SUBJECT,
  dayPackEmailBodySettingKey,
  dayPackEmailSubjectSettingKey,
  dayPackTemplateVars,
  renderDayPackTemplate,
} from '@/lib/day-pack/emailTemplate'
import type { DayRecipient } from '@/lib/call-sheets/recipients'
import { loadDayPackRecipients } from '@/lib/day-pack/loadDayPackRecipients'
import { isSendable, loadDayPackSources, type DayPackDocKind } from '@/lib/day-pack/loadDayPackSources'
import { resolveAppDataPath } from '@/lib/files'
import { localIsoDate } from '@/lib/dates/localIsoDate'
import { loadScheduleExportSources } from '@/lib/schedule/scheduleExportSources'
import { sortShootDayUnitsForDisplay } from '@/lib/schedule/unitKey'
import { DayPackDocumentsCard, DayPackEmailCard, DayPackRecipientsCard } from './day-pack-cards'

/** Opening more drafts than this at once asks first. */
const OPEN_ALL_CONFIRM_THRESHOLD = 10

export function DayPackPage() {
  return (
    <RequireProduction title="Send Day Pack">
      <DayPackWorkspace />
    </RequireProduction>
  )
}

function formatShootDay(day: { day_number: number | null; shoot_date: string }): string {
  const date = new Date(day.shoot_date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return day.day_number != null ? `Day ${day.day_number} · ${date}` : date
}

function DayPackWorkspace() {
  const { currentProductionId } = useCurrentProduction()
  const productionId = currentProductionId!
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const { data: dataSource } = useEffectiveDataSourceForProduction(productionId)
  const isRemote = dataSource === 'remote_server'
  const [searchParams, setSearchParams] = useSearchParams()

  const getActor = async () =>
    authSession.authSupported && authSession.currentUser ? { db: await getDb(), actor: authSession.currentUser } : null

  // Days and units for the pickers (the same rows the exports read).
  const { data: sched } = useQuery({
    queryKey: ['day-pack-schedule', productionId],
    queryFn: async () => loadScheduleExportSources(productionId, await getActor()),
    enabled: dataSource !== undefined && !isRemote,
  })
  const days = useMemo(
    () => [...(sched?.shootDays ?? [])].sort((a, b) => a.shoot_date.localeCompare(b.shoot_date)),
    [sched]
  )
  // Packs usually go out the day before, so default to the next shoot day.
  const today = localIsoDate()
  const defaultDay = days.find((d) => d.shoot_date > today) ?? days[days.length - 1] ?? null
  const day = days.find((d) => d.id === searchParams.get('day')) ?? defaultDay
  const dayUnits = useMemo(() => {
    if (!sched || !day) return []
    const unitsById = new Map(sched.units.map((u) => [u.id, u]))
    return sortShootDayUnitsForDisplay(
      sched.shootDayUnits.filter((u) => u.shoot_day_id === day.id && !u.deleted_at),
      unitsById
    ).map((u) => ({ id: u.id, name: unitsById.get(u.unit_id)?.name ?? 'Unit' }))
  }, [sched, day])
  const unit = dayUnits.find((u) => u.id === searchParams.get('unit')) ?? dayUnits[0] ?? null

  const selectDayUnit = (dayId: string, unitId: string | null) =>
    setSearchParams(unitId ? { day: dayId, unit: unitId } : { day: dayId }, { replace: true })

  const packKey = ['day-pack', productionId, day?.id ?? null, unit?.id ?? null] as const
  const packQuery = useQuery({
    queryKey: packKey,
    queryFn: async () => {
      const actor = await getActor()
      const loaded = await loadScheduleExportSources(productionId, actor)
      const [sources, recipients] = await Promise.all([
        loadDayPackSources({ productionId, shootDayId: day!.id, shootDayUnitId: unit!.id, actor, sched: loaded }),
        loadDayPackRecipients({ sched: loaded, shootDayId: day!.id, shootDayUnitId: unit!.id }),
      ])
      return { ...sources, recipients }
    },
    enabled: !!day && !!unit && !isRemote,
  })
  const pack = packQuery.data

  // Selections reset when the day, unit or loaded data change.
  const [selectedDocs, setSelectedDocs] = useState<Set<DayPackDocKind>>(new Set())
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set())
  const [built, setBuilt] = useState<DayPackBuildResult | null>(null)
  const [opened, setOpened] = useState<Set<string>>(new Set())
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset selections to the newly loaded pack
    setSelectedDocs(new Set(pack?.sources.filter(isSendable).map((s) => s.kind) ?? []))
    setSelectedPeople(new Set(pack?.recipients.filter((r) => r.email).map((r) => r.id) ?? []))
    setBuilt(null)
    setOpened(new Set())
  }, [pack])

  // Email subject and body: saved per production when edited.
  const subjectKey = dayPackEmailSubjectSettingKey(productionId)
  const bodyKey = dayPackEmailBodySettingKey(productionId)
  const { data: savedTemplate } = useQuery({
    queryKey: ['day-pack-email', productionId],
    queryFn: async () => ({ subject: await getSetting(subjectKey), body: await getSetting(bodyKey) }),
  })
  const [subject, setSubject] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const subjectValue = subject ?? savedTemplate?.subject ?? DEFAULT_DAY_PACK_SUBJECT
  const bodyValue = body ?? savedTemplate?.body ?? DEFAULT_DAY_PACK_BODY
  const [ccAgents, setCcAgents] = useState(true)
  const saveTemplate = async (nextSubject: string, nextBody: string) => {
    await setSetting(subjectKey, nextSubject)
    await setSetting(bodyKey, nextBody)
    void queryClient.invalidateQueries({ queryKey: ['day-pack-email', productionId] })
  }

  const chosenRecipients = (pack?.recipients ?? []).filter((r) => r.email && selectedPeople.has(r.id))
  const chosenSources = (pack?.sources ?? []).filter((s) => isSendable(s) && selectedDocs.has(s.kind))

  const draftFor = (recipient: DayRecipient) => {
    const vars = dayPackTemplateVars({
      fullName: recipient.fullName,
      productionName: pack!.context.productionName,
      shootDate: pack!.context.shootDate,
      dayNumber: pack!.context.dayNumber,
      unitName: pack!.context.unitName,
    })
    return {
      to: [recipient.email!],
      cc: ccAgents && recipient.type === 'cast' && recipient.agentEmail ? [recipient.agentEmail] : [],
      subject: renderDayPackTemplate(subjectValue, vars),
      body: renderDayPackTemplate(bodyValue, vars),
    }
  }

  const [progress, setProgress] = useState<string | null>(null)
  const prepare = useMutation({
    mutationFn: () =>
      buildDayPackFiles({
        context: pack!.context,
        sources: chosenSources,
        recipients: chosenRecipients,
        onProgress: ({ phase, done, total }) =>
          setProgress(phase === 'render' ? `Rendering documents (${done + 1} of ${total})…` : `Writing copies (${done} of ${total})…`),
      }),
    onSuccess: (result) => {
      setBuilt(result)
      setOpened(new Set())
      toast.success(`Prepared ${result.people.length} ${result.people.length === 1 ? 'pack' : 'packs'}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => setProgress(null),
  })

  const openDraft = async (recipient: DayRecipient): Promise<OpenMailDraftResult | null> => {
    const person = built?.people.find((p) => p.recipient.id === recipient.id)
    if (!person) return null
    const result = await openMailDraft({
      ...draftFor(recipient),
      attachmentPaths: await Promise.all(person.files.map((f) => resolveAppDataPath(f.path))),
      folderPath: await resolveAppDataPath(person.folder),
    })
    setOpened((prev) => new Set(prev).add(recipient.id))
    return result
  }

  /** Explains a draft that opened without its files. */
  const fallbackMessage = (reason: string | null) =>
    reason
      ? `${reason}. Opened a draft without attachments instead: drag the files in from the folder that just opened.`
      : 'Your mail app opened without attachments (only Apple Mail and Outlook get them). Drag the files in from the folder that just opened.'

  const openOne = useMutation({
    mutationFn: openDraft,
    onSuccess: (result) => {
      if (result?.route === 'mailto') toast.info(fallbackMessage(result.reason))
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  const [confirmOpenAll, setConfirmOpenAll] = useState(false)
  const openAll = useMutation({
    mutationFn: async () => {
      let withoutFiles = 0
      for (const person of built?.people ?? []) {
        const result = await openDraft(person.recipient)
        if (result?.route === 'mailto') {
          // A reason (e.g. Outlook automation not allowed) will fail the same way for everyone:
          // stop after the first so it can be fixed, rather than opening every draft without files.
          if (result.reason) return { withoutFiles: withoutFiles + 1, stoppedFor: result.reason }
          withoutFiles += 1
        }
        // Give the mail app a moment between windows.
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      return { withoutFiles, stoppedFor: null }
    },
    onSuccess: ({ withoutFiles, stoppedFor }) => {
      if (stoppedFor) toast.error(`${stoppedFor}. Stopped after the first draft.`)
      else if (withoutFiles > 0) toast.info('Drafts opened without attachments: drag each person’s files in from their folder.')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  const revealFolder = async () => {
    if (built) await revealItemInDir(await resolveAppDataPath(built.folder))
  }

  const busy = prepare.isPending || openAll.isPending
  // A prepared pack no longer matches once the documents or people change.
  const preparedIds = new Set(built?.people.map((p) => p.recipient.id) ?? [])
  const preparedMatches =
    !!built &&
    chosenRecipients.length === preparedIds.size &&
    chosenRecipients.every((r) => preparedIds.has(r.id)) &&
    (built.people[0]?.files.length ?? 0) > 0
  const changeSelection = <T,>(update: (prev: Set<T>) => Set<T>) => (prev: Set<T>) => {
    setBuilt(null)
    return update(prev)
  }

  if (isRemote) {
    return (
      <div className="space-y-4">
        <PageHeader title="Send Day Pack" actions={<ExperimentalBadge />} />
        <div role="status" className="flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Send Day Pack works on productions stored on this computer only.</span>
        </div>
      </div>
    )
  }

  const firstChosen = chosenRecipients[0]
  const firstDraft = pack && firstChosen ? draftFor(firstChosen) : null
  const preview = firstDraft ? { to: firstChosen!.fullName, subject: firstDraft.subject, body: firstDraft.body } : null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Send Day Pack"
        description="Send each person called to a unit their own copy of the day's paperwork, with their name watermarked on every page, in an email draft you check and send."
        actions={<ExperimentalBadge />}
      />

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add shoot days on the stripboard first.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="day-pack-day">Shoot day</Label>
            <Select value={day?.id} onValueChange={(id) => selectDayUnit(id, null)}>
              <SelectTrigger id="day-pack-day" className="h-10 w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {formatShootDay(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="day-pack-unit">Unit</Label>
            <Select value={unit?.id} onValueChange={(id) => day && selectDayUnit(day.id, id)} disabled={dayUnits.length < 2}>
              <SelectTrigger id="day-pack-unit" className="h-10 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dayUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {packQuery.isError && (
        <p role="alert" className="text-sm text-destructive">
          {packQuery.error instanceof Error ? packQuery.error.message : 'Could not load this day pack.'}
        </p>
      )}

      {packQuery.isPending && day && unit ? (
        <div role="status" aria-label="Loading day pack" className="space-y-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : pack ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <DayPackDocumentsCard
              sources={pack.sources}
              selected={selectedDocs}
              shootDayId={pack.context.shootDayId}
              shootDayUnitId={pack.context.shootDayUnitId}
              disabled={busy}
              onToggle={(kind, checked) =>
                setSelectedDocs(
                  changeSelection((prev) => {
                    const next = new Set(prev)
                    if (checked) next.add(kind)
                    else next.delete(kind)
                    return next
                  })
                )
              }
            />
            <DayPackEmailCard
              subject={subjectValue}
              body={bodyValue}
              onSubjectChange={setSubject}
              onBodyChange={setBody}
              onCommit={() => void saveTemplate(subjectValue, bodyValue)}
              onReset={() => {
                setSubject(DEFAULT_DAY_PACK_SUBJECT)
                setBody(DEFAULT_DAY_PACK_BODY)
                void saveTemplate(DEFAULT_DAY_PACK_SUBJECT, DEFAULT_DAY_PACK_BODY)
              }}
              ccAgents={ccAgents}
              onCcAgentsChange={setCcAgents}
              preview={preview}
            />
          </div>
          <div className="space-y-4">
            <DayPackRecipientsCard
              recipients={pack.recipients}
              selected={selectedPeople}
              onToggle={(id, checked) =>
                setSelectedPeople(
                  changeSelection((prev) => {
                    const next = new Set(prev)
                    if (checked) next.add(id)
                    else next.delete(id)
                    return next
                  })
                )
              }
              onSelectAll={() =>
                setSelectedPeople(changeSelection(() => new Set(pack.recipients.filter((r) => r.email).map((r) => r.id))))
              }
              onClearAll={() => setSelectedPeople(changeSelection(() => new Set()))}
              multiUnitDay={dayUnits.length > 1}
              unitName={pack.context.unitName}
              opened={opened}
              canOpen={preparedMatches && !busy}
              onOpenDraft={(r) => openOne.mutate(r)}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="gap-1.5"
                disabled={busy || chosenSources.length === 0 || chosenRecipients.length === 0}
                onClick={() => prepare.mutate()}
              >
                <PackageCheck className="size-4" aria-hidden />
                {prepare.isPending ? 'Preparing…' : built ? 'Prepare again' : 'Prepare packs'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={!preparedMatches || busy}
                onClick={() =>
                  (built?.people.length ?? 0) > OPEN_ALL_CONFIRM_THRESHOLD ? setConfirmOpenAll(true) : openAll.mutate()
                }
              >
                <Mails className="size-4" aria-hidden />
                {openAll.isPending ? 'Opening drafts…' : 'Open all drafts'}
              </Button>
              <Button type="button" variant="ghost" className="gap-1.5" disabled={!built} onClick={() => void revealFolder()}>
                <FolderOpen className="size-4" aria-hidden />
                Reveal folder
              </Button>
            </div>
            <p className="text-xs text-muted-foreground" role="status">
              {progress ??
                (preparedMatches
                  ? `${built!.people.length} ${built!.people.length === 1 ? 'pack' : 'packs'} ready, ${built!.people[0]!.files.length} ${built!.people[0]!.files.length === 1 ? 'file' : 'files'} each. Drafts open in Apple Mail or Outlook with the files attached; check each one and press Send.`
                  : `${chosenSources.length} ${chosenSources.length === 1 ? 'document' : 'documents'} for ${chosenRecipients.length} ${chosenRecipients.length === 1 ? 'person' : 'people'}. Prepare the packs to open the email drafts.`)}
            </p>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpenAll}
        onOpenChange={setConfirmOpenAll}
        title={`Open ${built?.people.length ?? 0} email drafts?`}
        description="Each draft opens in its own window. Nothing is sent until you press Send in each one."
        confirmLabel="Open drafts"
        onConfirm={() => {
          setConfirmOpenAll(false)
          openAll.mutate()
        }}
      />
    </div>
  )
}
