import GithubSlugger from 'github-slugger'

/**
 * The in-app Guidebook is the markdown in `GUIDEBOOK/` at the repo root, bundled at build time.
 * Chapters are `NN-slug.md` (first `# ` line is the title); `README.md` is the contents page.
 * Images live in `GUIDEBOOK/images/` and are referenced as `images/<file>`.
 */
const rawChapters = import.meta.glob('/GUIDEBOOK/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const imageUrls = import.meta.glob('/GUIDEBOOK/images/*.{png,jpg,jpeg,gif,webp,svg}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Where files outside `GUIDEBOOK/` (for example the root README) are linked from the guidebook. */
export const REPO_BLOB_URL = 'https://github.com/mysterygift/albatross/blob/main'

export const GUIDEBOOK_INDEX_SLUG = 'index'

export interface GuidebookHeading {
  id: string
  text: string
  level: 2 | 3
}

export interface GuidebookChapter {
  slug: string
  title: string
  markdown: string
  headings: GuidebookHeading[]
}

/** Plain text of a heading's markdown, matching what rehype-slug sees. */
function plainHeadingText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim()
}

/** Every heading id in a document, as rehype-slug assigns them (duplicates get `-1`, `-2`, ...). */
export function allHeadingIds(markdown: string): string[] {
  return scanHeadings(markdown).map((h) => h.id)
}

export function extractHeadings(markdown: string): GuidebookHeading[] {
  return scanHeadings(markdown).filter((h): h is GuidebookHeading => h.level === 2 || h.level === 3)
}

function scanHeadings(markdown: string): { id: string; text: string; level: number }[] {
  const slugger = new GithubSlugger()
  const out: { id: string; text: string; level: number }[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const text = plainHeadingText(m[2]!)
    const id = slugger.slug(text)
    out.push({ id, text, level: m[1]!.length })
  }
  return out
}

function chapterTitle(markdown: string, fallback: string): string {
  const m = /^#\s+(.*)$/m.exec(markdown)
  return m ? plainHeadingText(m[1]!) : fallback
}

function slugFromPath(path: string): string {
  const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
  return stem === 'README' ? GUIDEBOOK_INDEX_SLUG : stem
}

export function buildChapters(files: Record<string, string>): GuidebookChapter[] {
  return Object.entries(files)
    .map(([path, markdown]) => {
      const slug = slugFromPath(path)
      return { slug, title: chapterTitle(markdown, slug), markdown, headings: extractHeadings(markdown) }
    })
    .sort((a, b) => {
      if (a.slug === GUIDEBOOK_INDEX_SLUG) return -1
      if (b.slug === GUIDEBOOK_INDEX_SLUG) return 1
      return a.slug.localeCompare(b.slug, undefined, { numeric: true })
    })
}

export const guidebookChapters: GuidebookChapter[] = buildChapters(rawChapters)

export function findChapter(
  slug: string | undefined,
  chapters: GuidebookChapter[] = guidebookChapters
): GuidebookChapter | undefined {
  return chapters.find((c) => c.slug === (slug || GUIDEBOOK_INDEX_SLUG))
}

export type GuidebookLink =
  | { kind: 'anchor'; id: string }
  | { kind: 'chapter'; slug: string; hash: string }
  | { kind: 'external'; url: string }
  | { kind: 'none' }

/** Classifies a link found in guidebook markdown. */
export function resolveGuidebookLink(
  href: string | undefined,
  chapters: GuidebookChapter[] = guidebookChapters
): GuidebookLink {
  if (!href) return { kind: 'none' }
  if (href.startsWith('#')) return { kind: 'anchor', id: decodeURIComponent(href.slice(1)) }
  if (/^(https?:|mailto:)/i.test(href)) return { kind: 'external', url: href }
  const sibling = /^(?:\.\/)?([^/#]+)\.md(#.*)?$/.exec(href)
  if (sibling) {
    const slug = slugFromPath(`${sibling[1]}.md`)
    if (chapters.some((c) => c.slug === slug)) return { kind: 'chapter', slug, hash: sibling[2] ?? '' }
    return { kind: 'none' }
  }
  if (href.startsWith('../') && !href.startsWith('../../')) {
    return { kind: 'external', url: `${REPO_BLOB_URL}/${href.slice(3)}` }
  }
  return { kind: 'none' }
}

/** Bundled URL for a guidebook image reference such as `images/05-stripboard.png`, if the file exists. */
export function resolveGuidebookImage(src: string | undefined): string | undefined {
  if (!src) return undefined
  const clean = src.replace(/^\.\//, '')
  if (/^(https?:|data:)/i.test(clean)) return clean
  return imageUrls[`/GUIDEBOOK/${clean}`]
}

export function guidebookPath(slug: string, hash = ''): string {
  return slug === GUIDEBOOK_INDEX_SLUG ? `/guidebook${hash}` : `/guidebook/${slug}${hash}`
}
