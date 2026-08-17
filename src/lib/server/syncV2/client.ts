import {
  parseAckResponse,
  parsePullChangesResponse,
  parsePushMutationRequest,
  parsePushMutationResponse,
  parseSnapshotMetadata,
  parseSyncV2Discovery,
  syncV2ErrorBodySchema,
} from '@/lib/server/syncV2/codecs'
import { encodeSyncCursor } from '@/lib/server/syncV2/cursor'
import type {
  AckRequest,
  AckResponse,
  PullChangesResponse,
  PushMutationRequest,
  PushMutationResponse,
  SnapshotMetadata,
  SyncV2Compatibility,
  SyncV2CompatibilityRequirements,
  SyncV2Discovery,
  SyncV2ErrorBody,
  SyncV2ErrorCode,
} from '@/lib/server/syncV2/types'

export type SyncV2TransportRequest = {
  method: 'GET' | 'POST'
  url: string
  headers: Record<string, string>
  body?: unknown
}

export type SyncV2TransportResponse = {
  status: number
  body: unknown
  headers?: Record<string, string>
}

export type SyncV2Transport = {
  request(request: SyncV2TransportRequest): Promise<SyncV2TransportResponse>
}

export class SyncV2RequestError extends Error {
  readonly status: number | null
  readonly code: SyncV2ErrorCode | 'network_error' | 'invalid_response'
  readonly retryable: boolean
  readonly requestId: string | null
  readonly details: SyncV2ErrorBody['error']['details']

  constructor(options: {
    message: string
    status: number | null
    code: SyncV2RequestError['code']
    retryable: boolean
    requestId?: string | null
    details?: SyncV2RequestError['details']
  }) {
    super(options.message)
    this.name = 'SyncV2RequestError'
    this.status = options.status
    this.code = options.code
    this.retryable = options.retryable
    this.requestId = options.requestId ?? null
    this.details = options.details ?? null
  }
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('Server URL must start with http:// or https://')
  }
  return normalized
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export function createFetchSyncV2Transport(fetchImplementation: typeof fetch = fetch): SyncV2Transport {
  return {
    async request(request) {
      let response: Response
      try {
        response = await fetchImplementation(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
        })
      } catch (error) {
        throw new SyncV2RequestError({
          message: error instanceof Error ? error.message : 'Network error',
          status: null,
          code: 'network_error',
          retryable: true,
        })
      }

      return {
        status: response.status,
        body: await responseBody(response),
        headers: Object.fromEntries(response.headers.entries()),
      }
    },
  }
}

export function checkSyncV2Compatibility(
  discovery: SyncV2Discovery,
  requirements: SyncV2CompatibilityRequirements,
): SyncV2Compatibility {
  const reasons: Exclude<SyncV2Compatibility, { compatible: true }>['reasons'] = []
  if (!discovery.apiVersions.includes(requirements.protocolVersion)) reasons.push('protocol_version')
  if (discovery.schemaVersion !== requirements.schemaVersion) reasons.push('schema_version')
  if (discovery.registryHash !== requirements.registryHash) reasons.push('registry_hash')
  for (const capability of requirements.requiredCapabilities ?? []) {
    if (!discovery.capabilities.includes(capability)) reasons.push(`missing_capability:${capability}`)
  }
  return reasons.length === 0 ? { compatible: true } : { compatible: false, reasons }
}

export type SyncV2ClientOptions = {
  baseUrl: string
  token?: string | null
  transport?: SyncV2Transport
}

export class SyncV2Client {
  private readonly baseUrl: string
  private readonly token: string | null
  private readonly transport: SyncV2Transport

  constructor(options: SyncV2ClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.token = options.token ?? null
    this.transport = options.transport ?? createFetchSyncV2Transport()
  }

  async discover(): Promise<SyncV2Discovery> {
    const body = await this.request('GET', '/.well-known/albatross', undefined, false)
    return this.parseResponse(() => parseSyncV2Discovery(body))
  }

  /** Requests the JSON descriptor for the consistent snapshot, not the package bytes. */
  async getSnapshotMetadata(projectId: string): Promise<SnapshotMetadata> {
    const path = `${this.syncPath(projectId)}/snapshot`
    const body = await this.request(
      'GET',
      path,
      undefined,
      true,
      'application/vnd.albatross.sync-snapshot-metadata+json',
    )
    return this.parseResponse(() => {
      const parsed = parseSnapshotMetadata(body)
      if (parsed.projectId !== projectId) throw new Error('Snapshot response project does not match the request.')
      return parsed
    })
  }

  async pull(projectId: string, after: PullChangesResponse['after'], limit?: number): Promise<PullChangesResponse> {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) {
      throw new Error('Pull limit must be a positive safe integer.')
    }
    const query = new URLSearchParams({ after: encodeSyncCursor(after) })
    if (limit !== undefined) query.set('limit', String(limit))
    const body = await this.request('GET', `${this.syncPath(projectId)}/changes?${query.toString()}`)
    return this.parseResponse(() => {
      const parsed = parsePullChangesResponse(body)
      if (parsed.projectId !== projectId) throw new Error('Pull response project does not match the request.')
      if (
        parsed.after.epoch !== after.epoch
        || parsed.after.sequence !== after.sequence
      ) throw new Error('Pull response cursor does not match the requested cursor.')
      return parsed
    })
  }

  async push(projectId: string, mutation: PushMutationRequest): Promise<PushMutationResponse> {
    const validated = this.parseResponse(() => parsePushMutationRequest({
      ...mutation,
      baseCursor: encodeSyncCursor(mutation.baseCursor),
    }))
    const wireBody = { ...validated, baseCursor: encodeSyncCursor(validated.baseCursor) }
    const body = await this.request('POST', `${this.syncPath(projectId)}/mutations`, wireBody)
    return this.parseResponse(() => {
      const parsed = parsePushMutationResponse(body)
      if (parsed.mutationId !== mutation.mutationId) {
        throw new Error('Push response mutation does not match the request.')
      }
      if (parsed.batch.clientId !== mutation.clientId) {
        throw new Error('Push response client does not match the request.')
      }
      if (parsed.committedCursor.epoch !== mutation.baseCursor.epoch) {
        throw new Error('Push response epoch does not match the request.')
      }
      return parsed
    })
  }

  async acknowledge(projectId: string, acknowledgement: AckRequest): Promise<AckResponse> {
    if (!acknowledgement.clientId.trim()) throw new Error('Client ID is required.')
    const body = await this.request('POST', `${this.syncPath(projectId)}/ack`, {
      ...acknowledgement,
      appliedCursor: encodeSyncCursor(acknowledgement.appliedCursor),
    })
    return this.parseResponse(() => {
      const parsed = parseAckResponse(body)
      if (
        parsed.acknowledgedCursor.epoch !== acknowledgement.appliedCursor.epoch
        || parsed.acknowledgedCursor.sequence !== acknowledgement.appliedCursor.sequence
      ) throw new Error('Acknowledged cursor does not match the request.')
      return parsed
    })
  }

  private syncPath(projectId: string): string {
    if (!projectId.trim()) throw new Error('Project ID is required.')
    return `/v2/projects/${encodeURIComponent(projectId)}/sync`
  }

  private async request(
    method: SyncV2TransportRequest['method'],
    path: string,
    body?: unknown,
    authenticated = true,
    accept = 'application/json',
  ): Promise<unknown> {
    const headers: Record<string, string> = { Accept: accept }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (authenticated && this.token) headers.Authorization = `Bearer ${this.token}`

    let response: SyncV2TransportResponse
    try {
      response = await this.transport.request({
        method,
        url: `${this.baseUrl}${path}`,
        headers,
        body,
      })
    } catch (error) {
      if (error instanceof SyncV2RequestError) throw error
      throw new SyncV2RequestError({
        message: error instanceof Error ? error.message : 'Network error',
        status: null,
        code: 'network_error',
        retryable: true,
      })
    }

    if (response.status >= 200 && response.status < 300) return response.body

    const structured = syncV2ErrorBodySchema.safeParse(response.body)
    if (structured.success) {
      throw new SyncV2RequestError({
        message: structured.data.error.message,
        status: response.status,
        code: structured.data.error.code,
        retryable: structured.data.error.retryable,
        requestId: structured.data.error.requestId,
        details: structured.data.error.details,
      })
    }
    throw new SyncV2RequestError({
      message: `Sync server returned HTTP ${response.status}`,
      status: response.status,
      code: 'invalid_response',
      retryable: response.status >= 500,
    })
  }

  private parseResponse<T>(parse: () => T): T {
    try {
      return parse()
    } catch (error) {
      if (error instanceof SyncV2RequestError) throw error
      throw new SyncV2RequestError({
        message: error instanceof Error ? error.message : 'Invalid sync-v2 response',
        status: null,
        code: 'invalid_response',
        retryable: false,
      })
    }
  }
}
