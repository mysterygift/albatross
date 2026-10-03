import { HelpCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProductionSwitcher } from '@/components/production-switcher'
import { SidebarTrigger } from '@/components/ui/sidebar'

type TopBarProps = {
  onOpenTutorial?: () => void
  onOpenSearch?: () => void
}

export function TopBar({ onOpenTutorial, onOpenSearch }: TopBarProps) {
  return (
    <header data-slot="top-bar" className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <div className="ml-auto flex items-center gap-2">
        <ProductionSwitcher />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            onOpenSearch?.()
          }}
          aria-label="Search"
        >
          <Search className="size-4" />
        </Button>
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
