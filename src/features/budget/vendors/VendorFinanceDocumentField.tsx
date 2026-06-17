import { useState } from 'react'
import { ExternalLink, Paperclip, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { pickFileBytes } from '@/lib/documents/pickAndPersistProductionDocument'
import { getFileUrl, openInSystem } from '@/lib/files'
import type { Document } from '@/lib/db/types'
import type { VendorFinanceFileInput } from '@/lib/db/vendorFinanceDocumentService'

export type VendorFinanceDocumentFieldProps = {
  /** Existing attachment from DB (edit mode). */
  existingDocument?: Document | null
  /** Pending file selected but not yet saved. */
  pendingFile?: VendorFinanceFileInput | null
  onPendingFileChange?: (file: VendorFinanceFileInput | null) => void
  disabled?: boolean
  label?: string
}

export function VendorFinanceDocumentField({
  existingDocument,
  pendingFile,
  onPendingFileChange,
  disabled = false,
  label = 'Attachment',
}: VendorFinanceDocumentFieldProps) {
  const [openError, setOpenError] = useState<string | null>(null)
  const [isPicking, setIsPicking] = useState(false)

  const displayName =
    pendingFile?.fileName ?? existingDocument?.file_name ?? null

  const handlePick = async () => {
    if (!onPendingFileChange || disabled) return
    setIsPicking(true)
    try {
      const picked = await pickFileBytes([
        { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg'] },
      ])
      if (!picked) return
      onPendingFileChange({
        fileName: picked.fileName,
        bytes: picked.bytes,
        mimeType: picked.mimeType,
      })
    } finally {
      setIsPicking(false)
    }
  }

  const handleOpenExisting = async () => {
    if (!existingDocument?.file_path || pendingFile) return
    setOpenError(null)
    try {
      const url = await getFileUrl(existingDocument.file_path)
      await openInSystem(url)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Failed to open file')
    }
  }

  const handleClearPending = () => {
    onPendingFileChange?.(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {displayName ? (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{displayName}</span>
          {existingDocument && !pendingFile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0"
              onClick={handleOpenExisting}
              disabled={disabled}
            >
              <ExternalLink className="size-3.5" />
              Open
            </Button>
          )}
          {onPendingFileChange && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0"
                onClick={handlePick}
                disabled={disabled || isPicking}
              >
                Replace
              </Button>
              {pendingFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-muted-foreground"
                  onClick={handleClearPending}
                  disabled={disabled}
                  aria-label="Remove selected file"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePick}
          disabled={disabled || isPicking || !onPendingFileChange}
        >
          <Upload className="size-3.5 mr-1.5" />
          {isPicking ? 'Choosing file…' : 'Upload file'}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Optional PDF or image.</p>
      {openError && <p className="text-xs text-destructive">{openError}</p>}
    </div>
  )
}
