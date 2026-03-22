/** Base error for .apf parse / validate / migrate failures. */
export class ApfError extends Error {
  code: ApfErrorCode

  constructor(message: string, code: ApfErrorCode) {
    super(message)
    this.name = 'ApfError'
    this.code = code
  }
}

export type ApfErrorCode =
  | 'UNSUPPORTED_FORMAT_VERSION'
  | 'UNKNOWN_OR_UNSUPPORTED_FORMAT_VERSION'
  | 'INVALID_MANIFEST'
  | 'INVALID_DATA'
  | 'ARCHIVE_LAYOUT'
  | 'NOT_ZIP_PAYLOAD'
  | 'MIGRATION_MISSING'
  | 'MIGRATION_FAILED'
  | 'ZIP_CORRUPT'
  | 'IMPORT_CONFLICT'
  | 'IMPORT_PREFLIGHT'
  | 'IMPORT_IO'
  | 'IMPORT_DB'

/** File formatVersion is greater than APF_MAX_SUPPORTED_FORMAT_VERSION — refuse entirely. */
export class ApfUnsupportedFormatVersionError extends ApfError {
  fileFormatVersion: number
  maxSupported: number

  constructor(fileFormatVersion: number, maxSupported: number) {
    super(
      `This project file requires a newer Albatross (formatVersion ${fileFormatVersion}; this app supports up to ${maxSupported}).`,
      'UNSUPPORTED_FORMAT_VERSION'
    )
    this.name = 'ApfUnsupportedFormatVersionError'
    this.fileFormatVersion = fileFormatVersion
    this.maxSupported = maxSupported
  }
}

/** formatVersion is below APF_MIN_SUPPORTED_FORMAT_VERSION or not migratable. */
export class ApfUnknownFormatVersionError extends ApfError {
  fileFormatVersion: number

  constructor(fileFormatVersion: number) {
    super(
      `This project file format (formatVersion ${fileFormatVersion}) is not supported by this version of Albatross.`,
      'UNKNOWN_OR_UNSUPPORTED_FORMAT_VERSION'
    )
    this.name = 'ApfUnknownFormatVersionError'
    this.fileFormatVersion = fileFormatVersion
  }
}

export class ApfInvalidManifestError extends ApfError {
  constructor(message: string) {
    super(message, 'INVALID_MANIFEST')
    this.name = 'ApfInvalidManifestError'
  }
}

export class ApfInvalidDataError extends ApfError {
  constructor(message: string) {
    super(message, 'INVALID_DATA')
    this.name = 'ApfInvalidDataError'
  }
}

export class ApfArchiveLayoutError extends ApfError {
  constructor(message: string) {
    super(message, 'ARCHIVE_LAYOUT')
    this.name = 'ApfArchiveLayoutError'
  }
}

export class ApfNotZipPayloadError extends ApfError {
  constructor() {
    super('File is not a ZIP archive (invalid or missing ZIP magic bytes).', 'NOT_ZIP_PAYLOAD')
    this.name = 'ApfNotZipPayloadError'
  }
}

export class ApfMigrationError extends ApfError {
  constructor(
    message: string,
    code: 'MIGRATION_MISSING' | 'MIGRATION_FAILED' = 'MIGRATION_FAILED'
  ) {
    super(message, code)
    this.name = 'ApfMigrationError'
  }
}

/** Export pipeline failure (I/O, validation, missing production). */
export class ApfExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApfExportError'
  }
}

/** ZIP bytes are corrupt or not a readable archive. */
export class ApfZipCorruptError extends ApfError {
  constructor(message: string) {
    super(message, 'ZIP_CORRUPT')
    this.name = 'ApfZipCorruptError'
  }
}

/** Import blocked by existing production id or slug (no merge / overwrite in v1). */
export class ApfImportConflictError extends ApfError {
  readonly conflict: 'production_id' | 'slug'

  constructor(conflict: 'production_id' | 'slug', message: string) {
    super(message, 'IMPORT_CONFLICT')
    this.name = 'ApfImportConflictError'
    this.conflict = conflict
  }
}

/** Payload / consistency checks failed before DB write. */
export class ApfImportPreflightError extends ApfError {
  constructor(message: string) {
    super(message, 'IMPORT_PREFLIGHT')
    this.name = 'ApfImportPreflightError'
  }
}

/** Read/write failure during import (e.g. attachment extraction). */
export class ApfImportIoError extends ApfError {
  constructor(message: string) {
    super(message, 'IMPORT_IO')
    this.name = 'ApfImportIoError'
  }
}

/** SQLite batch import failed (constraint, FK, or driver error). */
export class ApfImportDbError extends ApfError {
  constructor(message: string) {
    super(message, 'IMPORT_DB')
    this.name = 'ApfImportDbError'
  }
}
