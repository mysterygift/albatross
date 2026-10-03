import { useQuery } from '@tanstack/react-query'
import { listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import { listCast } from '@/lib/db/repositories/person'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listBudgetItemsByProduction } from '@/lib/db/repositories/budget'

export type ChecklistCounts = {
  script: number | null
  cast: number | null
  shootDays: number | null
  budget: number | null
}

export type ChecklistItem = {
  id: 'production' | 'script' | 'cast' | 'shoot-day' | 'budget'
  label: string
  description: string
  to: string
  done: boolean
  loading: boolean
}

export type ChecklistState = {
  items: ChecklistItem[]
  doneCount: number
  total: number
  allDone: boolean
}

/** `null` count = still loading; errors are passed as 0 by the caller (not done, not loading). */
export function deriveChecklist(counts: ChecklistCounts): ChecklistState {
  const flag = (n: number | null) => ({ done: n !== null && n > 0, loading: n === null })
  const items: ChecklistItem[] = [
    {
      id: 'production',
      label: 'Create a production',
      description: 'Your production is set up.',
      to: '/productions',
      done: true,
      loading: false,
    },
    {
      id: 'script',
      label: 'Import a script',
      description: 'Bring in your script to break it down into scenes.',
      to: '/schedule/script-import',
      ...flag(counts.script),
    },
    {
      id: 'cast',
      label: 'Add cast',
      description: 'Add the people who appear on screen.',
      to: '/people/cast-manager',
      ...flag(counts.cast),
    },
    {
      id: 'shoot-day',
      label: 'Build a shoot day',
      description: 'Plan a day on the stripboard.',
      to: '/schedule/stripboard',
      ...flag(counts.shootDays),
    },
    {
      id: 'budget',
      label: 'Set a budget',
      description: 'Add your first budget lines.',
      to: '/budget',
      ...flag(counts.budget),
    },
  ]
  const doneCount = items.filter((i) => i.done).length
  return { items, doneCount, total: items.length, allDone: doneCount === items.length }
}

export function useOnboardingChecklist(
  productionId: string | null | undefined,
  revisionId: string | null | undefined,
): ChecklistState {
  const pid = productionId ?? ''
  const enabled = !!productionId

  const script = useQuery({
    queryKey: ['script-versions', productionId],
    queryFn: () => listScriptVersionsByProduction(pid),
    enabled,
  })
  const cast = useQuery({
    queryKey: ['cast', productionId],
    queryFn: () => listCast(pid),
    enabled,
    retry: false,
  })
  const shootDays = useQuery({
    queryKey: ['shoot-days', productionId],
    queryFn: () => listShootDaysByProduction(pid),
    enabled,
  })
  const budget = useQuery({
    queryKey: ['budget-items', productionId, revisionId],
    queryFn: () => listBudgetItemsByProduction(pid, { revisionId: revisionId ?? undefined }),
    enabled: enabled && !!revisionId,
  })

  const count = (q: { data?: unknown[]; isError: boolean }) => {
    if (q.isError) return 0
    return q.data ? q.data.length : null
  }

  return deriveChecklist({
    script: count(script),
    cast: count(cast),
    shootDays: count(shootDays),
    budget: count(budget),
  })
}
