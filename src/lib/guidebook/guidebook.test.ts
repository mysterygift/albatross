import { describe, expect, it } from 'vitest'

import {
  allHeadingIds,
  buildChapters,
  extractHeadings,
  findChapter,
  guidebookChapters,
  guidebookPath,
  resolveGuidebookLink,
} from './guidebook'

describe('extractHeadings', () => {
  it('lists h2/h3 with GitHub-style ids, ignores code fences and de-duplicates', () => {
    const md = ['# Title', '## Add a `shoot day`', '```', '## not a heading', '```', '### Steps', '## Steps', '### Steps', '#### deep'].join('\n')
    expect(extractHeadings(md)).toEqual([
      { id: 'add-a-shoot-day', text: 'Add a shoot day', level: 2 },
      { id: 'steps', text: 'Steps', level: 3 },
      { id: 'steps-1', text: 'Steps', level: 2 },
      { id: 'steps-2', text: 'Steps', level: 3 },
    ])
    expect(allHeadingIds(md)).toContain('deep')
  })
})

describe('buildChapters', () => {
  it('puts README first as the index and orders chapters numerically', () => {
    const chapters = buildChapters({
      '/GUIDEBOOK/10-budget.md': '# 10. Budget',
      '/GUIDEBOOK/README.md': '# The Guidebook',
      '/GUIDEBOOK/2-two.md': '# 2. Two',
    })
    expect(chapters.map((c) => c.slug)).toEqual(['index', '2-two', '10-budget'])
    expect(chapters[0]!.title).toBe('The Guidebook')
  })
})

describe('resolveGuidebookLink', () => {
  it('classifies links', () => {
    expect(resolveGuidebookLink('#steps')).toEqual({ kind: 'anchor', id: 'steps' })
    expect(resolveGuidebookLink('https://example.com')).toEqual({ kind: 'external', url: 'https://example.com' })
    expect(resolveGuidebookLink('05-schedule.md#stripboard')).toEqual({
      kind: 'chapter',
      slug: '05-schedule',
      hash: '#stripboard',
    })
    expect(resolveGuidebookLink('README.md')).toEqual({ kind: 'chapter', slug: 'index', hash: '' })
    expect(resolveGuidebookLink('../README.md#opening-an-unsigned-app')).toEqual({
      kind: 'external',
      url: 'https://github.com/mysterygift/albatross/blob/main/README.md#opening-an-unsigned-app',
    })
    expect(resolveGuidebookLink('99-missing.md')).toEqual({ kind: 'none' })
  })
  it('builds in-app paths', () => {
    expect(guidebookPath('index')).toBe('/settings/guidebook')
    expect(guidebookPath('05-schedule', '#x')).toBe('/settings/guidebook/05-schedule#x')
  })
})

describe('bundled guidebook', () => {
  it('bundles the contents page and numbered chapters', () => {
    expect(guidebookChapters[0]!.slug).toBe('index')
    expect(guidebookChapters.length).toBeGreaterThan(10)
    expect(findChapter(undefined)?.slug).toBe('index')
    expect(findChapter('nope')).toBeUndefined()
  })

  it('has no broken chapter links or anchors', () => {
    const problems: string[] = []
    for (const chapter of guidebookChapters) {
      const ids = new Set(allHeadingIds(chapter.markdown))
      for (const m of chapter.markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = m[1]!
        const link = resolveGuidebookLink(href)
        if (link.kind === 'none' && !href.startsWith('images/')) problems.push(`${chapter.slug}: ${href}`)
        if (link.kind === 'anchor' && !ids.has(link.id)) problems.push(`${chapter.slug}: ${href}`)
        if (link.kind === 'chapter' && link.hash) {
          const target = findChapter(link.slug)!
          if (!allHeadingIds(target.markdown).includes(link.hash.slice(1))) problems.push(`${chapter.slug}: ${href}`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})
