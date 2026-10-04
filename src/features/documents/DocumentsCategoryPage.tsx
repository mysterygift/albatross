import { useState } from 'react'

import { RequireProduction } from '@/components/require-production'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Link, useParams } from 'react-router-dom'
import { revealItemInDir } from '@tauri-apps/plugin-opener'

import { Button } from '@/components/ui/button'
import { useCurrentProduction } from '@/features/productions/context'
import { useHighlightParam } from '@/features/search/useHighlightParam'
import { DocumentGroupSection } from '@/features/documents/DocumentGroupSection'
import { useEnrichedDocuments } from '@/features/documents/useEnrichedDocuments'
import { invalidateExpenseReceiptQueries } from '@/lib/db/repositories/expenseReceipts'
import { hardDeleteDocument } from '@/lib/documents/hardDeleteDocument'
import { getFileUrl, openInSystem, resolveAppDataPath } from '@/lib/files'
import {
  DOCUMENT_ENTITY_TYPES,
  getDocumentCategory,
  isDocumentCategorySlug,
  type DocumentCategoryId,
} from '@/lib/documents/catalog'
import { groupEnrichedDocuments } from '@/lib/documents/enrichDocuments'
import { documentsQueryKey } from '@/lib/documents/persistDocument'

export function DocumentsCategoryPage() {
  const { category: categorySlug } = useParams<{ category: string }>()
  const { currentProductionId } = useCurrentProduction()
  const queryClient = useQueryClient()
  const highlightedId = useHighlightParam()
  const { getCategoryDocuments, isLoading } = useEnrichedDocuments(currentProductionId)

  const categoryId: DocumentCategoryId | null =
    categorySlug && isDocumentCategorySlug(categorySlug) ? categorySlug : null

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => hardDeleteDocument(docId),
    onSuccess: () => {
      if (currentProductionId) {
        queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
        // Deleting a receipt document also removes the receipt record on its expense.
        invalidateExpenseReceiptQueries(queryClient, { productionId: currentProductionId })
      }
    },
  })

  const handleOpen = async (filePath: string) => {
    try {
      const url = await getFileUrl(filePath)
      await openInSystem(url)
    } catch {
      const fullPath = await resolveAppDataPath(filePath)
      await revealItemInDir(fullPath)
    }
  }

  if (!currentProductionId) {
    return (
      <RequireProduction title="Documents">{null}</RequireProduction>
    )
  }

  if (!categoryId) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Unknown document category.</p>
        <Button variant="outline" asChild>
          <Link to="/documents">
            <ArrowLeft className="mr-2 size-4" />
            Back to Documents
          </Link>
        </Button>
      </div>
    )
  }

  const category = getDocumentCategory(categoryId)
  const docs = getCategoryDocuments(categoryId)
  const groups = groupEnrichedDocuments(docs)
  const pendingDeleteDoc = docs.find((d) => d.id === pendingDeleteId) ?? null

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" asChild>
          <Link to="/documents">
            <ArrowLeft className="mr-1 size-4" />
            All categories
          </Link>
        </Button>
        <PageHeader
          title={category.label}
          description={category.description}
        />
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading documents" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-10 text-center">
          <p className="text-muted-foreground">{category.emptyMessage}</p>
          <Button variant="link" asChild className="mt-2">
            <Link to={category.sourceRoute}>Go to source</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <DocumentGroupSection
              key={group.groupKey}
              group={group}
              onOpen={handleOpen}
              onDelete={setPendingDeleteId}
              isDeleting={deleteMutation.isPending}
              showType={categoryId !== 'general'}
              highlightedId={highlightedId}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteDoc !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
        title="Delete document?"
        description={
          <>
            <span className="font-medium text-foreground">{pendingDeleteDoc?.file_name}</span> will
            be permanently deleted. This can&apos;t be undone, and the document can&apos;t be
            retrieved once it&apos;s been deleted.
            {pendingDeleteDoc?.entity_type === DOCUMENT_ENTITY_TYPES.expenseReceipt &&
              ' It will also be removed from the expense it was attached to.'}
          </>
        }
        confirmLabel="Delete document"
        destructive
        onConfirm={async () => {
          if (pendingDeleteId) await deleteMutation.mutateAsync(pendingDeleteId)
        }}
      />
    </div>
  )
}
