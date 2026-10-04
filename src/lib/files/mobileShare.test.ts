import { describe, expect, it } from 'vitest'
import { localPathFromUrl } from '@/lib/files/mobileShare'

describe('localPathFromUrl', () => {
  it('decodes convertFileSrc URLs back to paths', () => {
    const path = '/var/mobile/Containers/Data/Application/ABC/Library/Application Support/x/attachments/a b.pdf'
    expect(localPathFromUrl(`asset://localhost/${encodeURIComponent(path)}`)).toBe(path)
    expect(localPathFromUrl(`http://asset.localhost/${encodeURIComponent(path)}`)).toBe(path)
  })

  it('accepts file:// URLs and absolute paths', () => {
    expect(localPathFromUrl('file:///tmp/My%20File.pdf')).toBe('/tmp/My File.pdf')
    expect(localPathFromUrl('/tmp/x.pdf')).toBe('/tmp/x.pdf')
  })

  it('returns null for web URLs', () => {
    expect(localPathFromUrl('https://openrouteservice.org')).toBeNull()
    expect(localPathFromUrl('mailto:someone@example.com')).toBeNull()
  })
})
