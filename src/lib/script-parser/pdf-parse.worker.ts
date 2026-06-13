/// <reference lib="webworker" />
/**
 * Web Worker entry that runs the (CPU-bound) PDF script parse off the main thread so the import
 * UI stays responsive for long scripts. Posts progress messages per page and a final done/error
 * message. The heavy work lives in `parsePdfScript`; this file is only the message bridge.
 */
import { parsePdfScript, PdfParseError } from './pdf-parser'
import type { PdfParseErrorCode } from './pdf-parser'

if (typeof (globalThis as unknown as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
  ;(globalThis as unknown as { DOMMatrix: new () => unknown }).DOMMatrix = class {}
}

export interface PdfWorkerRequest {
  buffer: ArrayBuffer
  maxPages?: number
}

export type PdfWorkerResponse =
  | { type: 'progress'; page: number; total: number }
  | { type: 'done'; scenes: Awaited<ReturnType<typeof parsePdfScript>> }
  | { type: 'error'; code: PdfParseErrorCode; message: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  const { buffer, maxPages } = event.data
  try {
    const scenes = await parsePdfScript(buffer, {
      maxPages,
      onProgress: (page, total) => ctx.postMessage({ type: 'progress', page, total } satisfies PdfWorkerResponse),
    })
    ctx.postMessage({ type: 'done', scenes } satisfies PdfWorkerResponse)
  } catch (err) {
    const code: PdfParseErrorCode =
      err instanceof PdfParseError && err.code ? err.code : 'parse-failed'
    const message =
      err instanceof Error
        ? err.message || err.stack || err.name || 'Failed to parse PDF.'
        : String(err ?? 'Failed to parse PDF.')
    ctx.postMessage({ type: 'error', code, message } satisfies PdfWorkerResponse)
  }
}
