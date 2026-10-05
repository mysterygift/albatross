import { Plus } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ShootDayScene } from '@/lib/db/repositories/scriptSupervisor'
import { SCENE_STATUS_LABEL, type SceneProgressStatus } from '@/lib/script-supervisor/progress'
import { sceneTimeLabel } from '@/lib/script-supervisor/slatePanel'
import { cn } from '@/lib/utils'

import { SceneStatusPip } from './SceneStatusPip'
import type { TabletArrangement } from './TabletWorkspace'

type OtherScene = { id: string; scene_number: string; title?: string | null }

export type TabletSceneNavProps = {
  arrangement: TabletArrangement
  dayLabel: string
  dayScenes: ShootDayScene[]
  /** Scenes not on this day, for logging an unscheduled scene. */
  otherScenes: OtherScene[]
  sceneId: string | null
  statusOf: (sceneId: string) => SceneProgressStatus
  onSelect: (sceneId: string) => void
}

function SceneButton({
  number,
  title,
  detail,
  status,
  active,
  vertical,
  onClick,
}: {
  number: string
  title: string | null
  detail: string
  status: SceneProgressStatus
  active: boolean
  vertical: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={[`Scene ${number}`, title, SCENE_STATUS_LABEL[status]].filter(Boolean).join(', ')}
      title={title ?? undefined}
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        vertical ? 'flex w-full min-h-16 flex-col justify-center gap-1 px-3 py-2' : 'flex h-14 items-center gap-2.5 border px-4',
        active
          ? vertical
            ? 'bg-primary/15 shadow-[inset_2px_0_0_var(--color-primary)]'
            : 'border-primary/45 bg-primary/15'
          : vertical
            ? 'hover:bg-muted/40'
            : 'border-border hover:bg-muted/40'
      )}
    >
      <span className="flex items-center gap-2">
        <SceneStatusPip status={status} />
        <span className={cn('font-mono font-semibold', vertical ? 'text-lg leading-6' : 'text-base')}>{number}</span>
      </span>
      {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
    </button>
  )
}

/**
 * Scene picker for the tablet layout: a rail down the side when the workspace is wide, a strip across the
 * top when it is narrow. Each scene shows its status, number and Int/Ext · time of day; any other scene in
 * the production can be picked from "Other".
 */
export function TabletSceneNav({ arrangement, dayLabel, dayScenes, otherScenes, sceneId, statusOf, onSelect }: TabletSceneNavProps) {
  const vertical = arrangement === 'wide'
  const unscheduled = sceneId && !dayScenes.some((s) => s.id === sceneId) ? otherScenes.find((s) => s.id === sceneId) ?? null : null
  const others = otherScenes.filter((s) => s.id !== unscheduled?.id)

  return (
    <nav
      aria-label="Scenes"
      className={cn('min-h-0 min-w-0', vertical ? 'flex flex-col gap-2' : 'flex items-center gap-2 overflow-x-auto pb-1')}
    >
      {vertical && <p className="px-1 text-xs uppercase tracking-wide text-muted-foreground">{dayLabel}</p>}
      {dayScenes.length === 0 && !unscheduled && (
        <p className={cn('text-sm text-muted-foreground', vertical ? 'px-1' : 'shrink-0')}>Nothing on the stripboard for this day.</p>
      )}
      <ul className={cn(vertical ? 'min-h-0 flex-1 space-y-1.5 overflow-y-auto' : 'flex shrink-0 gap-2')}>
        {dayScenes.map((s) => (
          <li key={s.id}>
            <SceneButton
              number={s.scene_number}
              title={s.title}
              detail={sceneTimeLabel(s.int_ext, s.day_night)}
              status={statusOf(s.id)}
              active={s.id === sceneId}
              vertical={vertical}
              onClick={() => onSelect(s.id)}
            />
          </li>
        ))}
        {unscheduled && (
          <li>
            <SceneButton
              number={unscheduled.scene_number}
              title={unscheduled.title ?? null}
              detail="Unscheduled"
              status={statusOf(unscheduled.id)}
              active
              vertical={vertical}
              onClick={() => onSelect(unscheduled.id)}
            />
          </li>
        )}
      </ul>
      {others.length > 0 && (
        <Select value="" onValueChange={onSelect}>
          <SelectTrigger
            aria-label="Another scene"
            className={cn('h-11 text-base', vertical ? 'w-full px-2' : 'h-14 w-auto shrink-0 border-dashed px-4')}
          >
            {!vertical && <Plus aria-hidden />}
            <SelectValue placeholder={vertical ? 'Other' : 'Other scene'} />
          </SelectTrigger>
          <SelectContent>
            {others.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.scene_number}
                {s.title ? ` | ${s.title}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </nav>
  )
}
