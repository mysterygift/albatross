export type ImportProductionSuccess = {
  ok: true
  productionId: string
  productionName: string
  formatVersion: number
  /** Document rows for which bundled bytes existed in the archive and were written to app data. */
  filesRestored: number
  warnings: string[]
}

export type ImportProductionFailure = {
  ok: false
  error: Error
}

export type ImportProductionResult = ImportProductionSuccess | ImportProductionFailure
