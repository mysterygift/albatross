export type PublishImportErrorKind =
  | 'validation'
  | 'missing_assets'
  | 'type_conversion'
  | 'constraint'
  | 'storage'
  | 'acl'

export class PublishImportError extends Error {
  readonly kind: PublishImportErrorKind

  constructor(kind: PublishImportErrorKind, message: string) {
    super(message)
    this.name = 'PublishImportError'
    this.kind = kind
  }
}
