import { Mail, Phone } from 'lucide-react'
import type { Client } from '@/lib/db/types'

type Props = {
  client: Client | null
}

export function ClientContactCard({ client }: Props) {
  if (!client) {
    return (
      <p className="text-muted-foreground text-sm mt-2 rounded-lg border border-border bg-muted/20 px-3.5 py-3">
        Client details could not be loaded.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3.5 py-3 space-y-2 mt-2">
      <p className="text-sm font-medium text-foreground">{client.name}</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {client.email ? (
            <a href={`mailto:${client.email}`} className="text-primary hover:underline truncate">
              {client.email}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {client.phone ? (
            <a href={`tel:${client.phone}`} className="text-primary hover:underline truncate">
              {client.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>
    </div>
  )
}
