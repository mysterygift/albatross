/**
 * Boneyard panel: holding area for discarded strips.
 * Amber border, graphite background. Strips can be dropped here from the board;
 * strips here can be dragged back to Unscheduled or to a shoot day.
 */
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { AlertTriangle } from 'lucide-react'
import type { StripboardStrip } from '@/lib/db/types'
import type { Scene } from '@/lib/db/types'
import { StripItem } from './strip-item'

export type BoneyardPanelProps = {
  droppableId?: string
  strips: StripboardStrip[]
  scenes: Scene[]
  estimatedShootMinutesBySceneId: Map<string, number>
  /** Optional: permanently delete a strip from Boneyard. Only available in Boneyard. */
  onDeleteStrip?: (strip: StripboardStrip) => void
}

function DraggableBoneyardStrip({
  strip,
  children,
}: {
  strip: StripboardStrip
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `boneyard:${strip.id}`,
    data: { type: 'boneyard-strip' as const, strip },
  })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? 'opacity-50' : ''}>
      {children}
    </div>
  )
}

export function BoneyardPanel({
  droppableId = 'boneyard-panel',
  strips,
  scenes,
  estimatedShootMinutesBySceneId,
  onDeleteStrip,
}: BoneyardPanelProps) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col gap-3 rounded-lg border-2 bg-zinc-200 dark:bg-zinc-800 p-4 min-h-0 overflow-auto transition-colors ${
        isOver
          ? 'border-amber-500 ring-2 ring-amber-500/50'
          : 'border-amber-600/70'
      }`}
      title={isOver ? 'Move to Boneyard' : undefined}
    >
      {isOver && (
        <p className="text-center text-sm font-medium text-amber-600 dark:text-amber-400">
          Move to Boneyard
        </p>
      )}
      <h2 className="font-semibold text-foreground flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        Boneyard
      </h2>
      <p className="text-muted-foreground text-xs">
        Discarded strips. Drag back to Unscheduled or to a shoot day to recover.
      </p>
      <div className="flex flex-1 flex-col gap-2 overflow-auto min-h-0">
        {strips.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            No strips in Boneyard.
          </p>
        ) : (
          strips.map((strip) => (
            <DraggableBoneyardStrip key={strip.id} strip={strip}>
              <div className="rounded-md border border-amber-600/30 px-3 py-2">
                <StripItem
                  strip={strip}
                  scenes={scenes}
                  estimatedMinutesDefault={
                    strip.strip_type === 'SCENE' && strip.scene_id
                      ? estimatedShootMinutesBySceneId.get(strip.scene_id) ?? 0
                      : undefined
                  }
                  onRemove={onDeleteStrip ? () => onDeleteStrip(strip) : undefined}
                />
              </div>
            </DraggableBoneyardStrip>
          ))
        )}
      </div>
    </div>
  )
}
