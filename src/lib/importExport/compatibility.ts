import {
  APF_MAX_SUPPORTED_FORMAT_VERSION,
  APF_MIN_SUPPORTED_FORMAT_VERSION,
  CURRENT_APF_FORMAT_VERSION,
} from '@/lib/importExport/constants'
import { ApfUnknownFormatVersionError, ApfUnsupportedFormatVersionError } from '@/lib/importExport/errors'

export type ApfFormatCompatibility =
  | { status: 'supported_current' }
  | { status: 'supported_needs_migration'; fromVersion: number }
  | { status: 'unsupported_too_new'; fileVersion: number; maxSupported: number }
  | { status: 'unsupported_too_old'; fileVersion: number; minSupported: number }

/**
 * Classifies a manifest/data `formatVersion` for import gating (before DB work).
 * - `unsupported_too_new`: refuse import entirely (no partial apply).
 * - `unsupported_too_old`: below minimum supported (no migrator path).
 * - `supported_needs_migration`: in range but below CURRENT — run file-level migrations first.
 */
export function getApfFormatCompatibility(fileFormatVersion: number): ApfFormatCompatibility {
  if (fileFormatVersion > APF_MAX_SUPPORTED_FORMAT_VERSION) {
    return {
      status: 'unsupported_too_new',
      fileVersion: fileFormatVersion,
      maxSupported: APF_MAX_SUPPORTED_FORMAT_VERSION,
    }
  }
  if (fileFormatVersion < APF_MIN_SUPPORTED_FORMAT_VERSION) {
    return {
      status: 'unsupported_too_old',
      fileVersion: fileFormatVersion,
      minSupported: APF_MIN_SUPPORTED_FORMAT_VERSION,
    }
  }
  if (fileFormatVersion < CURRENT_APF_FORMAT_VERSION) {
    return { status: 'supported_needs_migration', fromVersion: fileFormatVersion }
  }
  return { status: 'supported_current' }
}

export function isApfFormatVersionTooNew(fileFormatVersion: number): boolean {
  return fileFormatVersion > APF_MAX_SUPPORTED_FORMAT_VERSION
}

export function isApfFormatVersionTooOld(fileFormatVersion: number): boolean {
  return fileFormatVersion < APF_MIN_SUPPORTED_FORMAT_VERSION
}

export function doesApfFormatRequireMigration(fileFormatVersion: number): boolean {
  return (
    fileFormatVersion >= APF_MIN_SUPPORTED_FORMAT_VERSION &&
    fileFormatVersion < CURRENT_APF_FORMAT_VERSION
  )
}

/** Throws if the file must not be imported by this build (too new or too old). */
export function assertApfImportableFormatVersion(fileFormatVersion: number): void {
  if (isApfFormatVersionTooNew(fileFormatVersion)) {
    throw new ApfUnsupportedFormatVersionError(fileFormatVersion, APF_MAX_SUPPORTED_FORMAT_VERSION)
  }
  if (isApfFormatVersionTooOld(fileFormatVersion)) {
    throw new ApfUnknownFormatVersionError(fileFormatVersion)
  }
}
