import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { pickApfFileForImport, pickApfSavePath } from '@/lib/files'
import {
  exportProductionAsApf,
  exportProductionAsApfForActor,
  userMessageForExportFailure,
  userMessageForImportFailure,
} from '@/lib/importExport'
import { runApfImportWithUiFollowUp } from '@/features/productions/apfImportFlow'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'

export type ApfActionMessage = { type: 'success' | 'error'; message: string; timeoutMs: number }

type UseApfActionsOptions = {
  onMessage?: (message: ApfActionMessage) => void
}

export function useApfActions(options: UseApfActionsOptions = {}) {
  const { onMessage } = options
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const { currentProduction, setCurrentProductionId, refetchProductions } = useCurrentProduction()
  const [apfBusy, setApfBusy] = useState<'export' | 'import' | null>(null)

  const persistShowArchived = (value: boolean) => {
    try {
      localStorage.setItem('showArchivedProductions', String(value))
    } catch {
      /* ignore */
    }
  }

  const notify = (type: 'success' | 'error', message: string, timeoutMs: number) => {
    onMessage?.({ type, message, timeoutMs })
  }

  async function handleImportApf() {
    if (apfBusy) return
    setApfBusy('import')
    try {
      const path = await pickApfFileForImport()
      if (path == null) return
      const outcome = await runApfImportWithUiFollowUp(path, {
        queryClient,
        refetchProductions,
        setCurrentProductionId,
        persistShowArchived,
      })
      if (outcome.kind === 'error') {
        notify('error', outcome.message, 6000)
        return
      }
      if (outcome.revealArchivedInList) {
        window.dispatchEvent(new Event('albatross-reveal-archived-productions'))
      }
      notify('success', outcome.message, 8000)
    } catch (e) {
      notify('error', userMessageForImportFailure(e), 6000)
    } finally {
      setApfBusy(null)
    }
  }

  async function handleExportApf() {
    if (!currentProduction) {
      notify('error', 'Choose a current production from the app header to export.', 5000)
      return
    }
    if (apfBusy) return
    setApfBusy('export')
    try {
      const path = await pickApfSavePath(currentProduction.name)
      if (path == null) return
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await exportProductionAsApfForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProduction.id,
          outputPath: path,
        })
      } else {
        await exportProductionAsApf(currentProduction.id, path)
      }
      const baseName = path.split(/[/\\]/).pop() ?? 'file.apf'
      notify('success', `Project exported as "${baseName}".`, 5000)
    } catch (e) {
      notify('error', userMessageForExportFailure(e), 6000)
    } finally {
      setApfBusy(null)
    }
  }

  return {
    apfBusy,
    handleImportApf,
    handleExportApf,
  }
}
