/** Settings key: `'true'` enables server publish / collaboration UI. */
export const FEATURE_SERVER_PUBLISH_ENABLED_KEY = 'feature_server_publish_enabled'

/** Stored session token for a server connection (never log this value). */
export function serverSessionTokenSettingKey(connectionId: string): string {
  return `server_session_token:${connectionId}`
}

/** Stable client id for unlink / presence (per device install). */
export const SERVER_CLIENT_ID_KEY = 'server_client_install_id'
