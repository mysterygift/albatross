import type { ReactNode } from 'react'

type ExpenseTypedSectionProps = {
  title?: string
  children: ReactNode
}

export function ExpenseTypedSection({ title = 'Typed transaction details', children }: ExpenseTypedSectionProps) {
  return (
    <div className="rounded-md border border-border p-3 bg-background">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  )
}
