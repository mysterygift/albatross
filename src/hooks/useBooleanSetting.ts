import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'

/**
 * A boolean flag persisted in the `settings` table as `'true'` / `'false'` (default off).
 * Reads that fail (e.g. the database is still locked) count as off.
 */
export function useBooleanSetting(key: string): [boolean, (value: boolean) => void] {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['settings', key],
    queryFn: async () => {
      try {
        return (await getSetting(key)) === 'true'
      } catch {
        return false
      }
    },
  })

  const mutation = useMutation({
    mutationFn: (value: boolean) => setSetting(key, value ? 'true' : 'false'),
    onMutate: (value) => {
      queryClient.setQueryData(['settings', key], value)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', key] }),
  })

  const { mutate } = mutation
  const setValue = useCallback((value: boolean) => mutate(value), [mutate])

  return [data ?? false, setValue]
}
