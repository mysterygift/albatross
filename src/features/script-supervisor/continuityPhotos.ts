import { uuid } from '@/lib/db/client'
import { buildContinuityMediaInsert } from '@/lib/db/repositories/scriptAnnotations'
import { assertScriptSupervisorLocal } from '@/lib/db/repositories/scriptSupervisor'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import { continuityPhotoFileName } from '@/lib/script-supervisor/annotations'

export type AddContinuityPhotosInput = {
  productionId: string
  files: File[]
  slateId: string | null
  slateLabel: string | null
  takeId: string | null
  takeNumber: number | null
  sceneId: string | null
  tags: string[]
}

const MAX_PHOTO_BYTES = 40 * 1024 * 1024

/**
 * Stores continuity photos (SS8): each file is written to app storage as a document of type
 * 'continuity_photo' together with its continuity_media row, in one transaction per photo.
 */
export async function addContinuityPhotos(input: AddContinuityPhotosInput): Promise<number> {
  await assertScriptSupervisorLocal(input.productionId)
  const images = input.files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/i.test(f.name))
  if (images.length === 0) throw new Error('Choose one or more photos')
  const tooBig = images.find((f) => f.size > MAX_PHOTO_BYTES)
  if (tooBig) throw new Error(`${tooBig.name} is larger than 40 MB`)

  for (const file of images) {
    const documentId = uuid()
    const bytes = new Uint8Array(await file.arrayBuffer())
    await persistProductionDocument({
      productionId: input.productionId,
      documentId,
      fileName: continuityPhotoFileName(file.name, input.slateLabel, input.takeNumber),
      bytes,
      mimeType: file.type || null,
      entityType: DOCUMENT_ENTITY_TYPES.continuityPhoto,
      entityId: input.slateId ?? input.sceneId,
      extraStatements: buildContinuityMediaInsert({
        productionId: input.productionId,
        documentId,
        slateId: input.slateId,
        takeId: input.takeId,
        sceneId: input.sceneId,
        tags: input.tags,
      }),
    })
  }
  return images.length
}
