import { useCallback, useEffect, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

/** Pages render at this width on wide screens, as before; narrower containers (phones) fit to their width. */
const MAX_PAGE_WIDTH = 680
/** Room for the scroll area's border and scrollbar. */
const GUTTER = 16

export type PdfPreviewProps = {
  /** Object URL (or any URL react-pdf accepts) of the generated PDF. */
  file: string
  className?: string
  /** Called with the reason when the PDF can't be opened, in addition to the inline message. */
  onLoadError?: (error: Error) => void
}

/**
 * Scrollable preview of a generated PDF (call sheets, movement orders). Pages fit the available width,
 * so a phone shows the whole page instead of the left 400pt of a 680pt render, and a load failure says
 * why instead of react-pdf's bare "Failed to load PDF file."
 */
export function PdfPreview({ file, className, onLoadError }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(MAX_PAGE_WIDTH)

  // A new PDF starts from scratch (adjusting state during render, keyed on the file).
  const [shownFile, setShownFile] = useState(file)
  if (file !== shownFile) {
    setShownFile(file)
    setNumPages(null)
    setError(null)
  }

  useEffect(() => {
    if (!container) return
    const measure = () => {
      const available = container.clientWidth - GUTTER
      if (available > 0) setWidth(Math.min(MAX_PAGE_WIDTH, Math.floor(available)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [container])

  const handleError = useCallback(
    (err: Error) => {
      setError(err?.message || String(err))
      setNumPages(null)
      onLoadError?.(err)
    },
    [onLoadError]
  )

  return (
    <div ref={setContainer} className="w-full">
      <ScrollArea className={cn('h-[70dvh] w-full rounded border border-border md:h-[960px]', className)}>
        <Document
          file={file}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={handleError}
          onSourceError={handleError}
          error={
            <p role="alert" className="p-4 text-sm text-destructive">
              The preview couldn&apos;t be opened{error ? `: ${error}` : '.'} Try generating it again.
            </p>
          }
        >
          {numPages != null &&
            Array.from({ length: numPages }, (_, i) => <Page key={i} pageNumber={i + 1} width={width} />)}
        </Document>
      </ScrollArea>
    </div>
  )
}
