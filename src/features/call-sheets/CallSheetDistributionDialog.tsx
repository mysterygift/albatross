import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
type RecipientType = 'cast' | 'crew'

export interface CallSheetRecipient {
  id: string
  fullName: string
  type: RecipientType
}

export interface CallSheetDistributionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: {
    productionName: string
    shootDate: string
    unitName: string
    dayNumber: number | null
  } | null
  recipients: CallSheetRecipient[]
  onGenerateSelected?: (selected: CallSheetRecipient[]) => void
  loading?: boolean
  statusMessage?: string | null
  error?: string | null
}

export function CallSheetDistributionDialog({
  open,
  onOpenChange,
  context,
  recipients,
  onGenerateSelected,
  loading = false,
  statusMessage,
  error,
}: CallSheetDistributionDialogProps) {
  const initialSelectedIds = useMemo(() => new Set(recipients.map((r) => r.id)), [recipients])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelectedIds)

  // When the recipient list changes (e.g. different shoot day/unit while dialog open), reset selection to all selected
  const recipientIdKey = useMemo(
    () => recipients.map((r) => r.id).sort().join(','),
    [recipients],
  )
  useEffect(() => {
    setSelectedIds(new Set(recipients.map((r) => r.id)))
  }, [recipientIdKey])

  const hasRecipients = recipients.length > 0
  const allSelected = hasRecipients && selectedIds.size === recipients.length
  const anySelected = selectedIds.size > 0

  const handleToggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(recipients.map((r) => r.id)))
  }

  const handleClearAll = () => {
    setSelectedIds(new Set())
  }

  const handleGenerate = () => {
    if (!anySelected || !onGenerateSelected) return
    const selected = recipients.filter((r) => selectedIds.has(r.id))
    onGenerateSelected(selected)
  }

  const renderContextLine = () => {
    if (!context) return null
    const parts = [
      context.productionName,
      context.shootDate,
      context.unitName,
      context.dayNumber != null ? `Day ${context.dayNumber}` : null,
    ].filter(Boolean)
    return parts.join(' • ')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-border bg-card flex max-h-[min(90vh,720px)] flex-col gap-4 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Distribute Call Sheets</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Choose which cast and crew should receive a personalised copy of this call sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {context && (
            <div className="shrink-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <p className="font-medium text-foreground truncate">{context.productionName}</p>
              <p className="text-muted-foreground mt-0.5 truncate">{renderContextLine()}</p>
            </div>
          )}

          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {hasRecipients
                ? `${recipients.length} recipient${recipients.length === 1 ? '' : 's'} available`
                : 'No recipients available for this shoot day yet.'}
            </p>
            {hasRecipients && (
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <Button type="button" variant="ghost" size="xs" onClick={handleSelectAll}>
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={handleClearAll}>
                  Clear all
                </Button>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted/20">
            {hasRecipients ? (
              <ul className="min-h-0 flex-1 list-none divide-y divide-border overflow-y-auto overscroll-contain">
                {recipients.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={(v) => handleToggle(r.id, v === true)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.fullName}</p>
                    </div>
                    <Badge variant="outline" className="text-[11px] border-border/60">
                      {r.type === 'cast' ? 'Cast' : 'Crew'}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No cast or crew recipients are associated with this shoot day yet.
              </div>
            )}
          </div>

          {(statusMessage || error) && (
            <div className="shrink-0 text-xs">
              {statusMessage && (
                <p className="text-muted-foreground whitespace-pre-line">
                  {loading ? (
                    <span className="text-foreground">{statusMessage}</span>
                  ) : (
                    <span className="text-emerald-400">{statusMessage}</span>
                  )}
                </p>
              )}
              {error && <p className="text-destructive mt-1">{error}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="mt-0 shrink-0 flex flex-row items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" disabled={!anySelected || loading} onClick={handleGenerate}>
            {loading ? 'Exporting…' : 'Generate Selected Copies'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

