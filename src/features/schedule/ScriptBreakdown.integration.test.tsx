// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { ScriptBreakdownPage } from '@/features/schedule/script-breakdown-page'
import { breakdownCategory } from '@/lib/breakdown/categories'
import type { BreakdownElement, BreakdownTag, Location, Scene, ScriptPage, ScriptVersion } from '@/lib/db/types'

const listElements = vi.hoisted(() => vi.fn())
const listTags = vi.hoisted(() => vi.fn())
const createTag = vi.hoisted(() => vi.fn())
const listLocations = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db/repositories/scriptVersions', () => ({
  listScriptVersionsByProduction: vi.fn(async () => [version()]),
}))
vi.mock('@/lib/db/scriptSectionReconciliationService', () => ({
  formatScriptVersionLabel: (v: { version_label?: string | null; title?: string | null; id: string }) =>
    v.version_label ?? v.title ?? v.id,
}))
vi.mock('@/lib/db/repositories/schedule', () => ({ listScenesByProduction: vi.fn(async () => [scene()]) }))
vi.mock('@/lib/db/repositories/location', () => ({ listLocationsByProduction: listLocations }))
vi.mock('@/lib/db/repositories/scriptPages', () => ({ listScriptPagesByScriptVersion: vi.fn(async () => [page()]) }))
vi.mock('@/lib/db/repositories/person', () => ({ listCast: vi.fn(async () => []) }))
vi.mock('@/lib/db/repositories/equipment', () => ({ listEquipmentByProduction: vi.fn(async () => []) }))
vi.mock('@/lib/db/repositories/music-clearance', () => ({
  listMusicTracksByProduction: vi.fn(async () => []),
  listClearancesByProduction: vi.fn(async () => []),
}))
vi.mock('@/lib/db/repositories/scene-cast', () => ({ getCastIdsBySceneIds: vi.fn(async () => new Map()) }))
vi.mock('@/lib/db/repositories/episodes', () => ({ listEpisodesByProduction: vi.fn(async () => []) }))
vi.mock('@/lib/db/repositories/scriptRevisions', () => ({ markRevisionItemReviewed: vi.fn() }))
vi.mock('@/lib/db/repositories/scriptBreakdown', () => ({
  SCRIPT_BREAKDOWN_REMOTE_ERROR: 'remote',
  listBreakdownElements: listElements,
  listBreakdownTagsByScriptVersion: listTags,
  createBreakdownTag: createTag,
  createBreakdownTags: vi.fn(),
  deleteBreakdownTag: vi.fn(),
  moveBreakdownTag: vi.fn(),
  moveBreakdownTagToNewElement: vi.fn(),
  updateBreakdownElement: vi.fn(),
  mergeBreakdownElements: vi.fn(),
  deleteBreakdownElement: vi.fn(),
  carryBreakdownTagsForward: vi.fn(async () => ({ carried: 0, moved: 0, unmatched: 0 })),
  listBreakdownRevisionReview: vi.fn(async () => []),
}))
vi.mock('@/lib/documents/persistDocument', () => ({
  persistProductionDocument: vi.fn(),
  documentsQueryKey: (id: string) => ['documents', id],
}))
vi.mock('@/lib/files', () => ({ saveFileWithDialog: vi.fn() }))
const touchDevice = vi.hoisted(() => ({ on: false }))
vi.mock('@/lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/platform')>()),
  isMobilePlatform: () => touchDevice.on,
}))
const phoneWidth = vi.hoisted(() => ({ on: false }))
vi.mock('@/hooks/use-is-phone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-is-phone')>()),
  usePhoneWidth: () => phoneWidth.on,
}))
vi.mock('@/hooks/useEffectiveDataSourceForProduction', () => ({
  useEffectiveDataSourceForProduction: () => ({ dataSourceKey: 'local_sqlite' }),
}))
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: 'prod-1',
    currentProduction: { id: 'prod-1', name: 'Whiteridge', production_code: 'WR-26/A', is_episodic: false },
  }),
}))

const soft = { created_at: 't', updated_at: '2026-10-01T09:00:00Z', deleted_at: null as string | null }
const CONTENT = 'EXT. BEACH - DAY\n\nMary opens a red umbrella.'

function version(): ScriptVersion {
  return {
    id: 'ver-1', production_id: 'prod-1', episode_id: null, title: 'Shooting Script', version_label: 'White',
    revision_colour: null, is_locked: 0, locked_pages_json: null, previous_script_version_id: null, ...soft,
  }
}
function scene(): Scene {
  return {
    id: 'scene-1', production_id: 'prod-1', episode_id: null, scene_number: '3', title: 'EXT. BEACH - DAY',
    description: 'Mary loses her umbrella', int_ext: 'EXT', day_night: 'DAY', page_eighths: null, location_id: null,
    duration_minutes: null, ...soft,
  }
}
function page(): ScriptPage {
  return { id: 'page-1', script_version_id: 'ver-1', scene_id: 'scene-1', page_number: '4', page_index: 0, content: CONTENT, eighths: 3, ...soft }
}
function element(id: string, category: BreakdownElement['category'], name: string): BreakdownElement {
  return { id, production_id: 'prod-1', category, name, notes: null, manual_status: 'needed', linked_entity_type: null, linked_entity_id: null, ...soft }
}
function tag(id: string, elementId: string, text: string): BreakdownTag {
  const at = CONTENT.indexOf(text)
  return {
    id, production_id: 'prod-1', element_id: elementId, script_version_id: 'ver-1', scene_id: 'scene-1',
    start_page_id: 'page-1', start_offset: at, end_page_id: 'page-1', end_offset: at + text.length,
    tagged_text: text, carried_from_id: null, ...soft,
  }
}

/** jsdom normalises colours in inline styles to rgb(). */
function rgbOf(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16)
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ScriptBreakdownPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Script Breakdown page', () => {
  beforeEach(() => {
    listElements.mockResolvedValue([element('el-prop', 'props', 'Red umbrella'), element('el-costume', 'costume', 'Umbrella'), element('el-beach', 'locations', 'BEACH')])
    listTags.mockResolvedValue([tag('t1', 'el-prop', 'red umbrella'), tag('t2', 'el-costume', 'umbrella'), tag('t3', 'el-beach', 'BEACH')])
    listLocations.mockResolvedValue([{ ...soft, id: 'loc-1', production_id: 'prod-1', name: 'Beach', booked_status: 'booked' } as Location])
    createTag.mockResolvedValue({ tagId: 'new', elementId: 'el-new', createdElement: true })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    touchDevice.on = false
    phoneWidth.on = false
    window.getSelection()?.removeAllRanges()
  })

  it('stacks the colours of overlapping tags in one highlight', async () => {
    renderPage()
    const script = await screen.findByLabelText('Script text')
    await waitFor(() => expect(within(script).getAllByText('umbrella').length).toBeGreaterThan(0))
    const stacked = within(script).getByText('umbrella', { selector: 'mark' })
    const background = stacked.getAttribute('style') ?? ''
    expect(background).toContain('linear-gradient(180deg')
    expect(background).toContain(rgbOf(breakdownCategory('props').colour))
    expect(background).toContain(rgbOf(breakdownCategory('costume').colour))
    // "red " is only a prop.
    expect(within(script).getByText('red', { selector: 'mark', exact: false }).getAttribute('style')).not.toContain('linear-gradient')
  })

  it('tags highlighted words with the pressed category', async () => {
    renderPage()
    const script = await screen.findByLabelText('Script text')
    await waitFor(() => expect(script.querySelector('mark')).not.toBeNull())
    const cell = [...script.querySelectorAll<HTMLElement>('[data-page-id]')].find((el) => el.textContent?.startsWith('Mary'))!
    const textNode = cell.querySelector('[data-chunk-start="0"]')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 1) // "ary" — snaps out to "Mary"
    range.setEnd(textNode, 4)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    fireEvent.mouseUp(cell)

    expect((await screen.findByRole('dialog', { name: 'Tag selection' })).textContent).toContain('“Mary”')
    await userEvent.keyboard('1')
    await waitFor(() => expect(createTag).toHaveBeenCalledTimes(1))
    const at = CONTENT.indexOf('Mary')
    expect(createTag).toHaveBeenCalledWith({
      scriptVersionId: 'ver-1',
      sceneId: 'scene-1',
      category: 'cast',
      range: { startPageId: 'page-1', startOffset: at, endPageId: 'page-1', endOffset: at + 4 },
      text: 'Mary',
    })
  })

  it('on a touch screen, follows the selection handles and keeps the picker when a tap clears the selection', async () => {
    touchDevice.on = true
    renderPage()
    const script = await screen.findByLabelText('Script text')
    await waitFor(() => expect(script.querySelector('mark')).not.toBeNull())
    expect(screen.getByText(/Press and hold a word/)).toBeTruthy()
    const cell = [...script.querySelectorAll<HTMLElement>('[data-page-id]')].find((el) => el.textContent?.startsWith('Mary'))!
    const textNode = cell.querySelector('[data-chunk-start="0"]')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 4)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))

    const picker = await screen.findByRole('dialog', { name: 'Tag selection' })
    // iOS clears the selection as the button is tapped; the picker must stay.
    sel.removeAllRanges()
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((r) => setTimeout(r, 450))
    await userEvent.click(within(picker).getByRole('button', { name: /Props/ }))
    await waitFor(() => expect(createTag).toHaveBeenCalledTimes(1))
    expect(createTag.mock.calls[0]![0]).toMatchObject({ category: 'props', text: 'Mary' })
  })

  it('on a phone, swaps the scene list for a scene picker and docks the category picker to the bottom', async () => {
    phoneWidth.on = true
    renderPage()
    const script = await screen.findByLabelText('Script text')
    await waitFor(() => expect(script.querySelector('mark')).not.toBeNull())
    expect(screen.queryByRole('navigation', { name: 'Scenes' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Next scene' })).toBeTruthy()

    const cell = [...script.querySelectorAll<HTMLElement>('[data-page-id]')].find((el) => el.textContent?.startsWith('Mary'))!
    const textNode = cell.querySelector('[data-chunk-start="0"]')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 4)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent.mouseUp(cell)
    const picker = await screen.findByRole('dialog', { name: 'Tag selection' })
    expect(picker.className).toContain('fixed')
    expect(picker.className).toContain('bottom-0')
  })

  it('fills the sheet from the scene and production, and matches a location already on Locations', async () => {
    renderPage()
    await screen.findByLabelText('Script text')
    await userEvent.click(screen.getByRole('tab', { name: 'Sheet' }))
    const sheet = await screen.findByLabelText('Breakdown sheet for scene 3')
    expect(sheet.textContent).toContain('WR-26/A')
    expect(sheet.textContent).toContain('Mary loses her umbrella')
    expect(within(sheet).getByLabelText('Locations').textContent).toContain('BEACH')

    await userEvent.click(screen.getByRole('tab', { name: 'Elements' }))
    const locations = await screen.findByRole('region', { name: 'Locations' })
    expect(locations.textContent).toContain('On Locations · booked')
    expect(locations.textContent).toContain('Sourced')
    const props = screen.getByRole('region', { name: 'Props' })
    expect(props.textContent).toContain('Needed')
  })
})
