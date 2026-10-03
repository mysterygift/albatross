import { ChevronsUpDown, Plus, Settings2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentProduction } from '@/features/productions/context'
import { DEMO_SLUG } from '@/lib/db/seed/constants'

export function ProductionSwitcher() {
  const { productions, currentProductionId, setCurrentProductionId } = useCurrentProduction()
  const navigate = useNavigate()

  const current = currentProductionId
    ? productions.find((p) => p.id === currentProductionId) ?? null
    : null
  const isDemo = current?.slug === DEMO_SLUG

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-[240px] justify-between gap-2 font-normal"
          aria-label="Current production"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={current ? 'truncate' : 'text-muted-foreground truncate'}>
              {current ? current.name : 'Select a production...'}
            </span>
            {isDemo ? <Badge variant="secondary">Demo</Badge> : null}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        <DropdownMenuRadioGroup
          value={current?.id ?? ''}
          onValueChange={(v) => setCurrentProductionId(v || null)}
        >
          {productions.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              <span className="truncate">{p.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {productions.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={() => navigate('/productions?new=1')}>
          <Plus /> New production...
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/productions')}>
          <Settings2 /> Manage productions
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
