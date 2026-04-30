function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

/** SHA-256 hex digest; Web Crypto (works in Tauri webview and browser). */
export async function hashSessionToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const out = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < out.length; i++) {
    hex += out[i]!.toString(16).padStart(2, '0')
  }
  return hex
}
