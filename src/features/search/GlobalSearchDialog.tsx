import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Clapperboard,
  FileText,
  Film,
  MapPin,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { filterGlobalSearch } from '@/features/search/filterGlobalSearch'
import { useGlobalSearchIndex } from '@/features/search/useGlobalSearchIndex'
import {
  GLOBAL_SEARCH_SECTIONS,
  type GlobalSearchResultType,
} from '@/features/search/types'

const SECTION_ICON: Record<GlobalSearchResultType, LucideIcon> = {
  cast: Users,
  crew: Users,
  scene: Clapperboard,
  location: MapPin,
  equipment: Film,
  document: FileText,
  vendor: Building2,
  purchase_order: Receipt,
}

const SECTION_BADGE: Record<GlobalSearchResultType, string> = {
  cast: 'Cast',
  crew: 'Crew',
  scene: 'Scene',
  location: 'Location',
  equipment: 'Equipment',
  document: 'Document',
  vendor: 'Vendor',
  purchase_order: 'Purchase Order',
}

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
  const { results } = useGlobalSearchIndex(productionId, { enabled: open })

  const grouped = useMemo(
    () => filterGlobalSearch(results, query),
    [results, query]
  )

  const close = () => {
    onOpenChange(false)
    setQuery('')
  }

  const handleSelect = (to: string) => {
    close()
    navigate(to)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery('')
      }}
      title="Search"
      description="Search people, scenes, locations, documents, and purchase orders"
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search people, scenes, locations, documents, purchase orders…"
        value={query}
        onValueChange={setQuery}
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
  )
}
