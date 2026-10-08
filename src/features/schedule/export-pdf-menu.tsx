import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/sonner'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import type { ScheduleExportActor } from '@/lib/schedule/scheduleExportSources'
import type { ScheduleExportResult } from './scheduleExports'

export type ExportPdfOption = {
  label: string
  disabled?: boolean
  run: (actor: ScheduleExportActor) => Promise<ScheduleExportResult>
}

/** "Export PDF" button with a scope menu; files the PDF in Documents and offers a save dialog. */
export function ExportPdfMenu({
  productionId,
  options,
  disabled,
}: {
  productionId: string | null
  options: ExportPdfOption[]
  disabled?: boolean
}) {
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const exportMutation = useMutation({
    mutationFn: async (option: ExportPdfOption) => {
      const actor =
        authSession.authSupported && authSession.currentUser
          ? { db: await getDb(), actor: authSession.currentUser }
          : null
      return option.run(actor)
    },
    onSuccess: () => {
      if (productionId) void queryClient.invalidateQueries({ queryKey: documentsQueryKey(productionId) })
      toast.success('Saved to Documents › Script & sides')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" disabled={disabled || !productionId || exportMutation.isPending}>
          <FileDown className="size-4" />
          {exportMutation.isPending ? 'Exporting…' : 'Export PDF'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.label}
            disabled={option.disabled}
            onClick={() => exportMutation.mutate(option)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
