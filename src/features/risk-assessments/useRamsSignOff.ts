import { useQuery } from '@tanstack/react-query'
import { listRiskAssessmentsByShootDay } from '@/lib/db/repositories/risk-assessments'
import { getRamsSignOffStatus, type RamsSignOffStatus } from '@/lib/risk-assessments/ramsSignOff'
import { RAMS_QUERY_KEY } from '@/features/risk-assessments/ramsForm'

/**
 * RAMS sign-off status for a shoot day / unit, or `null` while unknown (not loaded, errored, or no day).
 * Unknown never warns: the call sheet gate only fires on a definite answer.
 */
export function useRamsSignOff(
  shootDayId: string | null,
  shootDayUnitId: string | null
): RamsSignOffStatus | null {
  const { data } = useQuery({
    queryKey: [RAMS_QUERY_KEY, 'by-day', shootDayId],
    queryFn: () => listRiskAssessmentsByShootDay(shootDayId!),
    enabled: !!shootDayId,
  })
  if (!shootDayId || !data) return null
  return getRamsSignOffStatus(data, shootDayUnitId)
}
