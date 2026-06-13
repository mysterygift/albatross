/**
 * Main-thread client for the PDF parse worker. Spins up a dedicated module worker, relays
 * progress to a callback, and resolves with the parsed scenes (or rejects with a `PdfParseError`).
 *
 * The provided `buffer` is transferred to the worker (and therefore detached); callers should
 * pass a buffer they no longer need on the main thread.
 */
import type { ParsedScene } from './types'
import { PdfParseError } from './pdf-parser'
import type { PdfWorkerRequest, PdfWorkerResponse } from './pdf-parse.worker'

export interface ParsePdfInWorkerOptions {
  onProgress?: (page: number, total: number) => void
  maxPages?: number
}

export function parsePdfScriptInWorker(
  buffer: ArrayBuffer,
  options: ParsePdfInWorkerOptions = {}
): Promise<ParsedScene[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdf-parse.worker.ts', import.meta.url), { type: 'module' })

    const cleanup = () => worker.terminate()

    worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        options.onProgress?.(message.page, message.total)
      } else if (message.type === 'done') {
        cleanup()
        resolve(message.scenes)
      } else {
        cleanup()
        reject(new PdfParseError(message.code, message.message))
      }
    }
    worker.onerror = (event) => {
      cleanup()
      reject(new PdfParseError('parse-failed', event.message || 'PDF worker failed.'))
    }

    const request: PdfWorkerRequest = { buffer, maxPages: options.maxPages }
    worker.postMessage(request, [buffer])
  })
}
