import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { deleteDocument, listDocumentsByEntity } from '@/lib/db/repositories/document'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { documentsQueryKey, persistProductionDocument } from '@/lib/documents/persistDocument'
import {
  entityDocumentsQueryKey,
  pickFileBytes,
  type PickedFileBytes,
} from '@/lib/documents/pickAndPersistProductionDocument'
import { getFileUrl, openInSystem } from '@/lib/files'

export type LocationDocumentEntityType =
  | typeof DOCUMENT_ENTITY_TYPES.permit
  | typeof DOCUMENT_ENTITY_TYPES.locationRelease

const FILE_FILTERS = [{ name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'] }]

/** Persist files that were staged while the location did not exist yet. */
export async function persistPendingLocationDocuments(
  productionId: string,
  locationId: string,
  entityType: LocationDocumentEntityType,
  files: PickedFileBytes[]
): Promise<void> {
  for (const file of files) {
    await persistProductionDocument({
      productionId,
      fileName: file.fileName,
      bytes: file.bytes,
      mimeType: file.mimeType,
      entityType,
      entityId: locationId,
    })
  }
}

type Props = {
  productionId: string
  /** Null while creating a location: picked files are staged in `pendingFiles` instead. */
  locationId: string | null
  entityType: LocationDocumentEntityType
  label: string
  pendingFiles: PickedFileBytes[]
  onPendingFilesChange: (files: PickedFileBytes[]) => void
}

export function LocationDocumentsSection({
  productionId,
  locationId,
  entityType,
  label,
  pendingFiles,
  onPendingFilesChange,
}: Props) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [openingPath, setOpeningPath] = useState<string | null>(null)

  const { data: documents = [] } = useQuery({
    queryKey: entityDocumentsQueryKey(entityType, locationId ?? ''),
    queryFn: () => listDocumentsByEntity(entityType, locationId!),
    enabled: !!locationId,
  })

  const invalidate = () => {
    if (locationId) {
      queryClient.invalidateQueries({ queryKey: entityDocumentsQueryKey(entityType, locationId) })
    }
    queryClient.invalidateQueries({ queryKey: documentsQueryKey(productionId) })
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const picked = await pickFileBytes(FILE_FILTERS)
      if (!picked) return
      if (!locationId) {
        onPendingFilesChange([...pendingFiles, picked])
        return
      }
      await persistProductionDocument({
        productionId,
        fileName: picked.fileName,
        bytes: picked.bytes,
        mimeType: picked.mimeType,
        entityType,
        entityId: locationId,
      })
    },
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to upload file'),
  })

  const removeMutation = useMutation({
    mutationFn: (docId: string) => deleteDocument(docId),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to remove file'),
  })

  const handleOpen = async (filePath: string) => {
    setError(null)
    setOpeningPath(filePath)
    try {
      await openInSystem(await getFileUrl(filePath))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open file')
    } finally {
      setOpeningPath(null)
    }
  }

  const isEmpty = documents.length === 0 && pendingFiles.length === 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            setError(null)
            uploadMutation.mutate()
          }}
          disabled={uploadMutation.isPending}
        >
          <Upload className="size-4 shrink-0" />
          Upload
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">None uploaded yet.</p>
      ) : (
        <ul className="space-y-1 rounded-md border border-border bg-muted/20 p-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={doc.file_name}>
                {doc.file_name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-7 p-0"
                onClick={() => handleOpen(doc.file_path)}
                disabled={openingPath !== null}
                title="Open"
              >
                {openingPath === doc.file_path ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="size-3.5" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeMutation.mutate(doc.id)}
                disabled={removeMutation.isPending}
                title="Remove"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
          {pendingFiles.map((file, index) => (
            <li key={`pending-${index}`} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={file.fileName}>
                {file.fileName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">Uploads on save</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onPendingFilesChange(pendingFiles.filter((_, i) => i !== index))}
                title="Remove"
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
