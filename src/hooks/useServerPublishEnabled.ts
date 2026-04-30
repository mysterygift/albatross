import { useQuery } from '@tanstack/react-query'

import { FEATURE_SERVER_PUBLISH_ENABLED_KEY } from '@/lib/server/constants'
import { getSetting } from '@/lib/db/repositories/settings'

export function useServerPublishEnabled() {
  return useQuery({
    queryKey: ['settings', FEATURE_SERVER_PUBLISH_ENABLED_KEY],
    queryFn: async () => (await getSetting(FEATURE_SERVER_PUBLISH_ENABLED_KEY)) === 'true',
    staleTime: 10_000,
  })
}
