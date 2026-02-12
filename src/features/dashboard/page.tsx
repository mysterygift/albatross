import { useQuery } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { listChecklistByProduction } from '@/lib/db/repositories/checklist'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

export function DashboardPage() {
  const { currentProduction, currentProductionId } = useCurrentProduction()
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
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          {currentProduction
            ? `${currentProduction.name} — production overview`
            : 'Select a production to see the dashboard.'}
        </p>
      </div>

      {!currentProductionId && (
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
