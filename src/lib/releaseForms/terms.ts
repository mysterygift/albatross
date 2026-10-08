export type ReleaseFormType = 'contributor' | 'location'

export function isReleaseFormType(value: unknown): value is ReleaseFormType {
  return value === 'contributor' || value === 'location'
}

export const RELEASE_FORM_TITLES: Record<ReleaseFormType, string> = {
  contributor: 'Contributor Release Form',
  location: 'Location Release Form',
}

/** Tokens that release terms may contain, filled in when a form is opened for signing. */
export const RELEASE_TOKENS = [
  { token: 'production_company', label: 'Production company' },
  { token: 'production_name', label: 'Production name' },
  { token: 'location_address', label: 'Location address' },
  { token: 'shoot_dates', label: 'Shoot date(s)' },
] as const

export type ReleaseTokenValues = Partial<Record<(typeof RELEASE_TOKENS)[number]['token'], string>>

/** Shown in place of a token whose value has not been filled in. */
export const BLANK_TOKEN_VALUE = '________'

/** Replaces `{{token}}` with its value; blank values print as a line, unknown tokens stay as typed. */
export function renderTerms(template: string, values: ReleaseTokenValues): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) => {
    if (!RELEASE_TOKENS.some((t) => t.token === name)) return match
    const value = values[name as keyof ReleaseTokenValues]?.trim()
    return value ? value : BLANK_TOKEN_VALUE
  })
}

/** Splits terms into paragraphs on blank lines, collapsing single line breaks inside a paragraph. */
export function termsParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

/** "8 October 2026, 14:32 BST": the local date and time a form is signed, with its time zone. */
export function formatSignedAt(date: Date): string {
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date)
  return `${day}, ${time}`
}
