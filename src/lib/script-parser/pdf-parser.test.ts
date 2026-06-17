import { beforeEach, describe, expect, it, vi } from 'vitest'

const pdfjsMock = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: 'mock-worker' },
}))

vi.mock('pdfjs-dist', () => pdfjsMock)

import { extractPdfLines, parsePdfScript, PdfParseError } from './pdf-parser'

type Segment = { str: string; x: number; width?: number }
type Line = { y: number; segments: Segment[] }

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792

function makeItem(str: string, x: number, y: number, width: number) {
  return { str, transform: [12, 0, 0, 12, x, y], width, height: 12 }
}

function makePageItems(lines: Line[]) {
  const items = lines.flatMap((line) =>
    line.segments.map((seg) => makeItem(seg.str, seg.x, line.y, seg.width ?? seg.str.length * 7))
  )
  return { items, styles: {} }
}

function mockPdf(pages: Line[][], numPages?: number) {
  const total = numPages ?? pages.length
  pdfjsMock.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: total,
      getPage: async (pageNumber: number) => ({
        getViewport: () => ({ width: PAGE_WIDTH, height: PAGE_HEIGHT }),
        getTextContent: async () => makePageItems(pages[pageNumber - 1] ?? []),
      }),
    }),
  })
}

const MARGIN = 108
const DIALOGUE = 180
const CUE = 288
const NUM_LEFT = 72
const NUM_RIGHT = 540

function headingLine(num: string, heading: string, y: number): Line {
  return {
    y,
    segments: [
      { str: num, x: NUM_LEFT, width: 12 },
      { str: heading, x: MARGIN, width: 150 },
      { str: num, x: NUM_RIGHT, width: 12 },
    ],
  }
}

const bytes = new Uint8Array([1, 2, 3, 4])

describe('extractPdfLines', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reconstructs lines top-to-bottom and joins same-row items with spacing', async () => {
    mockPdf([
      [
        headingLine('12', 'INT. KITCHEN - DAY', 720),
        { y: 700, segments: [{ str: 'JANE walks in.', x: MARGIN, width: 120 }] },
      ],
    ])
    const lines = await extractPdfLines(bytes)
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text).toBe('12 INT. KITCHEN - DAY 12')
    expect(lines[0]!.page).toBe(1)
    expect(lines[0]!.pageWidth).toBe(PAGE_WIDTH)
    expect(lines[0]!.pageHeight).toBe(PAGE_HEIGHT)
    expect(lines[0]!.y).toBeGreaterThan(lines[1]!.y)
    expect(lines[1]!.text).toBe('JANE walks in.')
  })

  it('throws no-text-layer when the PDF has no extractable text', async () => {
    mockPdf([[]])
    await expect(extractPdfLines(bytes)).rejects.toMatchObject({ code: 'no-text-layer' })
  })

  it('throws too-many-pages when the document exceeds the cap', async () => {
    mockPdf([[]], 500)
    await expect(extractPdfLines(bytes, { maxPages: 400 })).rejects.toMatchObject({
      code: 'too-many-pages',
    })
  })

  it('calls onProgress after each page', async () => {
    mockPdf([
      [{ y: 720, segments: [{ str: 'INT. ROOM - DAY', x: MARGIN, width: 120 }] }],
      [{ y: 720, segments: [{ str: 'EXT. YARD - NIGHT', x: MARGIN, width: 130 }] }],
    ])
    const progress: Array<{ page: number; total: number }> = []
    await extractPdfLines(bytes, { onProgress: (page, total) => progress.push({ page, total }) })
    expect(progress).toEqual([
      { page: 1, total: 2 },
      { page: 2, total: 2 },
    ])
  })
})

describe('parsePdfScript', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws no-text-layer for a document with no text items', async () => {
    mockPdf([[]])
    await expect(parsePdfScript(bytes)).rejects.toBeInstanceOf(PdfParseError)
    await expect(parsePdfScript(bytes)).rejects.toMatchObject({ code: 'no-text-layer' })
  })

  it('detects scenes, margin scene numbers, int/ext, day/night, and real pages', async () => {
    mockPdf([
      [
        headingLine('12', 'INT. KITCHEN - DAY', 720),
        { y: 700, segments: [{ str: 'JANE walks in.', x: MARGIN, width: 120 }] },
        { y: 680, segments: [{ str: 'JANE', x: CUE, width: 40 }] },
        { y: 664, segments: [{ str: 'Hello there.', x: DIALOGUE, width: 100 }] },
      ],
      [
        headingLine('13', 'EXT. STREET - NIGHT', 720),
        { y: 700, segments: [{ str: 'A car passes.', x: MARGIN, width: 110 }] },
        { y: 680, segments: [{ str: 'JOHN', x: CUE, width: 40 }] },
        { y: 664, segments: [{ str: 'Over here.', x: DIALOGUE, width: 90 }] },
      ],
    ])

    const scenes = await parsePdfScript(bytes)
    expect(scenes).toHaveLength(2)

    expect(scenes[0]).toMatchObject({
      scene_number: '12',
      title: 'KITCHEN - DAY',
      location: 'KITCHEN',
      int_ext: 'INT',
      day_night: 'DAY',
      start_page: '1',
      end_page: '1',
      start_offset: null,
      end_offset: null,
    })
    expect(scenes[0]!.characters).toEqual(['JANE'])
    expect(scenes[0]!.page_eighths).toBeGreaterThanOrEqual(1)
    expect(scenes[0]!.content).toContain('INT. KITCHEN - DAY')
    expect(scenes[0]!.elements?.some((e) => e.type === 'scene_heading')).toBe(true)
    expect(scenes[0]!.elements?.some((e) => e.type === 'character')).toBe(true)
    expect(scenes[0]!.elements?.some((e) => e.type === 'dialogue')).toBe(true)
    expect(scenes[0]!.dialogue).toEqual([{ character: 'JANE', text: 'Hello there.' }])

    expect(scenes[1]).toMatchObject({
      scene_number: '13',
      title: 'STREET - NIGHT',
      location: 'STREET',
      int_ext: 'EXT',
      day_night: 'NIGHT',
      start_page: '2',
      end_page: '2',
    })
    expect(scenes[1]!.characters).toEqual(['JOHN'])
  })

  it('uses printed header page numbers for start_page/end_page', async () => {
    mockPdf([
      [
        { y: 780, segments: [{ str: '12.', x: 500, width: 20 }] },
        headingLine('12', 'INT. KITCHEN - DAY', 720),
        { y: 700, segments: [{ str: 'Action.', x: MARGIN, width: 60 }] },
      ],
      [
        { y: 780, segments: [{ str: '13A', x: 500, width: 24 }] },
        headingLine('13', 'EXT. STREET - NIGHT', 720),
        { y: 700, segments: [{ str: 'More action.', x: MARGIN, width: 80 }] },
      ],
    ])

    const scenes = await parsePdfScript(bytes)
    expect(scenes[0]!.start_page).toBe('12')
    expect(scenes[0]!.end_page).toBe('12')
    expect(scenes[0]!.content).not.toContain('12.')
    expect(scenes[1]!.start_page).toBe('13A')
    expect(scenes[1]!.end_page).toBe('13A')
  })

  it('parses broadened heading prefixes without a trailing period', async () => {
    mockPdf([
      [
        { y: 720, segments: [{ str: 'INT/EXT CAR - DAY', x: MARGIN, width: 160 }] },
        { y: 700, segments: [{ str: 'Driving.', x: MARGIN, width: 70 }] },
      ],
      [
        { y: 720, segments: [{ str: 'EST CITY SKYLINE - DAWN', x: MARGIN, width: 200 }] },
      ],
    ])
    const scenes = await parsePdfScript(bytes)
    expect(scenes).toHaveLength(2)
    expect(scenes[0]).toMatchObject({ title: 'CAR - DAY', location: 'CAR', int_ext: 'MIXED' })
    expect(scenes[1]).toMatchObject({
      title: 'CITY SKYLINE - DAWN',
      location: 'CITY SKYLINE',
      int_ext: 'EXT',
      day_night: 'DAWN',
    })
  })

  it('strips continuation tags from scene titles', async () => {
    mockPdf([
      [
        {
          y: 720,
          segments: [{ str: 'INT. OFFICE - DAY (CONTINUED)', x: MARGIN, width: 220 }],
        },
        { y: 700, segments: [{ str: 'Work continues.', x: MARGIN, width: 100 }] },
      ],
    ])
    const scenes = await parsePdfScript(bytes)
    expect(scenes[0]!.title).toBe('OFFICE - DAY')
    expect(scenes[0]!.day_night).toBe('DAY')
  })

  it('stitches (MORE)/(CONT\'D) dialogue across a page break', async () => {
    mockPdf([
      [
        headingLine('1', 'INT. ROOM - DAY', 720),
        { y: 680, segments: [{ str: 'JANE', x: CUE, width: 40 }] },
        { y: 664, segments: [{ str: 'First part.', x: DIALOGUE, width: 80 }] },
        { y: 648, segments: [{ str: '(MORE)', x: CUE, width: 50 }] },
      ],
      [
        { y: 720, segments: [{ str: "JANE (CONT'D)", x: CUE, width: 90 }] },
        { y: 704, segments: [{ str: 'Second part.', x: DIALOGUE, width: 90 }] },
        headingLine('2', 'EXT. YARD - NIGHT', 400),
      ],
    ])
    const scenes = await parsePdfScript(bytes)
    expect(scenes[0]!.dialogue).toEqual([
      { character: 'JANE', text: 'First part. Second part.' },
    ])
  })

  it('spans real page boundaries for a scene that continues across pages', async () => {
    mockPdf([
      [
        headingLine('1', 'INT. OFFICE - DAY', 720),
        { y: 680, segments: [{ str: 'Action one.', x: MARGIN, width: 100 }] },
        { y: 120, segments: [{ str: 'Action two.', x: MARGIN, width: 100 }] },
      ],
      [
        { y: 720, segments: [{ str: 'Action three.', x: MARGIN, width: 110 }] },
        headingLine('2', 'EXT. PARK - NIGHT', 400),
      ],
    ])

    const scenes = await parsePdfScript(bytes)
    expect(scenes).toHaveLength(2)
    expect(scenes[0]!.start_page).toBe('1')
    expect(scenes[0]!.end_page).toBe('2')
    expect(scenes[0]!.page_eighths!).toBeGreaterThan(1)
    expect(scenes[1]!.start_page).toBe('2')
  })

  it('uses viewport geometry so sparse pages do not inflate eighths to a full page', async () => {
    mockPdf([
      [
        headingLine('1', 'INT. OFFICE - DAY', 720),
        { y: 700, segments: [{ str: 'Brief action.', x: MARGIN, width: 90 }] },
      ],
    ])
    const scenes = await parsePdfScript(bytes)
    // ~20pt of content in a ~648pt content area should round to well under 8 eighths.
    expect(scenes[0]!.page_eighths!).toBeLessThan(8)
  })

  it('falls back to incremental numbering when no margin scene number is present', async () => {
    mockPdf([
      [
        { y: 720, segments: [{ str: 'INT. CAR - DAY', x: MARGIN, width: 120 }] },
        { y: 700, segments: [{ str: 'Driving.', x: MARGIN, width: 70 }] },
      ],
    ])
    const scenes = await parsePdfScript(bytes)
    expect(scenes).toHaveLength(1)
    expect(scenes[0]!.scene_number).toBe('1')
    expect(scenes[0]!.title).toBe('CAR - DAY')
  })
})
