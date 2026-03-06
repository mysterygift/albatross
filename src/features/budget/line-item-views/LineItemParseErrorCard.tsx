type LineItemParseErrorCardProps = {
  message?: string
  rawJson: string
}

export function LineItemParseErrorCard({
  message = 'Typed details could not be parsed. Showing raw data.',
  rawJson,
}: LineItemParseErrorCardProps) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Typed details
      </p>
      <p className="text-sm text-amber-600 dark:text-amber-500">{message}</p>
      <pre className="text-xs overflow-auto rounded bg-muted/40 p-2 font-mono whitespace-pre-wrap break-all">
        {rawJson}
      </pre>
    </div>
  )
}
