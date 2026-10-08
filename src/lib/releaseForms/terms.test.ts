import { describe, expect, it } from 'vitest'
import {
  STANDARD_CONTRIBUTOR_TERMS,
  STANDARD_GUARDIAN_TERMS,
  STANDARD_LOCATION_TERMS,
} from '@/lib/releaseForms/defaultTerms'
import { releasePdfFileName } from '@/lib/releaseForms/signReleaseForm'
import { BLANK_TOKEN_VALUE, formatSignedAt, renderTerms, termsParagraphs } from '@/lib/releaseForms/terms'

describe('renderTerms', () => {
  it('fills known tokens, tolerating spaces inside the braces', () => {
    expect(renderTerms('To {{production_company}} for {{ production_name }}.', {
      production_company: 'Maverick Live',
      production_name: 'Wild Rivers',
    })).toBe('To Maverick Live for Wild Rivers.')
  })

  it('prints a blank line for missing or empty values', () => {
    expect(renderTerms('At {{location_address}} on {{shoot_dates}}', { location_address: '  ' })).toBe(
      `At ${BLANK_TOKEN_VALUE} on ${BLANK_TOKEN_VALUE}`
    )
  })

  it('leaves unknown tokens as typed', () => {
    expect(renderTerms('Hello {{someone_else}}', {})).toBe('Hello {{someone_else}}')
  })
})

describe('standard terms', () => {
  it('use the company and production tokens instead of fixed names', () => {
    expect(STANDARD_CONTRIBUTOR_TERMS).not.toContain('Maverick Live')
    expect(STANDARD_CONTRIBUTOR_TERMS).toContain('{{production_company}}')
    expect(STANDARD_CONTRIBUTOR_TERMS).toContain('{{production_name}}')
    expect(STANDARD_LOCATION_TERMS).toContain('{{production_company}}, for the production {{production_name}}')
    expect(STANDARD_LOCATION_TERMS).toContain('{{location_address}}')
    expect(STANDARD_LOCATION_TERMS).toContain('{{shoot_dates}}')
  })

  it('split into the expected paragraphs', () => {
    expect(termsParagraphs(STANDARD_CONTRIBUTOR_TERMS)).toHaveLength(4)
    expect(termsParagraphs(STANDARD_LOCATION_TERMS)).toHaveLength(4)
    expect(termsParagraphs(STANDARD_GUARDIAN_TERMS)).toHaveLength(2)
  })
})

describe('termsParagraphs', () => {
  it('splits on blank lines and joins wrapped lines', () => {
    expect(termsParagraphs('One\nstill one\n\n\nTwo  \n \nThree')).toEqual(['One still one', 'Two', 'Three'])
  })
})

describe('formatting', () => {
  it('formats the signing time as a long date with a 24-hour time', () => {
    expect(formatSignedAt(new Date(2026, 9, 8, 14, 32))).toMatch(/^8 October 2026, 14:32/)
  })

  it('names signed PDFs by form, signer and local time', () => {
    const at = new Date(2026, 9, 8, 9, 5)
    expect(releasePdfFileName('contributor', 'Jane Smith', at)).toBe('contributor-release-jane-smith-2026-10-08-0905.pdf')
    expect(releasePdfFileName('location', '!!!', at)).toBe('location-release-signed-2026-10-08-0905.pdf')
  })
})

describe('production company is required', () => {
  it('is refused when saving settings and when signing', async () => {
    const { saveReleaseFormSettings, STANDARD_RELEASE_TERMS } = await import('@/lib/releaseForms/settings')
    await expect(saveReleaseFormSettings({ companyName: '  ', ...STANDARD_RELEASE_TERMS })).rejects.toThrow(
      /production company/
    )
    const { signReleaseForm } = await import('@/lib/releaseForms/signReleaseForm')
    await expect(
      signReleaseForm({
        productionId: 'p',
        formType: 'contributor',
        pdf: {
          title: 'T',
          companyName: '',
          productionName: 'P',
          termsParagraphs: [],
          details: [],
          signer: { name: 'N', signaturePng: new Uint8Array() },
          signedAt: new Date(),
          signedAtLabel: '',
        },
      })
    ).rejects.toThrow(/production company/)
  })
})
