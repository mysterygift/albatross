export type ServerErrorKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'server'
  | 'unknown'

export class ServerRequestError extends Error {
  readonly kind: ServerErrorKind
  readonly status: number | null

  constructor(message: string, kind: ServerErrorKind, status: number | null = null) {
    super(message)
    this.name = 'ServerRequestError'
    this.kind = kind
    this.status = status
  }
}

export function classifyFetchError(status: number): ServerErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 409) return 'conflict'
  if (status >= 400 && status < 500) return 'validation'
  if (status >= 500) return 'server'
  return 'unknown'
}

export function userMessageForServerError(err: unknown): string {
  if (err instanceof ServerRequestError) {
    switch (err.kind) {
      case 'network':
        return 'Could not reach the server. Check your connection and URL.'
      case 'unauthorized':
        return 'Sign in failed or session expired. Please reconnect to the server.'
      case 'forbidden':
        return 'You do not have permission to perform this action on the server.'
      case 'conflict':
        return 'This record was changed by someone else. Reload to get the latest version.'
      default:
        return err.message || 'Server request failed.'
    }
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}
