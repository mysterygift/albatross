import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatSheetDate, type SceneSheet } from '@/lib/breakdown/sceneSheet'
import { BREAKDOWN_STATUS_LABEL } from '@/lib/breakdown/matching'
import { BreakdownStatusDot, CategoryLabel } from './script-breakdown-ui'

function Field({ label, value, className }: { label: string; value: string | number | null; className?: string }) {
  return (
    <div className={className}>
      <div className="min-h-[1.5rem] border-b border-foreground/60 pb-0.5 text-sm font-medium">
        {value == null || value === '' ? <span className="text-muted-foreground">—</span> : value}
      </div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

/** On-screen breakdown sheet for one scene, laid out like the paper sheet. */
export function BreakdownSheet({
  sheet,
  exporting,
  onExportScene,
  onExportAll,
  onOpenElement,
}: {
  sheet: SceneSheet
  exporting: boolean
  onExportScene: () => void
  onExportAll: () => void
  onOpenElement?: (elementId: string) => void
}) {
  const h = sheet.header
  return (
    <div className="grid gap-5 p-4" aria-label={`Breakdown sheet for scene ${h.sceneNumber}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">
            Script breakdown <span className="text-muted-foreground">|</span> {h.productionTitle}
          </h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            <dt className="font-semibold">Scene:</dt>
            <dd>
              {h.sceneOrdinal} / {h.sceneCount}
            </dd>
            <dt className="font-semibold">Date:</dt>
            <dd>{formatSheetDate(h.breakdownDate) ?? <span className="text-muted-foreground">Not broken down yet</span>}</dd>
            <dt className="font-semibold">INT. / EXT.:</dt>
            <dd>{h.intExt ?? '—'}</dd>
            <dt className="font-semibold">Day / night:</dt>
            <dd>{h.dayNight ?? '—'}</dd>
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onExportScene} disabled={exporting}>
            <FileDown className="size-4" aria-hidden />
            Export scene PDF
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onExportAll} disabled={exporting}>
            <FileDown className="size-4" aria-hidden />
            Export all scenes
          </Button>
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
        <Field label="Production no." value={h.productionCode} />
        <Field label="Production title" value={h.productionTitle} />
        <Field label="Breakdown page no." value={h.breakdownPageNo} />
        <Field label="Scene no." value={h.sceneNumber} />
        <Field label="Scene name" value={h.sceneName} />
        <Field label="Script page no." value={h.scriptPages} />
        <Field label="Description" value={h.description} className="sm:col-span-2" />
        <Field label="Page count" value={h.pageCount} />
        <div className="hidden sm:col-span-2 sm:block" />
        <Field label="Location name" value={h.locationName} />
      </div>

      <div className="grid grid-cols-1 border-l border-t border-foreground/70 sm:grid-cols-2 lg:grid-cols-3">
        {sheet.categories.map((cat) => (
          <section
            key={cat.category}
            aria-label={cat.label}
            className="min-h-32 border-b border-r border-foreground/70 p-2.5"
          >
            <CategoryLabel category={cat.category} />
            {cat.items.length > 0 && (
              <ul className="mt-2 grid gap-1">
                {cat.items.map((item) => (
                  <li key={item.elementId} className="flex items-baseline gap-2 text-sm">
                    <BreakdownStatusDot status={item.status} className="translate-y-[-1px]" />
                    <button
                      type="button"
                      className="min-w-0 text-left hover:underline disabled:no-underline"
                      disabled={!onOpenElement}
                      onClick={() => onOpenElement?.(item.elementId)}
                      title={`${BREAKDOWN_STATUS_LABEL[item.status]}${item.detail ? ` · ${item.detail}` : ''}`}
                    >
                      {item.name}
                    </button>
                    {item.occurrences > 1 && <span className="font-mono text-xs text-muted-foreground">×{item.occurrences}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
