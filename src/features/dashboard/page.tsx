import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { listChecklistByProduction } from '@/lib/db/repositories/checklist'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2, Clapperboard } from 'lucide-react'

export function DashboardPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentProduction, currentProductionId } = useCurrentProduction()
  const wrapSuccess = (location.state as { wrapSuccess?: boolean } | null)?.wrapSuccess === true
  const { data: checklist = [] } = useQuery({
    queryKey: ['checklist', currentProductionId],
    queryFn: () => listChecklistByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const complete = checklist.filter((c) => c.status === 'complete').length
  const total = checklist.length
  const required = checklist.filter((c) => c.is_required === 1)
  const requiredComplete = required.filter((c) => c.status === 'complete').length
  const score = total === 0 ? 100 : Math.round((complete / total) * 100)
  const requiredScore = required.length === 0 ? 100 : Math.round((requiredComplete / required.length) * 100)
  const warnings = checklist.filter((c) => c.is_required === 1 && c.status !== 'complete')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            {currentProduction
              ? `${currentProduction.name} — production overview`
              : 'Select a production to see the dashboard.'}
          </p>
        </div>
        {currentProductionId && (
          <Button variant="destructive" asChild>
            <Link to="/wrap-production" className="inline-flex items-center gap-2">
              <Clapperboard className="size-4" />
              Wrap Production
            </Link>
          </Button>
        )}
      </div>

      {wrapSuccess && (
        <Alert className="border-green-600/50 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle>Production completed and archived.</AlertTitle>
          <AlertDescription>
            The production has been wrapped and archived. You can view it in Productions with
            “Show archived” enabled.
          </AlertDescription>
          <button
            type="button"
            onClick={() => navigate(location.pathname, { replace: true, state: {} })}
            className="text-muted-foreground mt-2 text-sm underline hover:no-underline"
          >
            Dismiss
          </button>
        </Alert>
      )}

      {!currentProductionId && !wrapSuccess && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No production selected</AlertTitle>
          <AlertDescription>
            Choose a production from the top bar or create one in Productions.
          </AlertDescription>
        </Alert>
      )}

      {currentProductionId && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Readiness score</CardTitle>
                <CardDescription>Overall checklist completion</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-bold">{score}%</span>
                  <Badge variant={score === 100 ? 'default' : 'secondary'}>
                    {complete} / {total} items
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Required items</CardTitle>
                <CardDescription>Must complete before production</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-bold">{requiredScore}%</span>
                  <Badge variant={requiredScore === 100 ? 'default' : 'destructive'}>
                    {requiredComplete} / {required.length} required
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {warnings.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Outstanding required items</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-inside list-disc">
                  {warnings.map((w) => (
                    <li key={w.id}>{w.title}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  )
}
