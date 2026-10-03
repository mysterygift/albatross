import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ShortcutTooltip } from '@/components/shortcut-hint'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from './SectionTutorialPanel'
import { SECTION_STEPS, resolveTutorialSection } from './sectionSteps'
import { TUTORIAL_SECTIONS } from './tutorialSections'

/** Top-bar "?" that opens the short tutorial for the page the user is on. Hidden on pages without one. */
export function PageHelpButton() {
  const { pathname } = useLocation()
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [open, setOpen] = useState(false)
  const sectionId = resolveTutorialSection(pathname)
  if (!sectionId) return null
  const section = TUTORIAL_SECTIONS.find((s) => s.id === sectionId)
  if (!section) return null
  // The guided tutorial already owns a panel for this section; avoid opening two.
  const guidedPanelActive = progress?.currentSection === sectionId

  const finish = (complete: boolean) => {
    updateProgress((prev) => ({
      ...prev,
      currentSection: prev.currentSection === sectionId ? null : prev.currentSection,
      sections: {
        ...prev.sections,
        [sectionId]: complete
          ? 'complete'
          : prev.sections[sectionId] === 'not_started'
            ? 'in_progress'
            : prev.sections[sectionId],
      },
    }))
  }

  return (
    <>
      <ShortcutTooltip label="Page help">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(true)}
          aria-label="Page help"
        >
          <HelpCircle className="size-4" />
        </Button>
      </ShortcutTooltip>
      {!guidedPanelActive && (
        <SectionTutorialPanel
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) finish(false)
          }}
          sectionId={sectionId}
          sectionTitle={section.title}
          steps={SECTION_STEPS[sectionId]}
          progress={progress}
          updateProgress={(updater) => updateProgress((prev) => updater(prev))}
          onCompleteSection={() => {
            setOpen(false)
            finish(true)
          }}
        />
      )}
    </>
  )
}
