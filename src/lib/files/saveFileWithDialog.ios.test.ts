// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const save = vi.fn()
const writeFile = vi.fn(async () => {})
const mkdir = vi.fn(async () => {})
const readFile = vi.fn(async () => new Uint8Array([1, 2, 3]))
const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })

vi.mock('@tauri-apps/plugin-dialog', () => ({ save, open: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 14, Document: 6 },
  copyFile: vi.fn(),
  exists: vi.fn(),
  mkdir,
  readFile,
  remove: vi.fn(),
  writeFile,
  writeTextFile: vi.fn(),
}))
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(async () => '/app'),
  documentDir: vi.fn(async () => '/docs'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => p }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn(), openUrl: vi.fn() }))
vi.mock('@/components/ui/sonner', () => ({ toast }))

const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'

describe('saveFileWithDialog on iOS', () => {
  const share = vi.fn(async () => {})

  beforeEach(() => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: IPAD_UA, maxTouchPoints: 5, share, canShare: () => true })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('writes to the exports folder and opens the share sheet instead of a Save dialog', async () => {
    const { saveFileWithDialog } = await import('@/lib/files')
    const path = await saveFileWithDialog({ defaultPath: 'Call Sheet: Day 1.pdf' }, new Uint8Array([9]))

    expect(save).not.toHaveBeenCalled()
    expect(path).toBe('/docs/Exports/Call Sheet- Day 1.pdf')
    expect(writeFile).toHaveBeenCalledWith('/docs/Exports/Call Sheet- Day 1.pdf', new Uint8Array([9]))
    expect(share).toHaveBeenCalledTimes(1)
    const shared = (share.mock.calls[0] as unknown as [ShareData])[0].files![0]
    expect(shared.name).toBe('Call Sheet- Day 1.pdf')
    expect(shared.type).toBe('application/pdf')
  })

  it('offers a Share button when the share sheet needs a fresh tap', async () => {
    share.mockRejectedValueOnce(Object.assign(new Error('gesture expired'), { name: 'NotAllowedError' }))
    const { saveFileWithDialog } = await import('@/lib/files')
    await saveFileWithDialog({ defaultPath: 'budget.csv' }, 'a,b', true)

    expect(toast).toHaveBeenCalledWith('"budget.csv" is ready', expect.objectContaining({ action: expect.any(Object) }))
  })
})
