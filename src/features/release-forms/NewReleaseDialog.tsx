import { MapPin, UserRound, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RELEASE_FORM_TITLES, type ReleaseFormType } from '@/lib/releaseForms/terms'

const CHOICES: Array<{ type: ReleaseFormType; icon: LucideIcon; description: string }> = [
  {
    type: 'contributor',
    icon: UserRound,
    description: 'Permission to use a person’s name, likeness, voice and appearance in the production.',
  },
  {
    type: 'location',
    icon: MapPin,
    description: 'Permission to film at a property on the shoot dates, signed by the owner.',
  },
]

export function NewReleaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" dismissOnOutsideInteraction>
        <DialogHeader>
          <DialogTitle>New release</DialogTitle>
          <DialogDescription>Choose the form to bring up for signing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map(({ type, icon: Icon, description }) => (
            <button
              key={type}
              type="button"
              className="bg-card hover:bg-accent focus-visible:ring-ring/50 flex min-h-36 flex-col items-start gap-3 rounded-xl border p-5 text-left shadow-sm transition-colors outline-none focus-visible:ring-[3px]"
              onClick={() => {
                onOpenChange(false)
                navigate(`/release-forms/new/${type}`)
              }}
            >
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="space-y-1">
                <span className="block font-semibold">{RELEASE_FORM_TITLES[type]}</span>
                <span className="text-muted-foreground block text-sm">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
