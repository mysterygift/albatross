/**
 * Albatross Project File (.apf) — format identifiers and version bounds.
 * @see docs/project-import-export-format-v1.md
 */

/** UTI-style constant stored in manifest `kind`. */
export const APF_FILE_KIND = 'albatross-project-file' as const

/** Interchange schema version (manifest + data file). Bump when on-disk JSON shape changes. */
export const CURRENT_APF_FORMAT_VERSION = 3

/** Lowest formatVersion this app build can import (after file-level migrations). */
export const APF_MIN_SUPPORTED_FORMAT_VERSION = 1

/** Highest formatVersion this app build can import without code update. Newer files must be rejected. */
export const APF_MAX_SUPPORTED_FORMAT_VERSION = 3

/** Zip entry path for the package manifest (forward slashes). */
export const APF_MANIFEST_ENTRY_PATH = 'manifest.json'

/** v1 canonical project payload (single file under data/). */
export const APF_V1_DATA_ENTRY_PATH = 'data/production.json'

/** Root prefix for bundled bytes inside the archive. */
export const APF_FILES_ENTRY_PREFIX = 'files/'

/** Subfolder for document rows bundled by `documents.id`. */
export const APF_DOCUMENTS_FILES_PREFIX = 'files/documents/'
