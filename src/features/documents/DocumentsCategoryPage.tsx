import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { revealItemInDir } from '@tauri-apps/plugin-opener'

import { Button } from '@/components/ui/button'
import { useCurrentProduction } from '@/features/productions/context'
import { DocumentGroupSection } from '@/features/documents/DocumentGroupSection'
import { useEnrichedDocuments } from '@/features/documents/useEnrichedDocuments'
import { deleteDocument } from '@/lib/db/repositories/document'
import { getFileUrl, openInSystem, resolveAppDataPath } from '@/lib/files'
import {
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
  const { getCategoryDocuments, isLoading } = useEnrichedDocuments(currentProductionId)

  const categoryId: DocumentCategoryId | null =
    categorySlug && isDocumentCategorySlug(categorySlug) ? categorySlug : null

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => deleteDocument(docId),
    onSuccess: () => {
      if (currentProductionId) {
        queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
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
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
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
  const Icon = category.icon

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" asChild>
            <Link to="/documents">
              <ArrowLeft className="mr-1 size-4" />
              All categories
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{category.label}</h1>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to={category.sourceRoute}>Open {category.label.split(' ')[0]}…</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
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
              onDelete={(id) => deleteMutation.mutate(id)}
              isDeleting={deleteMutation.isPending}
              showType={categoryId !== 'general'}
            />
          ))}
        </div>
      )}
    </div>
  )
}
