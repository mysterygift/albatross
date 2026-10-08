import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  RELEASE_FORM_SETTINGS_QUERY_KEY,
  getReleaseFormSettings,
  saveReleaseFormSettings,
  type ReleaseFormSettings,
} from '@/lib/releaseForms/settings'

export function useReleaseFormSettings() {
  return useQuery({
    queryKey: RELEASE_FORM_SETTINGS_QUERY_KEY,
    queryFn: getReleaseFormSettings,
  })
}

export function useSaveReleaseFormSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: ReleaseFormSettings) => saveReleaseFormSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RELEASE_FORM_SETTINGS_QUERY_KEY }),
  })
}
