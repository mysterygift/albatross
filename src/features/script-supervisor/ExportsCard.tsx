import { FileDown, FileSpreadsheet, ScrollText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { SceneCoverage } from '@/lib/db/scriptSupervisorExportService'
import { cn } from '@/lib/utils'
import type { ExportKind } from './exports'

export type ExportsCardProps = {
  dayLabel: string
  coverage: SceneCoverage[] | undefined
  coverageLoading: boolean
  exporting: ExportKind | null
  /** Shown after an export, e.g. scenes left out of the marked-up script. */
  notice: string | null
  touch: boolean
  onExport: (kind: ExportKind) => void
  onOpenScene: (sceneId: string) => void
}

function coverageText(c: SceneCoverage): string {
  switch (c.state) {
    case 'no_script':
      return 'Not in an imported script'
    case 'unlined':
      return 'Not lined yet'
    case 'under':
      return `${c.underCovered} ${c.underCovered === 1 ? 'block has' : 'blocks have'} fewer than two tramlines`
    case 'covered':
      return `Every block has two or more tramlines (${c.tramlines})`
  }
}

function Swatch({ state }: { state: SceneCoverage['state'] }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-4 w-1 shrink-0 rounded-sm',
        state === 'covered' && 'bg-primary/55',
        state === 'under' && 'bg-[repeating-linear-gradient(180deg,var(--foreground)_0_3px,transparent_3px_6px)]',
        (state === 'unlined' || state === 'no_script') && 'border border-muted-foreground/60'
      )}
    />
  )
}

/** The day's script supervisor paperwork (SS9) and the two-tramline check for scenes slated that day. */
export function ExportsCard(props: ExportsCardProps) {
  const { touch, exporting } = props
  const size = touch ? 'lg' : 'default'
  const busy = exporting != null
  const flagged = (props.coverage ?? []).filter((c) => c.state !== 'covered').length

  return (
    <section aria-label="Exports" className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="space-y-0.5">
        <h2 className="font-medium">Exports · {props.dayLabel}</h2>
        <p className="text-xs text-muted-foreground">
          For the editor and production office. Each export also saves a copy to Documents → Set paperwork.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size={size} disabled={busy} onClick={() => props.onExport('continuity')}>
          <FileDown aria-hidden />
          {exporting === 'continuity' ? 'Exporting…' : 'Continuity sheets (PDF)'}
        </Button>
        <Button type="button" variant="outline" size={size} disabled={busy} onClick={() => props.onExport('editors_log')}>
          <FileSpreadsheet aria-hidden />
          {exporting === 'editors_log' ? 'Exporting…' : 'Editor’s log (CSV)'}
        </Button>
        <Button type="button" variant="outline" size={size} disabled={busy} onClick={() => props.onExport('marked_up_day')}>
          <ScrollText aria-hidden />
          {exporting === 'marked_up_day' ? 'Exporting…' : 'Marked-up script (PDF)'}
        </Button>
      </div>
      {props.notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {props.notice}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          Two-tramline check
          {props.coverage && props.coverage.length > 0 && (
            <span className="ml-2 font-normal text-xs text-muted-foreground">
              {flagged === 0 ? 'All scenes covered' : `${flagged} of ${props.coverage.length} ${props.coverage.length === 1 ? 'scene needs' : 'scenes need'} a look`}
            </span>
          )}
        </h3>
        {props.coverageLoading ? (
          <p className="text-xs text-muted-foreground">Checking…</p>
        ) : !props.coverage || props.coverage.length === 0 ? (
          <p className="text-xs text-muted-foreground">No scenes slated on this day yet.</p>
        ) : (
          <ul className="space-y-1" aria-label="Coverage by scene">
            {props.coverage.map((c) => (
              <li key={c.sceneId}>
                <button
                  type="button"
                  onClick={() => props.onOpenScene(c.sceneId)}
                  aria-label={`Scene ${c.sceneNumber}: ${coverageText(c)}. Open the script.`}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    touch ? 'min-h-11' : 'py-1.5'
                  )}
                >
                  <Swatch state={c.state} />
                  <span className="w-12 font-mono font-semibold">{c.sceneNumber}</span>
                  <span className={cn('flex-1 min-w-0 truncate', c.state === 'covered' && 'text-muted-foreground')}>{coverageText(c)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
