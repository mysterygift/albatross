import { ExternalLink, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { EnrichedDocument } from '@/lib/documents/enrichDocuments'
import { getDocumentSourceRoute, isDeletableManualUpload } from '@/lib/documents/catalog'

type DocumentRowProps = {
  doc: EnrichedDocument
  onOpen: (filePath: string) => void
  onDelete?: (docId: string) => void
  isDeleting?: boolean
  showType?: boolean
}

export function DocumentRow({
  doc,
  onOpen,
  onDelete,
  isDeleting,
  showType = true,
}: DocumentRowProps) {
  const sourceRoute = getDocumentSourceRoute(doc.entity_type)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{doc.file_name}</p>
        {doc.contextLabel && (
          <p className="truncate text-xs text-muted-foreground">{doc.contextLabel}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {showType && (
            <Badge variant="secondary" className="text-xs">
              {doc.typeLabel}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(doc.created_at).toLocaleDateString()}
          </span>
          <Link
            to={sourceRoute}
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            View source
          </Link>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onOpen(doc.file_path)}>
          <ExternalLink className="mr-1 size-4" />
          Open
        </Button>
        {onDelete && isDeletableManualUpload(doc.entity_type) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(doc.id)}
            disabled={isDeleting}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
