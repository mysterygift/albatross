import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { listDocumentsByProduction } from '@/lib/db/repositories/document'
import { listSidesExportsByProduction } from '@/lib/db/repositories/sidesExports'
import { pickAndSaveAttachment } from '@/lib/files'
import { createDocument } from '@/lib/db/repositories/document'
import { getDb } from '@/lib/db/client'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import {
  createDocumentForActor,
  listDocumentsByProductionForActor,
} from '@/lib/access/projectDomainService'
import { resolveAppDataPath } from '@/lib/files'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Upload, ExternalLink } from 'lucide-react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { useEffect, useMemo } from 'react'

function formatEntityType(entityType: string | null): string {
  if (entityType === 'sides_export') return 'Shoot-day sides'
  if (entityType === 'script') return 'Script'
  if (entityType === 'call_sheet') return 'Call sheet'
  return entityType ?? '—'
}

export function DocumentsPage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()

  const { data: sidesExports = [] } = useQuery({
    queryKey: ['sides-exports', currentProductionId],
    queryFn: () => listSidesExportsByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const exportLabelByDocumentId = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of sidesExports) {
      if (row.document_id && row.export_label) map.set(row.document_id, row.export_label)
    }
    return map
  }, [sidesExports])

  const { data: documents = [] } = useQuery({
    queryKey: ['documents', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listDocumentsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listDocumentsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const result = await pickAndSaveAttachment()
      if (!result || !currentProductionId) return
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createDocumentForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          fileName: result.fileName,
          filePath: result.relativePath,
        })
      }
      return createDocument({
        production_id: currentProductionId,
        entity_type: null,
        entity_id: null,
        file_name: result.fileName,
        file_path: result.relativePath,
        mime_type: null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  const handleReveal = async (filePath: string) => {
    const fullPath = await resolveAppDataPath(filePath)
    await revealItemInDir(fullPath)
  }

  useEffect(() => {
    const onMenuUpload = () => uploadMutation.mutate()
    window.addEventListener('albatross-menu-documents-upload-file', onMenuUpload)
    return () => window.removeEventListener('albatross-menu-documents-upload-file', onMenuUpload)
  }, [uploadMutation])

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>
          <Upload className="mr-2 size-4" />
          Upload file
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  {doc.file_name}
                  {exportLabelByDocumentId.get(doc.id) && (
                    <span className="block text-xs text-muted-foreground">
                      {exportLabelByDocumentId.get(doc.id)}
                    </span>
                  )}
                </TableCell>
                <TableCell>{formatEntityType(doc.entity_type)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReveal(doc.file_path)}
                  >
                    <ExternalLink className="mr-1 size-4" />
                    Open in Finder
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {documents.length === 0 && (
        <p className="text-muted-foreground">No documents. Upload a file to attach to this production.</p>
      )}
    </div>
  )
}
