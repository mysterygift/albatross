import {
  ApfArchiveLayoutError,
  ApfError,
  ApfExportError,
  ApfImportConflictError,
  ApfImportDbError,
  ApfImportIoError,
  ApfImportPreflightError,
  ApfInvalidDataError,
  ApfInvalidManifestError,
  ApfMigrationError,
  ApfNotZipPayloadError,
  ApfUnknownFormatVersionError,
  ApfUnsupportedFormatVersionError,
  ApfZipCorruptError,
} from '@/lib/importExport/errors'
import type { ImportProductionSuccess } from '@/lib/importExport/importTypes'

export function userMessageForExportFailure(error: unknown): string {
  if (error instanceof ApfExportError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message || 'Export failed.'
  }
  return 'Export failed.'
}

export function userMessageForImportFailure(error: unknown): string {
  if (error instanceof ApfImportConflictError) {
    if (error.conflict === 'production_id') {
      return 'A production with this ID already exists in this library. Import was cancelled.'
    }
    return 'Another active production already uses this project’s slug. Import was cancelled.'
  }
  if (error instanceof ApfUnsupportedFormatVersionError) {
    return 'This project file was created by a newer version of Albatross. Update the app and try again.'
  }
  if (error instanceof ApfUnknownFormatVersionError) {
    return 'This project file uses an older format that this version of Albatross cannot import.'
  }
  if (error instanceof ApfMigrationError) {
    return 'This project file could not be upgraded to the current format. Try updating Albatross.'
  }
  if (
    error instanceof ApfNotZipPayloadError ||
    error instanceof ApfZipCorruptError ||
    error instanceof ApfArchiveLayoutError
  ) {
    return 'The selected file is not a valid Albatross project file.'
  }
  if (error instanceof ApfInvalidManifestError || error instanceof ApfInvalidDataError) {
    return 'The selected file is not a valid Albatross project file.'
  }
  if (error instanceof ApfImportPreflightError) {
    return 'This project file can’t be imported. It may be incomplete or edited outside Albatross.'
  }
  if (error instanceof ApfImportIoError) {
    return 'Import failed while copying attachments. Nothing was changed in your library.'
  }
  if (error instanceof ApfImportDbError) {
    return 'Import failed while saving to the database. Nothing was changed in your library.'
  }
  if (error instanceof ApfError) {
    return 'Import failed. The file may be damaged or not an Albatross project export.'
  }
  if (error instanceof Error) {
    return error.message || 'Import failed.'
  }
  return 'Import failed.'
}

export function userMessageForImportSuccess(result: ImportProductionSuccess): string {
  const parts = [
    `Project “${result.productionName}” was imported and set as the current production.`,
  ]
  if (result.warnings.length > 0) {
    parts.push(
      'Some document attachments were missing from the file; those rows were imported without files.'
    )
  }
  return parts.join(' ')
}
