import { useMemo, useState } from 'react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useEnrichedDocuments } from '@/features/documents/useEnrichedDocuments'
import { getDocumentCategory } from '@/lib/documents/catalog'
import { getFileUrl, openInSystem } from '@/lib/files'

type DocumentsSearchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
}

export function DocumentsSearchDialog({
  open,
  onOpenChange,
  productionId,
}: DocumentsSearchDialogProps) {
  const { documents } = useEnrichedDocuments(productionId)
  const [query, setQuery] = useState('')

  const groupedResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? documents.filter(
          (doc) =>
            doc.file_name.toLowerCase().includes(q) ||
            doc.typeLabel.toLowerCase().includes(q) ||
            (doc.contextLabel?.toLowerCase().includes(q) ?? false) ||
            doc.groupTitle.toLowerCase().includes(q)
        )
      : documents.slice(0, 20)

    const byCategory = new Map<string, typeof filtered>()
    for (const doc of filtered) {
      const list = byCategory.get(doc.categoryId) ?? []
      list.push(doc)
      byCategory.set(doc.categoryId, list)
    }
    return byCategory
  }, [documents, query])

  const handleSelect = async (filePath: string) => {
    onOpenChange(false)
    setQuery('')
    const url = await getFileUrl(filePath)
    await openInSystem(url)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery('')
      }}
      title="Search documents"
      description="Find files across all document categories"
    >
      <CommandInput
        placeholder="Search by filename, type, or context…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No documents found.</CommandEmpty>
        {Array.from(groupedResults.entries()).map(([categoryId, docs]) => {
          const category = getDocumentCategory(categoryId as Parameters<typeof getDocumentCategory>[0])
          return (
            <CommandGroup key={categoryId} heading={category.label}>
              {docs.map((doc) => (
                <CommandItem
                  key={doc.id}
                  value={`${doc.file_name} ${doc.typeLabel} ${doc.contextLabel ?? ''}`}
                  onSelect={() => handleSelect(doc.file_path)}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{doc.file_name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {doc.typeLabel}
                      {doc.contextLabel ? ` · ${doc.contextLabel}` : ''}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
