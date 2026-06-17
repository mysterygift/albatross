import type { DocumentGroup } from '@/lib/documents/enrichDocuments'
import { DocumentRow } from '@/features/documents/DocumentRow'
import type { EnrichedDocument } from '@/lib/documents/enrichDocuments'

type DocumentGroupSectionProps = {
  group: DocumentGroup
  onOpen: (filePath: string) => void
  onDelete?: (docId: string) => void
  isDeleting?: boolean
  showType?: boolean
}

export function DocumentGroupSection({
  group,
  onOpen,
  onDelete,
  isDeleting,
  showType,
}: DocumentGroupSectionProps) {
  return (
    <section className="rounded-md border border-border">
      <header className="sticky top-0 z-10 border-b border-border bg-muted/40 px-4 py-2">
        <h3 className="text-sm font-semibold">{group.groupTitle}</h3>
        <p className="text-xs text-muted-foreground">
          {group.documents.length} {group.documents.length === 1 ? 'file' : 'files'}
        </p>
      </header>
      <div>
        {group.documents.map((doc: EnrichedDocument) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            onOpen={onOpen}
            onDelete={onDelete}
            isDeleting={isDeleting}
            showType={showType}
          />
        ))}
      </div>
    </section>
  )
}
