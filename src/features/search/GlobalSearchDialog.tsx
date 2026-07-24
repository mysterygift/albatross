import { useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye } from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { filterGlobalSearch } from '@/features/search/filterGlobalSearch'
import { useGlobalSearchIndex } from '@/features/search/useGlobalSearchIndex'
import { GlobalSearchResultPreview } from '@/features/search/GlobalSearchResultPreview'
import { SECTION_BADGE, SECTION_ICON } from '@/features/search/sectionMeta'
import { GLOBAL_SEARCH_SECTIONS } from '@/features/search/types'
import type { GlobalSearchResult } from '@/features/search/types'

type GlobalSearchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string | null | undefined
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
  productionId,
}: GlobalSearchDialogProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [previewResult, setPreviewResult] = useState<GlobalSearchResult | null>(null)
  const [previewAnchor, setPreviewAnchor] = useState<HTMLElement | null>(null)
  const { results } = useGlobalSearchIndex(productionId, { enabled: open })

  const grouped = useMemo(
    () => filterGlobalSearch(results, query),
    [results, query]
  )

  const resultById = useMemo(() => {
    const map = new Map<string, GlobalSearchResult>()
    for (const group of grouped.values()) {
      for (const result of group.results) {
        map.set(`${result.type}:${result.id}`, result)
      }
    }
    return map
  }, [grouped])

  const closePreview = () => {
    setPreviewResult(null)
    setPreviewAnchor(null)
  }

  const close = () => {
    onOpenChange(false)
    setQuery('')
    closePreview()
  }

  const handleSelect = (to: string) => {
    close()
    navigate(to)
  }

  const openPreviewFor = (result: GlobalSearchResult, anchor: HTMLElement) => {
    setPreviewResult(result)
    setPreviewAnchor(anchor)
  }

  const togglePreviewFor = (result: GlobalSearchResult, anchor: HTMLElement) => {
    if (previewResult?.id === result.id && previewResult.type === result.type) {
      closePreview()
    } else {
      openPreviewFor(result, anchor)
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const caretAtEnd =
      input.selectionStart === input.value.length &&
      input.selectionEnd === input.value.length

    if (event.key === 'ArrowRight' && !previewResult && caretAtEnd) {
      const activeItem = document.querySelector<HTMLElement>(
        '[cmdk-item][aria-selected="true"]'
      )
      const id = activeItem?.getAttribute('data-result-id')
      const result = id ? resultById.get(id) : undefined
      if (activeItem && result) {
        event.preventDefault()
        openPreviewFor(result, activeItem)
      }
      return
    }

    if (event.key === 'ArrowLeft' && previewResult) {
      event.preventDefault()
      closePreview()
      return
    }

    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && previewResult) {
      // Let cmdk move the selection, but dismiss the preview.
      closePreview()
    }
  }

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next)
          if (!next) {
            setQuery('')
            closePreview()
          }
        }}
        title="Search"
        description="Search people, scenes, locations, documents, and purchase orders"
        shouldFilter={false}
        onInteractOutside={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('[data-search-preview]')
          ) {
            event.preventDefault()
          }
        }}
        onPointerDownOutside={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('[data-search-preview]')
          ) {
            event.preventDefault()
          }
        }}
      >
        <CommandInput
          placeholder="Search people, scenes, locations, documents, purchase orders…"
          value={query}
          onValueChange={(next) => {
            setQuery(next)
            closePreview()
          }}
          onKeyDown={handleInputKeyDown}
        />
        <CommandList>
          <CommandEmpty>
            {productionId ? 'No results found.' : 'Select a production first.'}
          </CommandEmpty>
          {GLOBAL_SEARCH_SECTIONS.map((section) => {
            const group = grouped.get(section.type)
            if (!group || group.results.length === 0) return null
            const Icon = SECTION_ICON[section.type]
            return (
              <CommandGroup key={section.type} heading={section.label}>
                {group.results.map((result) => (
                  <CommandItem
                    key={`${result.type}:${result.id}`}
                    value={`${result.type}:${result.id}`}
                    data-result-id={`${result.type}:${result.id}`}
                    onSelect={() => handleSelect(result.to)}
                  >
                    <Icon className="text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{result.title}</span>
                      {result.subtitle && (
                        <span className="truncate text-xs text-muted-foreground">
                          {result.subtitle}
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary" className="ml-auto shrink-0">
                      {SECTION_BADGE[result.type]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="Preview"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        const row = event.currentTarget.closest<HTMLElement>('[cmdk-item]')
                        if (row) togglePreviewFor(result, row)
                      }}
                    >
                      <Eye className="size-4" />
                    </Button>
                  </CommandItem>
                ))}
                {group.hiddenCount > 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    {group.hiddenCount} more — refine your search
                  </div>
                )}
              </CommandGroup>
            )
          })}
        </CommandList>
      </CommandDialog>
      <GlobalSearchResultPreview result={previewResult} anchorEl={previewAnchor} />
    </>
  )
}
