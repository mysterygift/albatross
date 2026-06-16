/**
 * Albatross Project File (.apf) — format v1 + export + import pipelines.
 */

export {
  APF_DOCUMENTS_FILES_PREFIX,
  APF_FILE_KIND,
  APF_FILES_ENTRY_PREFIX,
  APF_MANIFEST_ENTRY_PATH,
  APF_MAX_SUPPORTED_FORMAT_VERSION,
  APF_MIN_SUPPORTED_FORMAT_VERSION,
  APF_V1_DATA_ENTRY_PATH,
  CURRENT_APF_FORMAT_VERSION,
} from '@/lib/importExport/constants'

export {
  assertApfImportableFormatVersion,
  doesApfFormatRequireMigration,
  getApfFormatCompatibility,
  isApfFormatVersionTooNew,
  isApfFormatVersionTooOld,
  type ApfFormatCompatibility,
} from '@/lib/importExport/compatibility'

export {
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
  type ApfErrorCode,
} from '@/lib/importExport/errors'

export {
  getManifestDataEntryPath,
  getManifestFilesPrefix,
  parseApfManifestJson,
  apfManifestSchemaV1,
  type ApfManifestV1,
} from '@/lib/importExport/manifest'

export { APF_FILE_MIGRATIONS, migrateApfToCurrentVersion, migrateScenesDropHeading, synthesizeMissingBudgetRevisions, type ApfFileMigrator, type ApfMigrationContext } from '@/lib/importExport/migrate'

export { normalizeApfManifestAndData, type NormalizedApfProjectPackage } from '@/lib/importExport/pipeline'

export {
  assertApfManifestDataFormatVersionAligned,
  parseApfV1DataFileJson,
  type ApfTableRow,
  type ApfV1DataFile,
  type ApfV1Tables,
} from '@/lib/importExport/payload'

export { isLikelyZipPayload } from '@/lib/importExport/sniff'

export { APF_V1_TABLE_KEYS, isApfV1TableKey, type ApfV1TableKey } from '@/lib/importExport/tableKeys'

export {
  normalizeApfZipEntryPath,
  normalizeApfZipEntrySet,
  validateApfArchiveLayout,
  type ApfArchiveLayoutValidation,
} from '@/lib/importExport/validateLayout'

export {
  apfDocumentBundledZipPath,
  apfDocumentBundledZipPathForManifest,
  apfSanitizeDocumentBasename,
} from '@/lib/importExport/documentPaths'

export { buildApfZipBytes, type ApfZipBundledFile } from '@/lib/importExport/buildApfArchive'

export { buildApfExportManifest, type BuildApfExportManifestParams } from '@/lib/importExport/buildExportManifest'

export { buildApfV1ExportDataFile, countTableRows } from '@/lib/importExport/buildExportPayload'

export { collectApfDocumentBundledEntries, type ApfBundledZipEntry } from '@/lib/importExport/collectApfDocumentFiles'

export { loadApfV1ProductionTables } from '@/lib/importExport/exportLoadProductionData'

export { exportProductionAsApf, exportProductionAsApfForActor } from '@/lib/importExport/exportProduction'

export { importProductionFromApf } from '@/lib/importExport/importProduction'

export type { ImportProductionFailure, ImportProductionResult, ImportProductionSuccess } from '@/lib/importExport/importTypes'

export {
  buildApfZipIndex,
  parseApfArchiveBytes,
  type ApfZipIndex,
  type ParsedApfArchive,
} from '@/lib/importExport/readApfArchive'

export { extractApfDocumentsForImport, importedDocumentRelativePath } from '@/lib/importExport/extractApfDocumentsForImport'

export { planApfImportStatements, type ImportSqlStatement } from '@/lib/importExport/planImportStatements'

export { preflightApfImportDb } from '@/lib/importExport/preflightApfImport'

export {
  userMessageForExportFailure,
  userMessageForImportFailure,
  userMessageForImportSuccess,
} from '@/lib/importExport/apfUserMessages'
