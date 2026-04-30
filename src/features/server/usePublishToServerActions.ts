import { useCallback, useState } from 'react'

import { listServerConnections } from '@/lib/server/serverConnectionRepository'

export function usePublishToServerActions() {
  const [connectOpen, setConnectOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [preflight, setPreflight] = useState<{
    productionId: string
    productionName: string
    connectionId: string
  } | null>(null)

  const beginPublish = useCallback(async (productionId: string, productionName: string) => {
    const conns = await listServerConnections()
    if (conns.length === 0) {
      setConnectOpen(true)
      return
    }
    const connectionId = conns[0]!.id
    setPreflight({ productionId, productionName, connectionId })
    setPreflightOpen(true)
  }, [])

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
