import { useSyncExternalStore } from 'react'

import {
  getSetupWorkspaceHandoffSnapshot,
  subscribeSetupWorkspaceHandoff,
} from '@/lib/auth/setupWorkspaceHandoff'

export function useSetupWorkspaceHandoff() {
  return useSyncExternalStore(
    subscribeSetupWorkspaceHandoff,
    getSetupWorkspaceHandoffSnapshot,
    getSetupWorkspaceHandoffSnapshot
  )
}
