import type { ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'

import { cn } from '@/lib/utils'
import { resolveGuidebookImage, resolveGuidebookLink } from '@/lib/guidebook/guidebook'

interface GuidebookMarkdownProps {
  markdown: string
  onOpenChapter: (slug: string, hash: string) => void
  onJumpToAnchor: (id: string) => void
  onOpenExternal: (url: string) => void
}

function GuidebookImage({ src, alt }: { src?: string; alt?: string }) {
  const url = resolveGuidebookImage(src)
  if (!url) {
    return (
      <span
        role="img"
        aria-label={alt}
        className="my-4 flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground"
      >
        Screenshot: {alt}
      </span>
    )
  }
  return <img src={url} alt={alt ?? ''} loading="lazy" className="my-4 max-w-full rounded-lg border border-border" />
}

/** Renders guidebook markdown (GFM, heading ids) with app styling and in-app link handling. */
export function GuidebookMarkdown({ markdown, onOpenChapter, onJumpToAnchor, onOpenExternal }: GuidebookMarkdownProps) {
  const components: Components = {
    h1: (p) => <h1 className="mb-4 text-3xl font-semibold tracking-tight" {...omitNode(p)} />,
    h2: (p) => <h2 className="mt-10 mb-3 scroll-mt-4 border-b border-border pb-2 text-xl font-semibold" {...omitNode(p)} />,
    h3: (p) => <h3 className="mt-6 mb-2 scroll-mt-4 text-base font-semibold" {...omitNode(p)} />,
    h4: (p) => <h4 className="mt-4 mb-1 scroll-mt-4 text-sm font-semibold" {...omitNode(p)} />,
    p: (p) => <p className="my-3 text-sm leading-6" {...omitNode(p)} />,
    ul: (p) => <ul className="my-3 list-disc space-y-1.5 pl-6 text-sm leading-6" {...omitNode(p)} />,
    ol: (p) => <ol className="my-3 list-decimal space-y-2 pl-6 text-sm leading-6" {...omitNode(p)} />,
    li: (p) => <li className="[&>ol]:mt-2 [&>p]:my-1 [&>ul]:mt-2" {...omitNode(p)} />,
    blockquote: (p) => (
      <blockquote
        className="my-4 rounded-r-md border-l-4 border-primary/50 bg-muted/40 px-4 py-2 [&>p]:my-1"
        {...omitNode(p)}
      />
    ),
    hr: () => <hr className="my-8 border-border" />,
    strong: (p) => <strong className="font-semibold" {...omitNode(p)} />,
    pre: (p) => (
      <pre
        className="my-4 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs [&_code]:bg-transparent [&_code]:p-0"
        {...omitNode(p)}
      />
    ),
    code: ({ className, ...p }) => (
      <code className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]', className)} {...omitNode(p)} />
    ),
    table: (p) => (
      <div className="my-4 overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm" {...omitNode(p)} />
      </div>
    ),
    thead: (p) => <thead className="bg-muted/50" {...omitNode(p)} />,
    th: (p) => <th className="border-b border-border px-3 py-2 text-left font-medium" {...omitNode(p)} />,
    td: (p) => <td className="border-t border-border px-3 py-2 align-top [&_code]:whitespace-nowrap" {...omitNode(p)} />,
    img: ({ src, alt }) => <GuidebookImage src={typeof src === 'string' ? src : undefined} alt={alt} />,
    a: ({ href, children }) => {
      const link = resolveGuidebookLink(href)
      if (link.kind === 'none') return <span>{children}</span>
      const url = link.kind === 'external' ? link.url : undefined
      return (
        <a
          href={url ?? href}
          className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
          onClick={(e) => {
            e.preventDefault()
            if (link.kind === 'anchor') onJumpToAnchor(link.id)
            else if (link.kind === 'chapter') onOpenChapter(link.slug, link.hash)
            else if (link.kind === 'external') onOpenExternal(link.url)
          }}
        >
          {children}
        </a>
      )
    },
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
      {markdown}
    </ReactMarkdown>
  )
}

/** react-markdown passes the hast `node`; it must not reach the DOM. */
function omitNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const { node: _node, ...rest } = props as T & ComponentProps<'div'>
  void _node
  return rest as Omit<T, 'node'>
}
