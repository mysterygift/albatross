import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildStoryboardPdfData, generateStoryboardPdf } from '@/lib/pdf/storyboard'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'
import type { Scene, Shot, StoryboardImage } from '@/lib/db/types'

const ts = { created_at: 't', updated_at: 't', deleted_at: null }

/** A 1×1 PNG, built with pdf-lib's own decoder in mind. */
const PNG_1x1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
)

const scenes = [
  { id: 'sc1', production_id: 'p1', scene_number: '1', title: 'Opening', int_ext: null, day_night: null, location_id: null, ...ts },
  { id: 'sc2', production_id: 'p1', scene_number: '2', title: 'Chase', int_ext: null, day_night: null, location_id: null, ...ts },
] as unknown as Scene[]

const shots = [
  { id: 'a', scene_id: 'sc1', shot_number: '1A', shot_size: 'WS', shot_description: 'The harbour at dawn', subject: null, ...ts },
  { id: 'b', scene_id: 'sc1', shot_number: '1B', shot_size: null, shot_description: null, subject: 'Gull', ...ts },
  { id: 'c', scene_id: 'sc2', shot_number: '2A', shot_size: null, shot_description: null, subject: null, ...ts },
] as unknown as Shot[]

function image(id: string, shotId: string, sceneId: string, sortOrder: number, key: string): StoryboardImage {
  return { id, shot_id: shotId, scene_id: sceneId, sort_order: sortOrder, storage_key: key, ...ts } as unknown as StoryboardImage
}

const images = [
  image('i2', 'a', 'sc1', 1, 'a-2.png'),
  image('i1', 'a', 'sc1', 0, 'a-1.png'),
  image('i3', 'b', 'sc1', 0, 'b-1.webp'),
]

const base = { productionName: 'The Albatross', scopeLabel: 'All scenes', scenes, shots, images, locations: [] }

describe('buildStoryboardPdfData', () => {
  it('lists every panel in shot order, primary first, and leaves out scenes with no panels', () => {
    const data = buildStoryboardPdfData(base)
    expect(data.scenes.map((s) => s.sceneNumber)).toEqual(['1'])
    expect(data.scenes[0]!.panels).toEqual([
      { caption: 'Shot 1A | WS', detail: 'The harbour at dawn', storageKey: 'a-1.png' },
      { caption: 'Shot 1A (2)', detail: null, storageKey: 'a-2.png' },
      { caption: 'Shot 1B', detail: 'Gull', storageKey: 'b-1.webp' },
    ])
  })

  it('keeps only the shots in a given order', () => {
    const data = buildStoryboardPdfData({ ...base, shotOrder: ['b'] })
    expect(data.scenes[0]!.panels.map((p) => p.storageKey)).toEqual(['b-1.webp'])
  })
})

describe('generateStoryboardPdf', () => {
  it('embeds PNG panels and draws a placeholder for formats it cannot embed', async () => {
    const read: string[] = []
    const bytes = await generateStoryboardPdf(buildStoryboardPdfData(base), {
      readImage: async (key) => {
        read.push(key)
        return key.endsWith('.png') ? PNG_1x1 : new Uint8Array([0x52, 0x49, 0x46, 0x46])
      },
    })
    expect(read.sort()).toEqual(['a-1.png', 'a-2.png', 'b-1.webp'])
    // Load before extracting text: pdf.js takes over the buffer.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    const text = await extractPdfText(bytes)
    expect(text).toContain('STORYBOARD')
    expect(text).toContain('Shot 1A | WS')
    expect(text).toContain('The harbour at dawn')
    expect(text).toContain('Preview not available')
  })

  it('survives an image that cannot be read', async () => {
    const bytes = await generateStoryboardPdf(buildStoryboardPdfData(base), {
      readImage: async () => {
        throw new Error('missing file')
      },
    })
    expect(await extractPdfText(bytes)).toContain('Preview not available')
  })
})
