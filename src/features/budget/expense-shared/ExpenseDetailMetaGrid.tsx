import type { ReactNode } from 'react'

type ExpenseDetailMetaGridProps = {
  children: ReactNode
  className?: string
}

export function ExpenseDetailMetaGrid({ children, className = '' }: ExpenseDetailMetaGridProps) {
  return <div className={`grid gap-3 ${className}`}>{children}</div>
}

type ExpenseDetailMetaRowProps = {
  label: string
  value: ReactNode
}

export function ExpenseDetailMetaRow({ label, value }: ExpenseDetailMetaRowProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  )
}

export function ExpenseDetailMetaGridTwoCol({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}
