import { presenceWebSocketUrl } from '@/lib/server/serverClient'

export type PresenceClientOptions = {
  baseUrl: string
  token: string
  remoteProjectId: string
  onCount?: (online: number) => void
  onError?: (message: string) => void
}

/**
 * Lightweight presence subscriber. Server should push JSON messages like `{ type: 'presence', online: number }`.
 * If the server uses a different protocol, adjust parsing here.
 */
export function subscribePresence(opts: PresenceClientOptions): () => void {
  const url = presenceWebSocketUrl(opts.baseUrl, opts.remoteProjectId, opts.token)
  let ws: WebSocket | null = null
  let closed = false
  try {
    ws = new WebSocket(url)
  } catch (e) {
    opts.onError?.(e instanceof Error ? e.message : 'WebSocket failed')
    return () => {}
  }

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(String(ev.data)) as { online?: number; count?: number }
      const n = data.online ?? data.count
      if (typeof n === 'number') opts.onCount?.(n)
    } catch {
      /* ignore */
    }
  }
  ws.onerror = () => {
    opts.onError?.('Presence connection error')
  }
  ws.onclose = () => {
    if (!closed) opts.onCount?.(0)
  }

  return () => {
    closed = true
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
  }
}
