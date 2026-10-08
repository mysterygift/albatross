import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ExternalLink, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UnitChip } from '@/features/risk-assessments/UnitChip'
import { DAY_PACK_PLACEHOLDERS } from '@/lib/day-pack/emailTemplate'
import {
  isSendable,
  type DayPackDocKind,
  type DayPackDocStatus,
  type DayPackSource,
} from '@/lib/day-pack/loadDayPackSources'
import type { DayPackRecipient } from '@/lib/day-pack/loadDayPackRecipients'
import { cn } from '@/lib/utils'

const DRAFT_LABEL: Record<'none' | 'opened' | 'sent' | 'saved' | 'shared', string> = {
  none: 'Open draft',
  opened: 'Opened',
  sent: 'Sent',
  saved: 'In Drafts',
  shared: 'Shared',
}

const STATUS_LABEL: Record<DayPackDocStatus, string> = {
  ready: 'Ready',
  stale: 'Check',
  generated: 'Generated',
  missing: 'Missing',
  empty: 'Nothing to send',
}

const STATUS_CLASS: Record<DayPackDocStatus, string> = {
  ready: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  stale: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
  generated: 'border-sky-500/40 text-sky-600 dark:text-sky-400',
  missing: 'border-destructive/50 text-destructive',
  empty: 'border-border text-muted-foreground',
}

/** Where to go to fix a missing or stale document. */
function fixLink(kind: DayPackDocKind, dayId: string, unitId: string): { to: string; label: string } | null {
  const q = `?day=${encodeURIComponent(dayId)}&unit=${encodeURIComponent(unitId)}`
  if (kind === 'call_sheet') return { to: `/call-sheets${q}`, label: 'Call Sheets' }
  if (kind === 'movement_order') return { to: `/movement-orders${q}`, label: 'Movement Orders' }
  // The Sides Builder opens from the day summary on the Calendar.
  if (kind === 'sides') return { to: '/schedule/calendar', label: 'Calendar' }
  if (kind === 'risk_assessments') return { to: '/risk-assessments', label: 'Risk Assessments' }
  return null
}

export function DayPackDocumentsCard({
  sources,
  selected,
  onToggle,
  shootDayId,
  shootDayUnitId,
  disabled,
}: {
  sources: DayPackSource[]
  selected: ReadonlySet<DayPackDocKind>
  onToggle: (kind: DayPackDocKind, checked: boolean) => void
  shootDayId: string
  shootDayUnitId: string
  disabled?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {sources.map((source) => {
            const sendable = isSendable(source)
            const link = source.status === 'missing' || source.status === 'stale'
              ? fixLink(source.kind, shootDayId, shootDayUnitId)
              : null
            return (
              <li key={source.kind} className="flex items-start gap-3 px-4 py-3">
                <Checkbox
                  id={`doc-${source.kind}`}
                  checked={sendable && selected.has(source.kind)}
                  disabled={!sendable || disabled}
                  onCheckedChange={(v) => onToggle(source.kind, v === true)}
                  className="mt-0.5"
                  aria-label={`Include ${source.label}`}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`doc-${source.kind}`} className="text-sm font-medium">
                      {source.label}
                    </label>
                    <Badge variant="outline" className={cn('text-[11px]', STATUS_CLASS[source.status])}>
                      {STATUS_LABEL[source.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{source.detail}</p>
                  {source.warning && (
                    <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      {source.warning}
                    </p>
                  )}
                </div>
                {link && (
                  <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1">
                    <Link to={link.to}>
                      {link.label}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export function DayPackRecipientsCard({
  recipients,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
  multiUnitDay,
  unitName,
  drafted,
  canOpen,
  onOpenDraft,
  disabled,
}: {
  recipients: DayPackRecipient[]
  selected: ReadonlySet<string>
  onToggle: (id: string, checked: boolean) => void
  onSelectAll: () => void
  onClearAll: () => void
  multiUnitDay: boolean
  unitName: string
  /** How each person's draft went: opened in the mail app, or sent, saved or shared on iPad. */
  drafted: ReadonlyMap<string, 'opened' | 'sent' | 'saved' | 'shared'>
  /** True once packs are prepared for the current selection. */
  canOpen: boolean
  onOpenDraft: (recipient: DayPackRecipient) => void
  disabled?: boolean
}) {
  const unassigned = multiUnitDay
    ? recipients.filter((r) => r.type === 'crew' && r.bookedFor === 'all').length
    : 0
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Recipients</CardTitle>
        {recipients.length > 0 && (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="xs" onClick={onSelectAll} disabled={disabled}>
              Select all
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={onClearAll} disabled={disabled}>
              Clear all
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {unassigned > 0 && (
          <p className="mx-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
            {unassigned} crew {unassigned === 1 ? 'is' : 'are'} booked for the whole day rather than a unit, so{' '}
            {unassigned === 1 ? 'they get' : 'they get'} every unit's pack. Set their unit on{' '}
            <Link to="/people/bookings" className="underline">
              Bookings
            </Link>{' '}
            if they only work with {unitName}.
          </p>
        )}
        {recipients.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No cast or crew are called to this unit yet. Book people on this shoot day first.
          </p>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto border-t border-border">
            {recipients.map((r) => {
              const noEmail = !r.email
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                  <Checkbox
                    checked={!noEmail && selected.has(r.id)}
                    disabled={noEmail || disabled}
                    onCheckedChange={(v) => onToggle(r.id, v === true)}
                    aria-label={`Send to ${r.fullName}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.email ?? 'No email address'}
                      {r.type === 'cast' && r.agentEmail ? ` | agent ${r.agentEmail}` : ''}
                    </p>
                  </div>
                  {multiUnitDay && r.type === 'crew' && (
                    r.bookedFor === 'unit' ? (
                      <UnitChip name={unitName} className="text-[11px]" />
                    ) : (
                      <Badge variant="outline" className="text-[11px] border-border/60">
                        All units
                      </Badge>
                    )
                  )}
                  <Badge variant="outline" className="text-[11px] border-border/60">
                    {r.type === 'cast' ? 'Cast' : 'Crew'}
                  </Badge>
                  {noEmail ? (
                    <Badge variant="outline" className="text-[11px] border-destructive/50 text-destructive">
                      No email
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      variant={drafted.has(r.id) ? 'ghost' : 'outline'}
                      size="xs"
                      className="gap-1"
                      disabled={!canOpen || !selected.has(r.id)}
                      onClick={() => onOpenDraft(r)}
                    >
                      {drafted.has(r.id) ? <Check className="size-3.5" aria-hidden /> : <Mail className="size-3.5" aria-hidden />}
                      {DRAFT_LABEL[drafted.get(r.id) ?? 'none']}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function DayPackEmailCard({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  onCommit,
  onReset,
  ccAgents,
  onCcAgentsChange,
  preview,
}: {
  subject: string
  body: string
  onSubjectChange: (v: string) => void
  onBodyChange: (v: string) => void
  /** Save the current subject and body for this production. */
  onCommit: () => void
  onReset: () => void
  ccAgents: boolean
  onCcAgentsChange: (v: boolean) => void
  /** The email as the first selected recipient will get it. */
  preview: { to: string; subject: string; body: string } | null
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Email</CardTitle>
        <Button type="button" variant="ghost" size="xs" onClick={onReset}>
          Reset to default
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="day-pack-subject">Subject</Label>
          <Input
            id="day-pack-subject"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            onBlur={onCommit}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="day-pack-body">Message</Label>
          <Textarea
            id="day-pack-body"
            value={body}
            rows={8}
            onChange={(e) => onBodyChange(e.target.value)}
            onBlur={onCommit}
          />
          <p className="text-xs text-muted-foreground">
            Filled in for each person:{' '}
            {DAY_PACK_PLACEHOLDERS.map((p) => (
              <code key={p} className="mr-1 rounded bg-muted px-1 py-0.5">{`{${p}}`}</code>
            ))}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={ccAgents} onCheckedChange={(v) => onCcAgentsChange(v === true)} />
          Copy in cast agents
        </label>
        {preview && (
          <div className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <p className="text-muted-foreground">Preview for {preview.to}</p>
            <p className="font-medium">{preview.subject}</p>
            <p className="whitespace-pre-line text-muted-foreground">{preview.body}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
