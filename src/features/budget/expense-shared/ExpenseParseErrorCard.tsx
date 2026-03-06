type ExpenseParseErrorCardProps = {
  message?: string
  rawJson: string
}

export function ExpenseParseErrorCard({
  message = 'Details could not be parsed. Showing raw JSON.',
  rawJson,
}: ExpenseParseErrorCardProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{message}</p>
      <pre className="text-xs overflow-auto rounded bg-muted/40 p-2">{rawJson}</pre>
    </div>
  )
}
