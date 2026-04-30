import { useQuery } from '@tanstack/react-query'

import { getSetting } from '@/lib/db/repositories/settings'
import { serverSessionTokenSettingKey } from '@/lib/server/constants'
import { getServerConnectionById } from '@/lib/server/serverConnectionRepository'
import { serverGetMe } from '@/lib/server/serverClient'

export function useServerSession(connectionId: string | null) {
  return useQuery({
    queryKey: ['server-session', connectionId],
    enabled: !!connectionId,
    queryFn: async () => {
      if (!connectionId) return null
      const conn = await getServerConnectionById(connectionId)
      if (!conn) return null
      const token = await getSetting(serverSessionTokenSettingKey(connectionId))
      if (!token) return { connection: conn, valid: false as const, me: null }
      try {
        const me = await serverGetMe(conn.base_url, token)
        return { connection: conn, valid: true as const, me }
      } catch {
        return { connection: conn, valid: false as const, me: null }
      }
    },
  })
}
