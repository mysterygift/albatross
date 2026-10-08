import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { FileSignature, FileText, MapPin, Plus, Settings2, Share, Trash2, UserRound } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { useEnrichedDocuments } from '@/features/documents/useEnrichedDocuments'
import { useCurrentProduction } from '@/features/productions/context'
import { EditTermsDialog } from '@/features/release-forms/EditTermsDialog'
import { NewReleaseDialog } from '@/features/release-forms/NewReleaseDialog'
import { saveStoredReleaseCopy } from '@/features/release-forms/exportReleasePdf'
import { useReleaseFormSettings } from '@/features/release-forms/useReleaseFormSettings'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import type { EnrichedDocument } from '@/lib/documents/enrichDocuments'
import { hardDeleteDocument } from '@/lib/documents/hardDeleteDocument'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import { getFileUrl, openInSystem, resolveAppDataPath } from '@/lib/files'
import { isIosPlatform } from '@/lib/platform'
import { formatSignedAt } from '@/lib/releaseForms/terms'

const SIGNED_TYPES: readonly string[] = [
  DOCUMENT_ENTITY_TYPES.signedContributorRelease,
  DOCUMENT_ENTITY_TYPES.signedLocationRelease,
]

export function ReleaseFormsPage() {
  const { currentProductionId } = useCurrentProduction()
  const queryClient = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const { data: settings } = useReleaseFormSettings()
  const { getCategoryDocuments, isLoading } = useEnrichedDocuments(currentProductionId)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const signed = getCategoryDocuments('releases').filter((d) => SIGNED_TYPES.includes(d.entity_type ?? ''))

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => hardDeleteDocument(docId),
    onSuccess: () => {
      if (currentProductionId) void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
      toast.success('Signed release deleted')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not delete the release'),
  })

  // On iOS, opening a file already shows the share sheet (Quick Look, Save to Files, AirDrop…).
  const ios = isIosPlatform()

  const handleOpen = async (doc: EnrichedDocument) => {
    try {
      await openInSystem(await getFileUrl(doc.file_path))
    } catch {
      // No Finder/Explorer to reveal the file in on iOS.
      if (ios) {
        toast.error('Could not open this file.')
        return
      }
      await revealItemInDir(await resolveAppDataPath(doc.file_path))
    }
  }

  const handleShare = async (doc: EnrichedDocument) => {
    try {
      await saveStoredReleaseCopy(doc)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save a copy')
    }
  }

  const handleDelete = async (doc: EnrichedDocument) => {
    const ok = await confirm({
      title: 'Delete this signed release?',
      description: `${doc.file_name} will be permanently removed from Documents. Copies already saved or shared are not affected.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) deleteMutation.mutate(doc.id)
  }

  return (
    <RequireProduction title="Release Forms">
      <div className="space-y-6" data-touch-targets>
        <PageHeader
          title="Release Forms"
          description="Bring up a contributor or location release, have it signed on screen, and file the PDF in Documents."
          actions={
            <>
              <Button variant="outline" onClick={() => setTermsOpen(true)} disabled={!settings}>
                <Settings2 />
                Edit terms
              </Button>
              <Button onClick={() => setNewOpen(true)}>
                <Plus />
                New Release
              </Button>
            </>
          }
        />

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : signed.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="No signed releases yet"
            description="Press New Release to bring up a contributor or location release for signing."
            action={
              <Button onClick={() => setNewOpen(true)}>
                <Plus />
                New Release
              </Button>
            }
          />
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {signed.map((doc) => {
              const isLocation = doc.entity_type === DOCUMENT_ENTITY_TYPES.signedLocationRelease
              const Icon = isLocation ? MapPin : UserRound
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                  <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.file_name}</p>
                    <p className="text-muted-foreground text-xs">
                      Signed {formatSignedAt(new Date(doc.created_at))}
                    </p>
                  </div>
                  <Badge variant="secondary">{isLocation ? 'Location' : 'Contributor'}</Badge>
                  <div className="flex gap-1">
                    {ios ? (
                      <Button variant="ghost" size="sm" onClick={() => void handleOpen(doc)}>
                        <Share />
                        Share
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => void handleOpen(doc)}>
                          <FileText />
                          Open
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleShare(doc)}>
                          <Share />
                          Save or share
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${doc.file_name}`}
                      onClick={() => void handleDelete(doc)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <NewReleaseDialog open={newOpen} onOpenChange={setNewOpen} />
      {settings && <EditTermsDialog open={termsOpen} onOpenChange={setTermsOpen} settings={settings} />}
      {confirmDialog}
    </RequireProduction>
  )
}
