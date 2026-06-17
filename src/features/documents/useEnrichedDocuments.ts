import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { listDocumentsByProduction } from '@/lib/db/repositories/document'
import { listDocumentsByProductionForActor } from '@/lib/access/projectDomainService'
import {
  enrichDocumentsForProduction,
  partitionDocumentsByCategory,
  type EnrichedDocument,
} from '@/lib/documents/enrichDocuments'
import { DOCUMENT_CATEGORIES, type DocumentCategoryId } from '@/lib/documents/catalog'

export function useEnrichedDocuments(productionId: string | null | undefined) {
  const authSession = useAuthSession()

  const query = useQuery({
    queryKey: ['documents', productionId],
    queryFn: async () => {
      if (!productionId) return [] as EnrichedDocument[]
      let documents
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        documents = await listDocumentsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId,
        })
      } else {
        documents = await listDocumentsByProduction(productionId)
      }
      return enrichDocumentsForProduction(productionId, documents)
    },
    enabled: !!productionId,
  })

  const byCategory = useMemo(
    () => partitionDocumentsByCategory(query.data ?? []),
    [query.data]
  )

  const categorySummaries = useMemo(() => {
    return DOCUMENT_CATEGORIES.map((category) => {
      const docs = byCategory.get(category.id) ?? []
      return {
        ...category,
        count: docs.length,
        recent: docs.slice(0, 2),
      }
    })
  }, [byCategory])

  return {
    ...query,
    documents: query.data ?? [],
    byCategory,
    categorySummaries,
    getCategoryDocuments: (categoryId: DocumentCategoryId) => byCategory.get(categoryId) ?? [],
  }
}
