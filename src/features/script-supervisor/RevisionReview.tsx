import { Check, FileDiff, PenLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { RevisionOutcome, RevisionReview as Review, RevisionReviewItem } from '@/lib/db/repositories/scriptRevisions'
import { cn } from '@/lib/utils'

export type RevisionReviewProps = {
  review: Review
  touch: boolean
  busy: boolean
  /** Slates on the selected shoot day (only those can be picked to line again). */
  daySlateIds: ReadonlySet<string>
  onSelectSlate: (slateId: string) => void
  onReviewed: (id: string) => void
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function placed(c: Record<RevisionOutcome, number>): number {
  return c.carried + c.moved
}

/** True when anything from an earlier draft was recorded against this version. */
export function revisionRecorded(review: Review): boolean {
  const all = [...Object.values(review.totals.tramlines), ...Object.values(review.totals.annotations)]
  return all.some((n) => n > 0)
}

/** One-line summary of what came across from the earlier draft. */
export function revisionSummary(review: Review): string {
  const t = review.totals.tramlines
  const a = review.totals.annotations
  const parts = [
    placed(t) > 0 ? count(placed(t), 'tramline', 'tramlines') : null,
    placed(a) > 0 ? count(placed(a), 'note', 'notes') : null,
  ].filter(Boolean)
  const from = review.fromLabel ? ` from ${review.fromLabel}` : ' from the previous draft'
  const carried = parts.length > 0 ? `Carried ${parts.join(' and ')}${from}` : `Nothing could be carried${from}`
  return review.items.length > 0 ? `${carried}. ${count(review.items.length, 'item needs', 'items need')} a look.` : `${carried}.`
}

function ItemRow({ item, props }: { item: RevisionReviewItem; props: RevisionReviewProps }) {
  const canSelect = item.itemType === 'tramline' && item.outcome === 'unmatched' && !!item.slateId && props.daySlateIds.has(item.slateId)
  return (
    <li className="flex flex-wrap items-start gap-3 rounded-lg border border-border px-3 py-2">
      <span
        aria-hidden
        className={cn(
          'mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]',
          item.outcome === 'unmatched' ? 'border border-dashed border-foreground/70' : 'bg-secondary text-secondary-foreground'
        )}
      >
        {item.itemType === 'annotation' ? <PenLine className="size-3" /> : null}
      </span>
      <div className="flex-1 min-w-[180px] space-y-0.5">
        <p className="text-sm">
          <span className="font-mono font-semibold">{item.label}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {item.outcome === 'unmatched'
              ? item.itemType === 'tramline'
                ? 'Couldn’t be placed: line it again or dismiss'
                : 'Couldn’t be placed'
              : 'Placed: check it'}
          </span>
        </p>
        {item.notes.length > 0 && <p className="text-xs text-muted-foreground">{item.notes.join('. ')}.</p>}
        {item.wasOn && <p className="text-xs text-muted-foreground truncate">Was on: {item.wasOn}</p>}
      </div>
      <div className="flex gap-2">
        {canSelect && (
          <Button type="button" variant="outline" size={props.touch ? 'lg' : 'sm'} onClick={() => props.onSelectSlate(item.slateId!)}>
            Select slate
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size={props.touch ? 'lg' : 'sm'}
          disabled={props.busy}
          aria-label={`${item.outcome === 'unmatched' ? 'Dismiss' : 'Mark checked'}: ${item.label}`}
          onClick={() => props.onReviewed(item.id)}
        >
          <Check aria-hidden />
          {item.outcome === 'unmatched' ? 'Dismiss' : 'Checked'}
        </Button>
      </div>
    </li>
  )
}

/** Script revised (SS10): what came across from the earlier draft and what needs a look. */
export function RevisionReview(props: RevisionReviewProps) {
  const { review } = props
  return (
    <section aria-label="Script revision" className="rounded-xl border border-border bg-card p-3 space-y-2">
      <p role="status" className="flex items-start gap-2 text-sm">
        <FileDiff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {revisionSummary(review)}
          {review.relined > 0 && (
            <span className="text-muted-foreground"> {count(review.relined, 'tramline has', 'tramlines have')} been lined again.</span>
          )}
        </span>
      </p>
      {review.items.length > 0 && (
        <ul className="space-y-1.5" aria-label="Revision review">
          {review.items.map((item) => (
            <ItemRow key={item.id} item={item} props={props} />
          ))}
        </ul>
      )}
    </section>
  )
}
