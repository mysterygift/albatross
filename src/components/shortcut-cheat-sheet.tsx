import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShortcutHint } from '@/components/shortcut-hint'
import { isMacPlatform } from '@/app/menuSchema'
import { buildShortcutSections } from '@/components/shortcutSections'

export function ShortcutCheatSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const sections = buildShortcutSections(isMacPlatform())
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Available anywhere in Albatross.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {sections.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="mb-2 text-sm font-medium">{section.title}</h3>
              <ul className="space-y-1.5">
                {section.rows.map((row) => (
                  <li key={`${section.title}-${row.label}`} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <ShortcutHint keys={row.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
