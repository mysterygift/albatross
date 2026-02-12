import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentProduction } from '@/features/productions/context'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function TopBar() {
  const {
    productions,
    currentProductionId,
    setCurrentProductionId,
  } = useCurrentProduction()
  const navigate = useNavigate()

  const value =
    currentProductionId && productions.some((p) => p.id === currentProductionId)
      ? currentProductionId
      : undefined

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/productions')}
          className="gap-1"
        >
          <Plus className="size-4" />
          New
        </Button>
      </div>
    </header>
  )
}
