import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import { generateReleaseFormPdf, type ReleaseFormPdfInput } from '@/lib/pdf/releaseForm'
import type { ReleaseFormType } from '@/lib/releaseForms/terms'

export const SIGNED_RELEASE_ENTITY_TYPES: Record<ReleaseFormType, string> = {
  contributor: DOCUMENT_ENTITY_TYPES.signedContributorRelease,
  location: DOCUMENT_ENTITY_TYPES.signedLocationRelease,
}

export type SignedReleaseExport = {
  bytes: Uint8Array
  fileName: string
  documentId: string
}

/** e.g. `contributor-release-jane-smith-2026-10-08-1432.pdf`, in local time. */
export function releasePdfFileName(formType: ReleaseFormType, signerName: string, signedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${signedAt.getFullYear()}-${pad(signedAt.getMonth() + 1)}-${pad(signedAt.getDate())}-${pad(signedAt.getHours())}${pad(signedAt.getMinutes())}`
  const name = sanitizeForFilename(signerName)
  return `${formType}-release-${name === 'recipient' ? 'signed' : name}-${stamp}.pdf`
}

/**
 * Renders a signed release and stores it in Documents → Releases. The PDF is written once and
 * never regenerated, so later edits to the terms cannot change a signed agreement.
 */
export async function signReleaseForm(args: {
  productionId: string
  formType: ReleaseFormType
  pdf: ReleaseFormPdfInput
}): Promise<SignedReleaseExport> {
  const bytes = await generateReleaseFormPdf(args.pdf)
  const fileName = releasePdfFileName(args.formType, args.pdf.signer.name, args.pdf.signedAt)
  const { documentId } = await persistProductionDocument({
    productionId: args.productionId,
    fileName,
    bytes,
    mimeType: 'application/pdf',
    entityType: SIGNED_RELEASE_ENTITY_TYPES[args.formType],
  })
  return { bytes, fileName, documentId }
}
