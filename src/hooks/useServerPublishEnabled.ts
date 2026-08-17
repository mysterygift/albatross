import { useQuery } from '@tanstack/react-query'

import {
  LEGACY_SERVER_PUBLISH_ENABLED_KEY,
  LOCAL_COLLABORATION_ENABLED_KEY,
} from '@/lib/server/constants'
import { ensureSettingsDefaults, getSetting } from '@/lib/db/repositories/settings'

export function useServerPublishEnabled() {
  return useQuery({
    queryKey: ['settings', LOCAL_COLLABORATION_ENABLED_KEY],
    queryFn: async () => {
      await ensureSettingsDefaults()
      return (await getSetting(LOCAL_COLLABORATION_ENABLED_KEY)) === 'true'
    },
    staleTime: 10_000,
  })
}

/** Preferred name; the legacy export remains while beta call sites are migrated. */
export const useLocalCollaborationEnabled = useServerPublishEnabled

/** Temporary beta compatibility gate. Requires global collaboration to be on as well. */
export function useLegacyServerPublishEnabled() {
  return useQuery({
    queryKey: ['settings', 'legacy-server-runtime-enabled'],
    queryFn: async () => {
      await ensureSettingsDefaults()
      const [collaboration, legacy] = await Promise.all([
        getSetting(LOCAL_COLLABORATION_ENABLED_KEY),
        getSetting(LEGACY_SERVER_PUBLISH_ENABLED_KEY),
      ])
      return collaboration === 'true' && legacy === 'true'
    },
    staleTime: 10_000,
  })
}
