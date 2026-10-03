import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentProduction } from '@/features/productions/context'
import { useWorkingBudgetRevision } from '@/hooks/useWorkingBudgetRevision'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { cn } from '@/lib/utils'
import { useOnboardingChecklist } from './useOnboardingChecklist'

export const ONBOARDING_CHECKLIST_HIDDEN_KEY = 'onboarding_checklist_hidden'

export function GetStartedChecklist() {
  const queryClient = useQueryClient()
  const { currentProductionId } = useCurrentProduction()
  const { data: revision } = useWorkingBudgetRevision(currentProductionId)
  const { items, doneCount, total, allDone } = useOnboardingChecklist(currentProductionId, revision?.id)

  const hiddenQuery = useQuery({
    queryKey: ['settings', ONBOARDING_CHECKLIST_HIDDEN_KEY],
    queryFn: async () => (await getSetting(ONBOARDING_CHECKLIST_HIDDEN_KEY)) === 'true',
  })
  const hideMutation = useMutation({
    mutationFn: () => setSetting(ONBOARDING_CHECKLIST_HIDDEN_KEY, 'true'),
    onMutate: () => queryClient.setQueryData(['settings', ONBOARDING_CHECKLIST_HIDDEN_KEY], true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', ONBOARDING_CHECKLIST_HIDDEN_KEY] }),
  })

  if (!currentProductionId) return null
  // Wait for the saved preference so the card does not flash for people who hid it.
  if (hiddenQuery.isPending || hiddenQuery.data === true) return null

  if (allDone) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        You&apos;re set up.
      </p>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Get started</CardTitle>
          <p className="text-sm text-muted-foreground" data-testid="checklist-progress">
            {doneCount} of {total} done
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => hideMutation.mutate()}>
          Hide
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1" aria-label="Getting started checklist">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={item.to}
                className="flex items-start gap-3 rounded-md p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Done" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not done" />
                )}
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      item.done && 'text-muted-foreground line-through',
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
