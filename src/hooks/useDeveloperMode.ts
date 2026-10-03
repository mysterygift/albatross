import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEVELOPER_MODE_SETTING_KEY,
  getSetting,
  setSetting,
} from '@/lib/db/repositories/settings'

/** Developer-mode flag persisted in the `settings` table (default off). */
export function useDeveloperMode() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['settings', DEVELOPER_MODE_SETTING_KEY],
    queryFn: async () => {
      try {
        return (await getSetting(DEVELOPER_MODE_SETTING_KEY)) === 'true'
      } catch {
        return false
      }
    },
  })

  const mutation = useMutation({
    mutationFn: (value: boolean) => setSetting(DEVELOPER_MODE_SETTING_KEY, value ? 'true' : 'false'),
    onMutate: (value) => {
      queryClient.setQueryData(['settings', DEVELOPER_MODE_SETTING_KEY], value)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['settings', DEVELOPER_MODE_SETTING_KEY] }),
  })

  const setDeveloperMode = useCallback((value: boolean) => mutation.mutate(value), [mutation])

  return { developerMode: data ?? false, setDeveloperMode }
}
