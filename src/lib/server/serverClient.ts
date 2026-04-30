import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { SERVER_CLIENT_ID_KEY } from '@/lib/server/constants'
import { classifyFetchError, ServerRequestError } from '@/lib/server/serverErrors'
import type {
  PublishJobStatusResponse,
  ServerMeResponse,
  ServerProjectSummary,
} from '@/lib/server/types'
import { uuid } from '@/lib/db/client'

function normalizeBaseUrl(url: string): string {
  const t = url.trim().replace(/\/+$/, '')
  if (!t) throw new ServerRequestError('Server URL is required.', 'validation', null)
  if (!/^https?:\/\//i.test(t)) {
    throw new ServerRequestError('Server URL must start with http:// or https://', 'validation', null)
  }
  return t
}

async function getOrCreateClientInstallId(): Promise<string> {
  const existing = await getSetting(SERVER_CLIENT_ID_KEY)
  if (existing?.trim()) return existing.trim()
  const id = uuid()
  await setSetting(SERVER_CLIENT_ID_KEY, id)
  return id
}

export type ServerRequestInit = RequestInit & {
  token?: string | null
}

export async function serverFetchJson<T>(
  baseUrl: string,
  path: string,
  init: ServerRequestInit = {},
): Promise<T> {
  const offlineSim = await getSetting('dev_simulate_server_offline')
  if (offlineSim === 'true') {
    throw new ServerRequestError('Simulated offline (dev)', 'network', null)
  }

  const url = `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(init.headers)
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`)
  }
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  let res: Response
  try {
    res = await fetch(url, { ...init, headers })
  } catch {
    throw new ServerRequestError('Network error', 'network', null)
  }

  const text = await res.text()
  if (!res.ok) {
    const kind = classifyFetchError(res.status)
    let msg = `HTTP ${res.status}`
    try {
      const j = JSON.parse(text) as { message?: string; error?: string }
      msg = j.message ?? j.error ?? msg
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    throw new ServerRequestError(msg, kind, res.status)
  }
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ServerRequestError('Invalid JSON from server', 'server', res.status)
  }
}

export async function serverLogin(baseUrl: string, username: string, password: string): Promise<{ token: string }> {
  const body = await serverFetchJson<{ accessToken?: string; token?: string; sessionToken?: string }>(
    baseUrl,
    '/v1/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
  )
  const token = body.accessToken ?? body.token ?? body.sessionToken
  if (!token) throw new ServerRequestError('Login response missing token', 'server', null)
  return { token }
}

export async function serverGetMe(baseUrl: string, token: string): Promise<ServerMeResponse> {
  return serverFetchJson<ServerMeResponse>(baseUrl, '/v1/me', { token, method: 'GET' })
}

export async function serverListProjects(baseUrl: string, token: string): Promise<ServerProjectSummary[]> {
  const body = await serverFetchJson<{ projects?: ServerProjectSummary[] } | ServerProjectSummary[]>(
    baseUrl,
    '/v1/projects',
    { token, method: 'GET' },
  )
  if (Array.isArray(body)) return body
  return body.projects ?? []
}

export async function serverCreatePublishJob(
  baseUrl: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ id: string; uploadUrl?: string }> {
  return serverFetchJson(baseUrl, '/v1/publish/jobs', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function serverUploadPublishPackage(
  baseUrl: string,
  token: string,
  jobId: string,
  fileBytes: Uint8Array,
  fileName: string,
  onProgress?: (uploaded: number, total: number) => void,
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/publish/jobs/${encodeURIComponent(jobId)}/package`
  const blob = new Blob([fileBytes as BlobPart], { type: 'application/zip' })
  const form = new FormData()
  form.append('package', blob, fileName)

  onProgress?.(0, fileBytes.byteLength)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
  } catch {
    throw new ServerRequestError('Network error during upload', 'network', null)
  }

  onProgress?.(fileBytes.byteLength, fileBytes.byteLength)

  if (!res.ok) {
    const kind = classifyFetchError(res.status)
    const text = await res.text()
    throw new ServerRequestError(text || `Upload failed (${res.status})`, kind, res.status)
  }
}

export async function serverCommitPublishJob(
  baseUrl: string,
  token: string,
  jobId: string,
): Promise<PublishJobStatusResponse> {
  return serverFetchJson(baseUrl, `/v1/publish/jobs/${encodeURIComponent(jobId)}/commit`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}

export async function serverGetPublishJob(
  baseUrl: string,
  token: string,
  jobId: string,
): Promise<PublishJobStatusResponse> {
  return serverFetchJson(baseUrl, `/v1/publish/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    token,
  })
}

export async function serverUnlinkProject(
  baseUrl: string,
  token: string,
  remoteProjectId: string,
): Promise<void> {
  const clientId = await getOrCreateClientInstallId()
  const path = `/v1/projects/${encodeURIComponent(remoteProjectId)}/links/${encodeURIComponent(clientId)}`
  try {
    await serverFetchJson<unknown>(baseUrl, path, { method: 'DELETE', token })
  } catch (e) {
    if (e instanceof ServerRequestError && e.status === 404) return
    throw e
  }
}

/** Runtime REST: list entity rows for a project (server Phase 4 contract). */
export async function serverRuntimeList<T>(
  baseUrl: string,
  token: string,
  projectId: string,
  resource: 'scenes' | 'shoot_days' | 'shots' | 'budget_items' | 'expenses',
  query?: Record<string, string>,
): Promise<T[]> {
  const qs = query
    ? `?${new URLSearchParams(query).toString()}`
    : ''
  const path = `/v1/projects/${encodeURIComponent(projectId)}/${resource}${qs}`
  const body = await serverFetchJson<{ data?: T[] } | T[]>(baseUrl, path, { method: 'GET', token })
  if (Array.isArray(body)) return body
  return body.data ?? []
}

export async function serverRuntimeGetOne(
  baseUrl: string,
  token: string,
  projectId: string,
  resource: 'scenes' | 'shoot_days' | 'shots',
  entityId: string,
): Promise<Record<string, unknown> | null> {
  const path = `/v1/projects/${encodeURIComponent(projectId)}/${resource}/${encodeURIComponent(entityId)}`
  try {
    const body = await serverFetchJson<{ data?: Record<string, unknown> } | Record<string, unknown>>(
      baseUrl,
      path,
      { method: 'GET', token },
    )
    if ('data' in body && body.data) return body.data as Record<string, unknown>
    if (typeof body === 'object' && body !== null && 'id' in body) return body as Record<string, unknown>
    return null
  } catch (e) {
    if (e instanceof ServerRequestError && e.status === 404) return null
    throw e
  }
}

export async function serverRuntimeMutate(
  baseUrl: string,
  token: string,
  projectId: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  resource: string,
  entityId: string | null,
  body: unknown,
  ifMatch: string | null,
): Promise<Record<string, unknown>> {
  let path = `/v1/projects/${encodeURIComponent(projectId)}/${resource}`
  if (entityId) path += `/${encodeURIComponent(entityId)}`
  const headers: Record<string, string> = {}
  if (method !== 'DELETE') headers['Content-Type'] = 'application/json'
  if (ifMatch) headers['If-Match'] = ifMatch
  return serverFetchJson<Record<string, unknown>>(baseUrl, path, {
    method,
    token,
    headers,
    body: method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  })
}

export function presenceWebSocketUrl(baseUrl: string, projectId: string, token: string): string {
  const u = new URL(normalizeBaseUrl(baseUrl))
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = '/v1/presence'
  u.search = `project=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token)}`
  return u.toString()
}
