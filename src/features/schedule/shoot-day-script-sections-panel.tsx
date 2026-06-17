import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { listSectionsByIds } from '@/lib/db/repositories/scriptSections'
import { getShootDayById } from '@/lib/db/repositories/schedule'
import { loadShootDayCoverage, type ShootDayCoverageLoadResult } from '@/lib/db/coverageAnalysisService'
import type { ScriptSection } from '@/lib/db/types'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { CoverageIssuesList, CoverageIssuesSummary } from './coverage-issues-list'
import { SbRemoteNotice } from './sbRemoteNotice'

type PanelData = ShootDayCoverageLoadResult & {
  sectionsById: Record<string, ScriptSection>
}

async function loadPanelData(
  shootDayId: string,
  shootDayUnitId: string | null
): Promise<PanelData> {
  const result = await loadShootDayCoverage(shootDayId, { shootDayUnitId })
  const sectionIds = [...new Set([...result.includedSectionIds, ...result.fallbackSectionIds])]
  const sections = await listSectionsByIds(sectionIds)
  const sectionsById: Record<string, ScriptSection> = {}
  for (const section of sections) {
    sectionsById[section.id] = section
  }
  return { ...result, sectionsById }
}

function sectionLabel(section: ScriptSection | undefined, id: string): string {
  if (!section) return id.slice(0, 8)
  return section.label?.trim() ? section.label : 'Section'
}

/**
 * SB5/SB9 — Read-only summary of script sections required for a shoot day (optionally a single
 * unit). Shows shot-linked sections, full-scene fallbacks, coverage stats, and grouped issues.
 */
export function ShootDayScriptSectionsPanel({
  shootDayId,
  shootDayUnitId = null,
}: {
  shootDayId: string
  shootDayUnitId?: string | null
}) {
  const { data: shootDay } = useQuery({
    queryKey: ['shoot-day', shootDayId],
    queryFn: () => getShootDayById(shootDayId),
    enabled: !!shootDayId,
  })
  const { dataSourceKey } = useEffectiveDataSourceForProduction(shootDay?.production_id ?? null)
  const isRemoteProduction = dataSourceKey === 'remote_server'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shoot-day-script-sections', shootDayId, shootDayUnitId],
    queryFn: () => loadPanelData(shootDayId, shootDayUnitId),
    enabled: !!shootDayId,
  })

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Script Sections
        </p>
        <Link
          to="/schedule/script-sections"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          View all
        </Link>
      </div>

      {isRemoteProduction ? (
        <div className="mt-2">
          <SbRemoteNotice className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100 flex gap-2 items-start" />
        </div>
      ) : isLoading ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Deriving script sections…
        </p>
      ) : isError || !data ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Unable to derive script sections for this day.
        </p>
      ) : (
        <ShootDayScriptSectionsContent data={data} />
      )}
    </div>
  )
}

function ShootDayScriptSectionsContent({ data }: { data: PanelData }) {
  const { coverage, includedSectionIds, fallbackSectionIds, partialSceneIds, sectionsScheduledViaShotsOnly, sectionsById } =
    data
  const hasSections = includedSectionIds.length > 0 || fallbackSectionIds.length > 0

  return (
    <div className="mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Scheduled scenes" value={coverage.scheduledScenes} />
        <Stat label="Included" value={coverage.includedSections} />
        <Stat label="Full-scene fallback" value={coverage.fallbackSections} />
        <Stat label="Missing scenes" value={coverage.missingSections} />
        <Stat label="Estimated eighths" value={`~${coverage.totalEstimatedEighths}/8`} />
      </div>

      {!hasSections && (
        <p className="text-xs text-muted-foreground">
          No script sections derived for this day yet.
        </p>
      )}

      {includedSectionIds.length > 0 && (
        <SectionList
          title="Included (shot-linked)"
          ids={includedSectionIds}
          sectionsById={sectionsById}
          partialSceneIds={partialSceneIds}
          viaShotsOnly={sectionsScheduledViaShotsOnly}
        />
      )}

      {fallbackSectionIds.length > 0 && (
        <SectionList
          title="Full-scene fallback"
          ids={fallbackSectionIds}
          sectionsById={sectionsById}
          partialSceneIds={partialSceneIds}
          viaShotsOnly={sectionsScheduledViaShotsOnly}
        />
      )}

      <CoverageIssuesSummary issues={coverage.issues} />
      {coverage.issues.some((i) => i.code === 'mixed_script_versions') && (
        <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          This day includes sections from more than one script version. Review links on the Shot List or Script
          Sections page before exporting sides.
        </p>
      )}
      {coverage.issues.length > 0 && <CoverageIssuesList issues={coverage.issues} />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/40 px-2 py-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-foreground mt-0.5 text-sm font-medium">{value}</p>
    </div>
  )
}

function SectionList({
  title,
  ids,
  sectionsById,
  partialSceneIds,
  viaShotsOnly,
}: {
  title: string
  ids: string[]
  sectionsById: Record<string, ScriptSection>
  partialSceneIds: string[]
  viaShotsOnly: string[]
}) {
  const partialScenes = new Set(partialSceneIds)
  const viaShots = new Set(viaShotsOnly)
  return (
    <div>
      <p className="text-muted-foreground text-xs">{title}</p>
      <ul className="mt-1 space-y-1">
        {ids.map((id) => {
          const section = sectionsById[id]
          return (
            <li key={id} className="flex items-center gap-2 text-xs">
              <span className="text-foreground">{sectionLabel(section, id)}</span>
              {section && partialScenes.has(section.scene_id) && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                  partial
                </span>
              )}
              {viaShots.has(id) && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  via shots
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
