export type PrimaryCallSheetContact = {
  department: string
  name: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

type ContactLike = PrimaryCallSheetContact

/**
 * Operational contacts for the top of the call sheet (not the full key-contact roster).
 * Matches are by free-text department labels from key_contacts.
 */
export function selectPrimaryCallSheetContacts(contacts: readonly ContactLike[]): PrimaryCallSheetContact[] {
  const norm = (d: string) => d.trim().toLowerCase()
  const matchers: Array<(d: string) => boolean> = [
    (d) => (d.includes('1st') || d.includes('first')) && /\bad\b|assistant director/.test(d),
    (d) => d.includes('2nd') && /\bad\b|assistant director/.test(d),
    (d) => d.includes('3rd') && /\bad\b|assistant director/.test(d),
    (d) =>
      d.includes('production coordinator') ||
      d.includes('prod coord') ||
      d.includes('production co-ordinator'),
    (d) => d.includes('unit production') || /\bupm\b/.test(d),
    (d) => d.includes('production office') || d.includes('prod office') || d.includes('company office'),
  ]

  const picked = new Set<ContactLike>()
  const out: PrimaryCallSheetContact[] = []

  for (const match of matchers) {
    const row = contacts.find((c) => {
      if (picked.has(c)) return false
      const d = norm(c.department)
      return d.length > 0 && match(d)
    })
    if (row) {
      picked.add(row)
      out.push({
        department: row.department,
        name: row.name,
        phone: row.phone,
        email: row.email,
        notes: row.notes,
      })
    }
  }

  return out
}

export function primaryContactShowsEmail(department: string): boolean {
  const d = department.trim().toLowerCase()
  if (!d) return false
  return (
    d.includes('coordinator') ||
    d.includes('production office') ||
    d.includes('prod office') ||
    d.includes('company office') ||
    d.includes('unit production') ||
    /\bupm\b/.test(d)
  )
}
