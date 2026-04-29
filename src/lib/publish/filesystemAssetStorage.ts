import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { PublishAssetStorage } from '@/lib/publish/postgresImport'

export function createFilesystemAssetStorage(rootDirectory: string): PublishAssetStorage {
  return {
    writeAsset: async (storageKey: string, bytes: Uint8Array) => {
      const fullPath = join(rootDirectory, storageKey)
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, bytes)
    },
    deleteAsset: async (storageKey: string) => {
      const fullPath = join(rootDirectory, storageKey)
      await rm(fullPath, { force: true })
    },
  }
}
