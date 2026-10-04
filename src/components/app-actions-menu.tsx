import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  commandLabels,
  resolveMenuSectionForPath,
  runMenuCommand,
  sectionMenuSpecs,
} from '@/app/menuSchema'
import { useCurrentProduction } from '@/features/productions/context'
import { useLegacyServerPublishEnabled } from '@/hooks/useServerPublishEnabled'
import { hasNativeMenuBar } from '@/lib/platform'

/** Section commands that work without a current production. */
const NO_PRODUCTION_COMMANDS = new Set(['people_open_cast_manager', 'people_open_crew_manager'])

type AppActionsMenuProps = {
  onOpenShortcuts?: () => void
}

/**
 * The native menu bar's File / app / section menus as an in-app dropdown, for platforms that have
 * no menu bar (iOS, browser). Each item runs the same handler as the native menu item.
 */
export function AppActionsMenu({ onOpenShortcuts }: AppActionsMenuProps) {
  const { pathname } = useLocation()
  const { currentProduction } = useCurrentProduction()
  const { data: publishEnabled = false } = useLegacyServerPublishEnabled()
  if (hasNativeMenuBar()) return null

  const hasProduction = Boolean(currentProduction)
  const section = sectionMenuSpecs.find((spec) => spec.key === resolveMenuSectionForPath(pathname))
  const sectionCommands = section?.commands.filter((cmd) => !cmd.disabled) ?? []

  const item = (id: string, requiresProduction: boolean) => (
    <DropdownMenuItem key={id} disabled={requiresProduction && !hasProduction} onSelect={() => runMenuCommand(id)}>
      {commandLabels[id] ?? id}
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          aria-label="App menu"
          data-testid="app-actions-menu-trigger"
        >
          <Menu className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          {item('new_project', false)}
          {item('import_project', false)}
          {item('export_project', true)}
          {publishEnabled ? item('publish_to_server', true) : null}
        </DropdownMenuGroup>
        {section && sectionCommands.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{section.menuLabel}</DropdownMenuLabel>
            <DropdownMenuGroup>
              {sectionCommands.map((cmd) => item(cmd.id, !NO_PRODUCTION_COMMANDS.has(cmd.id)))}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {item('app_settings', false)}
          {onOpenShortcuts ? (
            <DropdownMenuItem onSelect={onOpenShortcuts}>Keyboard shortcuts</DropdownMenuItem>
          ) : null}
          {item('file_logout', false)}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
