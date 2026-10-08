import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const openUrl = vi.fn()
const revealItemInDir = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...a: unknown[]) => openUrl(...a),
  revealItemInDir: (...a: unknown[]) => revealItemInDir(...a),
}))

import { buildMailtoUrl, openMailDraft } from '@/lib/day-pack/composeMail'

const draft = {
  to: ['ada@example.com'],
  cc: ['agent+ada@example.com'],
  subject: 'Call sheet & docs – Day 3',
  body: 'Hi Ada,\n\nSee attached?',
}

describe('buildMailtoUrl', () => {
  it('encodes subject, body (CRLF line breaks) and CC', () => {
    expect(buildMailtoUrl(draft)).toBe(
      'mailto:ada@example.com?cc=agent%2Bada@example.com&subject=Call%20sheet%20%26%20docs%20%E2%80%93%20Day%203&body=Hi%20Ada%2C%0D%0A%0D%0ASee%20attached%3F'
    )
  })

  it('omits cc when there is none', () => {
    expect(buildMailtoUrl({ ...draft, cc: [] })).not.toContain('cc=')
  })
})

describe('openMailDraft', () => {
  beforeEach(() => {
    invoke.mockReset()
    openUrl.mockReset()
    revealItemInDir.mockReset()
  })

  const args = { ...draft, attachmentPaths: ['/a/call-sheet.pdf'], folderPath: '/a' }

  it('uses the native compose window when it is available', async () => {
    invoke.mockResolvedValue(undefined)
    expect(await openMailDraft(args)).toEqual({ route: 'native' })
    expect(invoke).toHaveBeenCalledWith('compose_mail_draft', {
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      body: draft.body,
      attachments: ['/a/call-sheet.pdf'],
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('falls back to mailto and reveals the folder when native compose is unsupported', async () => {
    invoke.mockRejectedValue('unsupported')
    expect(await openMailDraft(args)).toEqual({ route: 'mailto', reason: null })
    expect(openUrl).toHaveBeenCalledWith(buildMailtoUrl(draft))
    expect(revealItemInDir).toHaveBeenCalledWith('/a')
  })

  it('passes on why the native draft failed, e.g. Outlook automation not allowed', async () => {
    invoke.mockRejectedValue('unsupported: Albatross is not allowed to control Outlook')
    expect(await openMailDraft(args)).toEqual({ route: 'mailto', reason: 'Albatross is not allowed to control Outlook' })
    expect(openUrl).toHaveBeenCalled()
  })

  it('passes other native errors on', async () => {
    invoke.mockRejectedValue('attachment outside the day-packs folder')
    await expect(openMailDraft(args)).rejects.toThrow(/outside/)
    expect(openUrl).not.toHaveBeenCalled()
  })
})
