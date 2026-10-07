import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { toast } from '@/components/ui/sonner'
import { CHART_TEMPLATES, type ChartTemplateId, type ChartTemplateMode } from '@/lib/budget/chartTemplates'
import { applyChartTemplate, previewChartTemplate } from '@/lib/db/applyChartTemplate'

const MODE_OPTIONS: { value: ChartTemplateMode; label: string }[] = [
  { value: 'merge', label: 'Add missing accounts' },
  { value: 'replace', label: 'Replace unused accounts' },
]

const MODE_HELP: Record<ChartTemplateMode, string> = {
  merge: 'Adds the template’s accounts alongside yours. Nothing you already have is changed or removed.',
  replace:
    'Removes your accounts that aren’t in the template and have no line items or expenses, renames matching accounts to the template’s names, then adds the rest. Accounts with posted amounts always stay.',
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function ApplyChartTemplateDialog({
  open,
  onOpenChange,
  productionId,
  revisionId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  revisionId: string | undefined
}) {
  const queryClient = useQueryClient()
  const [templateId, setTemplateId] = useState<ChartTemplateId>('standard')
  const [mode, setMode] = useState<ChartTemplateMode>('merge')
  const template = CHART_TEMPLATES.find((t) => t.id === templateId)!

  const { data: plan, isFetching: planLoading } = useQuery({
    queryKey: ['chart-template-preview', productionId, templateId, mode],
    queryFn: () => previewChartTemplate(productionId, templateId, mode),
    enabled: open,
    staleTime: 0,
  })

  const applyMutation = useMutation({
    mutationFn: () => applyChartTemplate({ productionId, revisionId, templateId, mode }),
    onSuccess: (result) => {
      for (const key of [
        'budget-accounts',
        'budgetAccounts',
        'budget-accounts-eligible-delete',
        'production-totals',
        'fringe-rules',
        'contingency-rules',
        'cost-report-groups',
        'cost-report-groups-with-accounts',
        'chart-template-preview',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key, productionId] })
      }
      const parts = [`${plural(result.added, 'account')} added`]
      if (result.removed) parts.push(`${result.removed} removed`)
      if (result.renamed) parts.push(`${result.renamed} renamed`)
      if (result.fringeRulesAdded.length) parts.push(plural(result.fringeRulesAdded.length, 'fringe rule') + ' added')
      toast.success(`${template.name} template applied: ${parts.join(', ')}.`)
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not apply the template')
    },
  })

  const nothingToDo = plan != null && plan.add.length === 0 && plan.remove.length === 0 && plan.rename.length === 0
  const fringeNames = template.fringes.map((f) => f.name)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Apply a chart of accounts template</DialogTitle>
          <DialogDescription>
            Bring this production’s accounts in line with a template. Line items and expenses are never touched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <div className="grid gap-2" role="radiogroup" aria-label="Chart of accounts template">
              {CHART_TEMPLATES.map((t) => {
                const selected = t.id === templateId
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTemplateId(t.id)}
                    className={`rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      selected ? 'border-primary/50 bg-primary/10' : 'border-border hover:border-muted-foreground/40'
                    }`}
                  >
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground leading-snug">{t.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>How to apply</Label>
            <SegmentedControl value={mode} onValueChange={setMode} options={MODE_OPTIONS} size="sm" ariaLabel="How to apply" />
            <p className="text-xs text-muted-foreground leading-snug">{MODE_HELP[mode]}</p>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-1.5" aria-live="polite">
            {!plan || planLoading ? (
              <p className="text-muted-foreground">Working out changes…</p>
            ) : nothingToDo ? (
              <p className="text-muted-foreground">
                Your chart already has every account in this template. Applying it will still add any missing totals or
                fringe rules.
              </p>
            ) : (
              <>
                <p>
                  <span className="font-medium">{plural(plan.add.length, 'account')}</span> to add
                  {plan.remove.length > 0 && (
                    <>
                      , <span className="font-medium text-destructive">{plan.remove.length}</span> to remove
                    </>
                  )}
                  {plan.rename.length > 0 && <>, {plan.rename.length} to rename</>}
                </p>
                {mode === 'replace' && plan.keep.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {plural(plan.keep.length, 'account')} outside the template will stay because they (or accounts under them)
                    have line items or expenses.
                  </p>
                )}
                {mode === 'merge' && plan.keep.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {plural(plan.keep.length, 'existing account')} outside the template will stay as they are.
                  </p>
                )}
                {fringeNames.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Adds fringe rules that don’t already exist: {fringeNames.join(', ')} (
                    {Math.round(template.fringes[0]!.rate * 100)}% employer’s NI on pay lines only).
                  </p>
                )}
                {plan.skipped.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-amber-700 dark:text-amber-300">
                      {plural(plan.skipped.length, 'template account')} can’t be added because of code clashes
                    </summary>
                    <ul className="mt-1 max-h-32 overflow-auto space-y-0.5 text-muted-foreground">
                      {plan.skipped.map(({ account, reason }) => (
                        <li key={account.code}>
                          <span className="font-mono">{account.code}</span> {account.name}: {reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={applyMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={plan && plan.remove.length > 0 ? 'destructive' : 'default'}
            onClick={() => applyMutation.mutate()}
            disabled={!plan || planLoading || applyMutation.isPending}
          >
            {applyMutation.isPending ? 'Applying…' : `Apply ${template.name} template`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
