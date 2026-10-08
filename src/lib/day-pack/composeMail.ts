/**
 * Open an email draft for one recipient. On macOS the native command opens a draft with the files
 * attached in the default mail app when that is Apple Mail or Microsoft Outlook. On iPad and iPhone
 * it shows the in-app mail composer (Mail account set up) or else the share sheet, and resolves
 * when the user is done. Otherwise (other apps, other platforms, no Mail account on a Mac, Outlook
 * automation not allowed) a `mailto:` draft opens instead; `mailto:` cannot carry attachments, so
 * the person's folder is revealed to drag them in (not on iOS, which has no file manager to show).
 */
import { invoke } from '@tauri-apps/api/core'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import { isIosPlatform } from '@/lib/platform'

export type MailDraft = {
  to: string[]
  cc: string[]
  subject: string
  body: string
}

/** Error prefix the native command returns when it cannot compose here (`unsupported: <reason>`). */
export const MAIL_COMPOSE_UNSUPPORTED = 'unsupported'

function encodeMailtoPart(value: string): string {
  // RFC 6068: line breaks are CRLF; '@' may stay literal in addresses.
  return encodeURIComponent(value.replace(/\r?\n/g, '\r\n')).replace(/%40/g, '@')
}

/** `mailto:` URL with To, CC, subject and body (RFC 6068). */
export function buildMailtoUrl(draft: MailDraft): string {
  const to = draft.to.map(encodeMailtoPart).join(',')
  const query = [
    draft.cc.length > 0 ? `cc=${draft.cc.map(encodeMailtoPart).join(',')}` : null,
    `subject=${encodeMailtoPart(draft.subject)}`,
    `body=${encodeMailtoPart(draft.body)}`,
  ].filter(Boolean)
  return `mailto:${to}?${query.join('&')}`
}

/**
 * `opened`: a draft is open in the Mac mail app (the user sends it there). `sent`, `saved`,
 * `cancelled`, `failed`: how the iOS mail composer was closed.
 */
export type MailDraftOutcome = 'opened' | 'sent' | 'saved' | 'cancelled' | 'failed'

export type OpenMailDraftResult =
  | { route: 'native'; outcome: MailDraftOutcome }
  /** iOS share sheet (no Mail account): recipients were copied to the clipboard to paste into To. */
  | { route: 'share'; completed: boolean }
  /** The files still need attaching by hand; `reason` says why the native draft was not used. */
  | { route: 'mailto'; reason: string | null }

const NATIVE_OUTCOMES: readonly MailDraftOutcome[] = ['opened', 'sent', 'saved', 'cancelled', 'failed']

/** Reads the native command's result text (`opened`, `sent`, …, `share:completed`, `share:cancelled`). */
export function parseMailDraftOutcome(raw: unknown): OpenMailDraftResult {
  const text = typeof raw === 'string' ? raw : ''
  if (text.startsWith('share:')) return { route: 'share', completed: text === 'share:completed' }
  const outcome = (NATIVE_OUTCOMES as readonly string[]).includes(text) ? (text as MailDraftOutcome) : 'opened'
  return { route: 'native', outcome }
}

/** `attachmentPaths` and `folderPath` are absolute. */
export async function openMailDraft(
  draft: MailDraft & { attachmentPaths: string[]; folderPath: string }
): Promise<OpenMailDraftResult> {
  try {
    const raw = await invoke('compose_mail_draft', {
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      body: draft.body,
      attachments: draft.attachmentPaths,
    })
    return parseMailDraftOutcome(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.startsWith(MAIL_COMPOSE_UNSUPPORTED)) throw new Error(message)
    await openUrl(buildMailtoUrl(draft))
    if (!isIosPlatform()) await revealItemInDir(draft.folderPath)
    const reason = message.slice(MAIL_COMPOSE_UNSUPPORTED.length).replace(/^:\s*/, '').trim()
    return { route: 'mailto', reason: reason || null }
  }
}
