/** True when running inside the Tauri webview (IPC / SQLite available). False in a normal browser tab. */
export function isTauriWebview(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
