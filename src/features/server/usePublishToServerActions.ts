import { useCallback, useState } from 'react'

import { listServerConnections } from '@/lib/server/serverConnectionRepository'
import { useLegacyServerPublishEnabled } from '@/hooks/useServerPublishEnabled'

export function usePublishToServerActions() {
  const legacyPublishing = useLegacyServerPublishEnabled()
  const [connectOpen, setConnectOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [preflight, setPreflight] = useState<{
    productionId: string
    productionName: string
    connectionId: string
  } | null>(null)

  const beginPublish = useCallback(async (productionId: string, productionName: string) => {
    if (legacyPublishing.data !== true) return
    const conns = await listServerConnections()
    if (conns.length === 0) {
      setConnectOpen(true)
      return
    }
    const connectionId = conns[0]!.id
    setPreflight({ productionId, productionName, connectionId })
    setPreflightOpen(true)
  }, [legacyPublishing.data])

  return {
    connectOpen,
    setConnectOpen,
    preflightOpen,
    setPreflightOpen,
    preflight,
    setPreflight,
    beginPublish,
  }
}
