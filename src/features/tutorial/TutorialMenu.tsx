import { GraduationCap } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ShortcutTooltip } from '@/components/shortcut-hint'
import { useTutorial } from './engine/context'
import { resolveTutorialSection } from './flows'
import { TUTORIAL_SECTIONS } from './tutorialSections'
import { useLocation } from 'react-router-dom'

/** The graduation-cap button in the top bar: pause, resume, skip, restart, and choose a section. */
export function TutorialMenu() {
  const t = useTutorial()
  const { pathname } = useLocation()
  const running = t.status === 'running'
  const paused = t.status === 'paused'
  const sectionId = t.flow?.sectionId ?? resolveTutorialSection(pathname)
  const sectionTitle = TUTORIAL_SECTIONS.find((s) => s.id === sectionId)?.title
  const active = running || paused
  const allComplete = !!t.progress && Object.values(t.progress.sections).every((s) => s === 'complete')
  const hasProgress = !!t.progress && Object.values(t.progress.sections).some((s) => s !== 'not_started')

  return (
    <DropdownMenu>
      <ShortcutTooltip label="Tutorial">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" aria-label="Tutorial">
            <GraduationCap className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </ShortcutTooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {running ? 'Tutorial running' : paused ? 'Tutorial paused' : allComplete ? 'Tutorial complete' : 'Tutorial'}
        </DropdownMenuLabel>
        {running && <DropdownMenuItem onSelect={t.pause}>Pause tutorial</DropdownMenuItem>}
        {paused && <DropdownMenuItem onSelect={t.resume}>Resume tutorial</DropdownMenuItem>}
        {!active && hasProgress && !allComplete && (
          <DropdownMenuItem onSelect={() => void t.startAll()}>Continue tutorial</DropdownMenuItem>
        )}
        {!active && !hasProgress && <DropdownMenuItem onSelect={() => void t.startAll()}>Start tutorial</DropdownMenuItem>}
        {sectionTitle && (
          <DropdownMenuItem onSelect={() => void t.startForPage()}>Tutorial for {sectionTitle}</DropdownMenuItem>
        )}
        {sectionId && active && (
          <DropdownMenuItem onSelect={t.skipSection}>Skip this section</DropdownMenuItem>
        )}
        {sectionId && (
          <DropdownMenuItem onSelect={() => void t.startSection(sectionId, { scope: 'section', fresh: true })}>
            Restart this section
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void t.restartAll()}>Restart tutorial</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => t.setPickerOpen(true)}>Choose a section…</DropdownMenuItem>
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={t.endTutorial}>Skip tutorial</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
