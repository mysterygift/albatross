/**
 * Open an email draft for one recipient. On macOS the native command opens a draft with the files
 * attached in the default mail app when that is Apple Mail or Microsoft Outlook. Otherwise (other
 * apps, other platforms, no Mail account, Outlook automation not allowed) a `mailto:` draft opens
 * instead; `mailto:` cannot carry attachments, so the person's folder is revealed to drag them in.
 */
import { invoke } from '@tauri-apps/api/core'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'

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

export type OpenMailDraftResult =
  | { route: 'native' }
  /** The files still need attaching by hand; `reason` says why the native draft was not used. */
  | { route: 'mailto'; reason: string | null }

/** `attachmentPaths` and `folderPath` are absolute. */
export async function openMailDraft(
  draft: MailDraft & { attachmentPaths: string[]; folderPath: string }
): Promise<OpenMailDraftResult> {
  try {
    await invoke('compose_mail_draft', {
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      body: draft.body,
      attachments: draft.attachmentPaths,
    })
    return { route: 'native' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.startsWith(MAIL_COMPOSE_UNSUPPORTED)) throw new Error(message)
    await openUrl(buildMailtoUrl(draft))
    await revealItemInDir(draft.folderPath)
    const reason = message.slice(MAIL_COMPOSE_UNSUPPORTED.length).replace(/^:\s*/, '').trim()
    return { route: 'mailto', reason: reason || null }
  }
}
