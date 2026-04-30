import { getSetting } from '@/lib/db/repositories/settings'
import { FEATURE_SERVER_PUBLISH_ENABLED_KEY, serverSessionTokenSettingKey } from '@/lib/server/constants'
import { getLinkedProjectByProductionId } from '@/lib/server/linkedProjectRepository'
import { getServerConnectionById } from '@/lib/server/serverConnectionRepository'
import type { LinkState } from '@/lib/server/types'

export type EffectiveDataSource = 'local_sqlite' | 'remote_server'

export async function isServerPublishFeatureEnabled(): Promise<boolean> {
  const v = await getSetting(FEATURE_SERVER_PUBLISH_ENABLED_KEY)
  return v === 'true'
}

function usesRemoteRuntime(linkState: LinkState | undefined): boolean {
  if (!linkState) return false
  return linkState === 'linked' || linkState === 'offline' || linkState === 'conflict'
}

export async function getEffectiveDataSourceForProduction(productionId: string): Promise<EffectiveDataSource> {
  const linked = await getLinkedProjectByProductionId(productionId)
  if (linked && usesRemoteRuntime(linked.link_state)) return 'remote_server'
  return 'local_sqlite'
}

export type ServerPublishContext = {
  productionId: string
  connectionId: string
  baseUrl: string
  token: string
  remoteProjectId: string
  linkState: LinkState
}

/** Resolves connection + bearer token for a linked production. Returns null if not linked or token missing. */
export async function resolveServerPublishContext(
  productionId: string,
): Promise<ServerPublishContext | null> {
  const linked = await getLinkedProjectByProductionId(productionId)
  if (!linked || !usesRemoteRuntime(linked.link_state)) return null
  const conn = await getServerConnectionById(linked.connection_id)
  if (!conn) return null
  const token = await getSetting(serverSessionTokenSettingKey(linked.connection_id))
  if (!token) return null
  return {
    productionId,
    connectionId: linked.connection_id,
    baseUrl: conn.base_url,
    token,
    remoteProjectId: linked.remote_project_id,
    linkState: linked.link_state,
  }
}

export function tanstackDataSourceKey(productionId: string | null | undefined, source: EffectiveDataSource): unknown[] {
  return ['ds', source, productionId ?? 'none']
}
