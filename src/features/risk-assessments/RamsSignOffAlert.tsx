import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { describeRamsSignOff, type RamsSignOffStatus } from '@/lib/risk-assessments/ramsSignOff'

/** Inline call sheet warning when the day's RAMS is missing or not signed off. */
export function RamsSignOffAlert({
  status,
  unitName,
}: {
  status: RamsSignOffStatus | null
  unitName: string
}) {
  const copy = status ? describeRamsSignOff(status, unitName) : null
  if (!copy) return null
  return (
    <Alert variant="destructive" className="py-2" data-testid="rams-signoff-alert">
      <ShieldAlert className="size-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        {copy.detail}{' '}
        <Link to="/risk-assessments" className="underline underline-offset-2">
          Open risk assessments
        </Link>
        .
      </AlertDescription>
    </Alert>
  )
}
