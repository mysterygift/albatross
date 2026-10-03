import { RequireProduction } from '@/components/require-production'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/page-header'
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
      <RequireProduction title="Documents">{null}</RequireProduction>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Browse production files by category — scripts, set paperwork, deliverables, and more."
        actions={
          <>
            <Button variant="outline" onClick={() => setSearchOpen(true)}>
              <Search className="mr-2 size-4" />
              Search
            </Button>
            <Button onClick={startUpload} disabled={uploadMutation.isPending}>
              <Upload className="mr-2 size-4" />
              Upload file
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div role="status" aria-label="Loading documents" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
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
