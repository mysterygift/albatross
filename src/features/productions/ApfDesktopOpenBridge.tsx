import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useQueryClient } from '@tanstack/react-query'

import { useCurrentProduction } from '@/features/productions/context'
import { runApfImportWithUiFollowUp } from '@/features/productions/apfImportFlow'
import { userMessageForImportFailure } from '@/lib/importExport'

type ApfOpenPayload = { paths: string[] }

/**
 * Cold-start argv queue + `apf-open-request` (single-instance handoff).
 * Auto-imports the first `.apf` using the same importer as the Productions page.
 */
export function ApfDesktopOpenBridge() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setCurrentProductionId, refetchProductions } = useCurrentProduction()
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [phase, setPhase] = useState<'idle' | 'importing'>('idle')
  const lastHandledRef = useRef<{ path: string; t: number } | null>(null)
  const inFlightRef = useRef(false)

  const persistShowArchived = (value: boolean) => {
    try {
      localStorage.setItem('showArchivedProductions', String(value))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    async function processPath(rawPath: string) {
      const path = rawPath.trim()
      if (!path.toLowerCase().endsWith('.apf')) return

      const now = Date.now()
      const last = lastHandledRef.current
      if (last && last.path === path && now - last.t < 2500) return
      lastHandledRef.current = { path, t: now }

      if (inFlightRef.current) return
      inFlightRef.current = true
      setPhase('importing')
      setBanner(null)
      navigate('/productions')

      try {
        const outcome = await runApfImportWithUiFollowUp(path, {
          queryClient,
          refetchProductions,
          setCurrentProductionId,
          persistShowArchived,
        })
        if (cancelled) return
        if (outcome.kind === 'error') {
          setBanner({ type: 'error', message: outcome.message })
        } else {
          if (outcome.revealArchivedInList) {
            window.dispatchEvent(new Event('albatross-reveal-archived-productions'))
          }
          setBanner({ type: 'success', message: outcome.message })
        }
      } catch (e) {
        if (!cancelled) {
          setBanner({ type: 'error', message: userMessageForImportFailure(e) })
        }
      } finally {
        inFlightRef.current = false
        if (!cancelled) setPhase('idle')
      }
    }

    async function boot() {
      try {
        const pending = await invoke<string[]>('pop_pending_apf_open_paths')
        if (!cancelled && pending[0]) {
          await processPath(pending[0])
        }
      } catch {
        /* not running under Tauri */
      }

      try {
        unlisten = await listen<ApfOpenPayload>('apf-open-request', (event) => {
          const p = event.payload.paths[0]
          if (p) void processPath(p)
        })
      } catch {
        /* not running under Tauri */
      }
    }

    void boot()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [navigate, queryClient, refetchProductions, setCurrentProductionId])

  useEffect(() => {
    if (!banner) return
    const ms = banner.type === 'error' ? 8000 : 9000
    const t = setTimeout(() => setBanner(null), ms)
    return () => clearTimeout(t)
  }, [banner])

  if (!banner && phase === 'idle') return null

  return (
    <div
      role="status"
      className={
        phase === 'importing'
          ? 'fixed top-4 left-1/2 z-[100] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg'
          : banner?.type === 'success'
            ? 'fixed top-4 left-1/2 z-[100] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-sm text-mint-700 shadow-lg dark:text-mint-400'
            : 'fixed top-4 left-1/2 z-[100] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 shadow-lg dark:text-red-400'
      }
    >
      {phase === 'importing' ? (
        <span>Importing project file…</span>
      ) : banner ? (
        banner.message
      ) : null}
    </div>
  )
}
