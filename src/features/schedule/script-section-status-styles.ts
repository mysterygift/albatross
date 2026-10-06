import type { DerivedSectionStatus } from '@/lib/db/scriptSectionStatus'

/** Badge styling per derived status. */
export const STATUS_BADGE_CLASS: Record<DerivedSectionStatus, string> = {
  no_coverage: 'border-amber-500/60 text-amber-500',
  covered: 'border-transparent bg-slate-500/15 text-slate-400',
  scheduled: 'border-transparent bg-violet-500/15 text-violet-400',
  shot: 'border-transparent bg-primary/15 text-primary',
  cut: 'border-border text-muted-foreground line-through',
}

/** Solid fill per derived status (gutter bands, coverage meter). */
export const STATUS_FILL_CLASS: Record<DerivedSectionStatus, string> = {
  no_coverage: 'bg-amber-500',
  covered: 'bg-slate-400',
  scheduled: 'bg-violet-400',
  shot: 'bg-primary',
  cut: 'bg-muted-foreground/40',
}
