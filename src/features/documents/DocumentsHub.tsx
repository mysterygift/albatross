import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useCurrentProduction } from '@/features/productions/context'
import { DocumentCategoryCard } from '@/features/documents/DocumentCategoryCard'
import { DocumentsSearchDialog } from '@/features/documents/DocumentsSearchDialog'
import { UploadCategoryDialog } from '@/features/documents/UploadCategoryDialog'
import { useEnrichedDocuments } from '@/features/documents/useEnrichedDocuments'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { createDocument } from '@/lib/db/repositories/document'
import { createDocumentForActor } from '@/lib/access/projectDomainService'
import { pickAndSaveAttachment } from '@/lib/files'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import {
  getManualUploadEntityType,
  type DocumentCategoryId,
} from '@/lib/documents/catalog'

export function DocumentsHub() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const [searchOpen, setSearchOpen] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const { categorySummaries, isLoading } = useEnrichedDocuments(currentProductionId)

  const uploadMutation = useMutation({
    mutationFn: async (categoryId: DocumentCategoryId) => {
      const result = await pickAndSaveAttachment()
      if (!result || !currentProductionId) return
      const entityType = getManualUploadEntityType(categoryId)
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createDocumentForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          fileName: result.fileName,
          filePath: result.relativePath,
          entityType,
        })
      }
      return createDocument({
        production_id: currentProductionId,
        entity_type: entityType,
        entity_id: null,
        file_name: result.fileName,
        file_path: result.relativePath,
        mime_type: null,
      })
    },
    onSuccess: (doc) => {
      if (!doc) return
      if (currentProductionId) {
        queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
      }
      setUploadDialogOpen(false)
    },
  })

  const startUpload = useCallback(() => {
    setUploadDialogOpen(true)
  }, [])

  useEffect(() => {
    const onMenuUpload = () => startUpload()
    window.addEventListener('albatross-menu-documents-upload-file', onMenuUpload)
    return () => window.removeEventListener('albatross-menu-documents-upload-file', onMenuUpload)
  }, [startUpload])

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Browse production files by category — scripts, set paperwork, deliverables, and more.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSearchOpen(true)}>
            <Search className="mr-2 size-4" />
            Search
          </Button>
          <Button onClick={startUpload} disabled={uploadMutation.isPending}>
            <Upload className="mr-2 size-4" />
            Upload file
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading documents…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categorySummaries.map((summary) => (
            <DocumentCategoryCard
              key={summary.id}
              category={summary}
              count={summary.count}
              recent={summary.recent}
            />
          ))}
        </div>
      )}

      <DocumentsSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        productionId={currentProductionId}
      />

      <UploadCategoryDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        isUploading={uploadMutation.isPending}
        onConfirm={(categoryId) => uploadMutation.mutate(categoryId)}
      />
    </div>
  )
}
