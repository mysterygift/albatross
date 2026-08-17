/** Settings key: `'true'` enables collaboration traffic and its management UI on this device. */
export const LOCAL_COLLABORATION_ENABLED_KEY = 'local_collaboration_enabled'

/** Previous beta key, retained only for the one-time settings migration. */
export const LEGACY_SERVER_PUBLISH_ENABLED_KEY = 'feature_server_publish_enabled'

/** @deprecated Legacy beta direct-runtime flag; never use it for sync-v2 enablement. */
export const FEATURE_SERVER_PUBLISH_ENABLED_KEY = LEGACY_SERVER_PUBLISH_ENABLED_KEY

/** Stored session token for a server connection (never log this value). */
export function serverSessionTokenSettingKey(connectionId: string): string {
  return `server_session_token:${connectionId}`
}

/** Stable client id for unlink / presence (per device install). */
export const SERVER_CLIENT_ID_KEY = 'server_client_install_id'
