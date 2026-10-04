import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listen } from '@tauri-apps/api/event'
import { toast } from '@/components/ui/sonner'
import { invoke } from '@tauri-apps/api/core'
import { useQueryClient } from '@tanstack/react-query'

import { useCurrentProduction } from '@/features/productions/context'
import { runApfImportWithUiFollowUp } from '@/features/productions/apfImportFlow'
import { userMessageForImportFailure } from '@/lib/importExport'

type ApfOpenPayload = { paths: string[] }

/**
 * Cold-start argv queue + `apf-open-request` (desktop single-instance handoff; iOS Files app,
 * share sheet and AirDrop via src-tauri/src/apf_ios.rs).
 * Auto-imports the first `.apf` using the same importer as the Productions page.
 */
export function ApfDesktopOpenBridge() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setCurrentProductionId, refetchProductions } = useCurrentProduction()
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
      navigate('/productions')

      try {
        // Not gated on `cancelled`: once a path has been popped from the queue nothing else will
        // import it, so finish the import and report it even if this effect has been torn down.
        const outcome = await runApfImportWithUiFollowUp(path, {
          queryClient,
          refetchProductions,
          setCurrentProductionId,
          persistShowArchived,
        })
        if (outcome.kind === 'error') {
          toast.error(outcome.message, { duration: 8000 })
        } else {
          if (outcome.revealArchivedInList) {
            window.dispatchEvent(new Event('albatross-reveal-archived-productions'))
          }
          toast.success(outcome.message, { duration: 9000 })
        }
      } catch (e) {
        toast.error(userMessageForImportFailure(e), { duration: 8000 })
      } finally {
        inFlightRef.current = false
        if (!cancelled) setPhase('idle')
      }
    }

    async function popPending(): Promise<string[]> {
      try {
        return await invoke<string[]>('pop_pending_apf_open_paths')
      } catch {
        return [] /* not running under Tauri */
      }
    }

    async function boot() {
      // Listen before draining the queue so a file opened in between is not missed.
      try {
        const off = await listen<ApfOpenPayload>('apf-open-request', async (event) => {
          if (cancelled) return
          // iOS also queues opened files (for cold start / the sign-in screen); drain the queue here
          // so they are not imported a second time on the next mount.
          const pending = await popPending()
          const p = pending[0] ?? event.payload.paths[0]
          if (p) void processPath(p)
        })
        if (cancelled) off()
        else unlisten = off
      } catch {
        /* not running under Tauri */
      }

      // A torn-down effect (StrictMode's double mount, or a dependency change) must not drain the
      // queue: the instance that replaces it does that.
      if (cancelled) return
      const pending = await popPending()
      if (pending[0]) {
        await processPath(pending[0])
      }
    }

    void boot()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [navigate, queryClient, refetchProductions, setCurrentProductionId])

  if (phase !== 'importing') return null

  return (
    <div
      role="status"
      // --safe-top is only set on iOS/Android (styles/platform-mobile.css); 0 on desktop.
      style={{ top: 'calc(1rem + var(--safe-top, 0px))' }}
      className="fixed left-1/2 z-[100] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg"
    >
      <span>Importing project file…</span>
    </div>
  )
}
