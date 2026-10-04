import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

export type MissingBookingRow = { key: string; date: string; role: string; name: string }

/**
 * Orange warning button for the Bookings page header. Hovering (or focusing) it lists every
 * cast member who is needed on a shoot day but not booked.
 */
export function MissingBookingsHoverCard({ rows }: { rows: MissingBookingRow[] }) {
  if (rows.length === 0) return null
  const label = `${rows.length} cast needed but not booked`
  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="border-amber-500/60 text-amber-600 hover:text-amber-600 focus-visible:ring-amber-500/50 dark:text-amber-400 dark:hover:text-amber-400"
          aria-label={label}
        >
          <AlertTriangle className="size-4" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-96 p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium text-foreground">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          Cast needed but not booked
          <span className="ml-auto text-xs font-normal text-muted-foreground">{rows.length}</span>
        </div>
        <div className="max-h-72 overflow-y-auto px-4 py-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 font-medium">Role</th>
                <th className="py-1 font-medium">Cast</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 tabular-nums text-foreground">{row.date}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{row.role}</td>
                  <td className="py-1.5 text-foreground">{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
