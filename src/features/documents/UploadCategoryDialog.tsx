import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategoryId,
} from '@/lib/documents/catalog'

type UploadCategoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (categoryId: DocumentCategoryId) => void
  isUploading?: boolean
}

export function UploadCategoryDialog({
  open,
  onOpenChange,
  onConfirm,
  isUploading,
}: UploadCategoryDialogProps) {
  const [selected, setSelected] = useState<DocumentCategoryId>('general')

  useEffect(() => {
    if (open) setSelected('general')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => !isUploading && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a category</DialogTitle>
          <DialogDescription>
            Select where this file should appear in Documents. You can pick a file after confirming.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto py-1">
          {DOCUMENT_CATEGORIES.map((category) => {
            const Icon = category.icon
            const isSelected = selected === category.id
            return (
              <li key={category.id}>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setSelected(category.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 rounded-md border p-2',
                      isSelected ? 'border-primary/30 bg-primary/10' : 'border-border bg-muted/30'
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{category.label}</p>
                    <p className="text-xs text-muted-foreground">{category.description}</p>
                  </div>
                  {isSelected && <Check className="mt-1 size-4 shrink-0 text-primary" />}
                </button>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading…' : 'Choose file…'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
