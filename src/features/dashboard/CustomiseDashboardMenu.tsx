import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DASHBOARD_CARD_OPTIONS, type DashboardCardId } from './dashboardLayoutPrefs'

export function CustomiseDashboardMenu({
  hidden,
  onChange,
}: {
  hidden: DashboardCardId[]
  onChange: (hidden: DashboardCardId[]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal aria-hidden="true" />
          Customise
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Show cards</DropdownMenuLabel>
        {DASHBOARD_CARD_OPTIONS.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.id}
            checked={!hidden.includes(opt.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(checked ? hidden.filter((id) => id !== opt.id) : [...hidden, opt.id])
            }
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={hidden.length === 0} onSelect={() => onChange([])}>
          Reset
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
