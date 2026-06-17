import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { EnrichedDocument } from '@/lib/documents/enrichDocuments'
import type { DocumentCategoryConfig } from '@/lib/documents/catalog'

type DocumentCategoryCardProps = {
  category: DocumentCategoryConfig
  count: number
  recent: EnrichedDocument[]
}

export function DocumentCategoryCard({ category, count, recent }: DocumentCategoryCardProps) {
  const Icon = category.icon

  return (
    <Link to={`/documents/${category.id}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-muted-foreground/30 hover:bg-muted/20">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base">{category.label}</CardTitle>
                <CardDescription className="text-xs">{category.description}</CardDescription>
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-2xl font-semibold tabular-nums">{count}</p>
          {recent.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {recent.map((doc) => (
                <li key={doc.id} className="truncate">
                  {doc.file_name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No files yet</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
