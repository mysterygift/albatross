import { HelpCircle } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useCurrentProduction } from '@/features/productions/context'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useLocation } from 'react-router-dom'

type TopBarProps = {
  onOpenTutorial?: () => void
}

export function TopBar({ onOpenTutorial }: TopBarProps) {
  const {
    productions,
    currentProductionId,
    setCurrentProductionId,
  } = useCurrentProduction()
  const location = useLocation()

  const isProductionsPage = location.pathname === '/productions'

  const value =
    currentProductionId && productions.some((p) => p.id === currentProductionId)
      ? currentProductionId
      : undefined

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      {isProductionsPage && (
        <div className="flex flex-1 items-center gap-4">
          <span className="text-muted-foreground text-sm">Current Production</span>
          <Select value={value} onValueChange={(v) => setCurrentProductionId(v || null)}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select a production..." />
            </SelectTrigger>
            <SelectContent>
              {productions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            onOpenTutorial?.()
          }}
          aria-label="Open tutorial"
        >
          <HelpCircle className="size-4" />
        </Button>
      </div>
    </header>
  )
}
