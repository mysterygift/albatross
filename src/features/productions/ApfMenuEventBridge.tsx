import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'

import { useApfActions, type ApfActionMessage } from '@/features/productions/useApfActions'

export function ApfMenuEventBridge() {
  const navigate = useNavigate()
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const { handleImportApf, handleExportApf } = useApfActions({
    onMessage: (msg: ApfActionMessage) => {
      setBanner({ type: msg.type, message: msg.message })
      window.setTimeout(() => setBanner(null), msg.timeoutMs)
    },
  })

  useEffect(() => {
    let unlistenImport: (() => void) | undefined
    let unlistenExport: (() => void) | undefined
    let unlistenNewProject: (() => void) | undefined
    let unlistenOpenSettings: (() => void) | undefined

    async function mount() {
      try {
        unlistenImport = await listen('albatross-menu-import-project', async () => {
          navigate('/productions')
          await handleImportApf()
        })
        unlistenExport = await listen('albatross-menu-export-project', async () => {
          navigate('/productions')
          await handleExportApf()
        })
        unlistenNewProject = await listen('albatross-menu-new-project', () => {
          navigate('/productions')
          window.dispatchEvent(new Event('albatross-open-new-production-dialog'))
        })
        unlistenOpenSettings = await listen('albatross-menu-open-settings', () => {
          navigate('/settings')
        })
      } catch {
        /* not running in tauri */
      }
    }

    void mount()
    return () => {
      unlistenImport?.()
      unlistenExport?.()
      unlistenNewProject?.()
      unlistenOpenSettings?.()
    }
  }, [handleExportApf, handleImportApf, navigate])

  if (!banner) return null

  return (
    <div
      role="status"
      className={
        banner.type === 'success'
          ? 'fixed top-4 left-1/2 z-[100] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-sm text-mint-700 shadow-lg dark:text-mint-400'
          : 'fixed top-4 left-1/2 z-[100] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 shadow-lg dark:text-red-400'
      }
    >
      {banner.message}
    </div>
  )
}
