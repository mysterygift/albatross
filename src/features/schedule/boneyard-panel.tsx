/**
 * Boneyard column: far-right "final resting place" for discarded strips.
 * State transition: SCHEDULED → BONEYARD (no hard delete). Strips can be
 * dropped here from the board or sent via amber skull; strips here can be
 * dragged back to Unscheduled or to a shoot day.
 */
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Skull } from 'lucide-react'
import type { StripboardStrip } from '@/lib/db/types'
import type { Scene, Shot } from '@/lib/db/types'
import { StripItem } from './strip-item'

export type BoneyardPanelProps = {
  droppableId?: string
  strips: StripboardStrip[]
  scenes: Scene[]
  shots: Shot[]
  estimatedShootMinutesByShotId: Map<string, number>
  /** Optional: permanently delete a strip from Boneyard. Only in Boneyard. */
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
  shots,
  estimatedShootMinutesByShotId,
  onDeleteStrip,
}: BoneyardPanelProps) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-lg border min-h-0 overflow-hidden transition-colors bg-zinc-200/90 dark:bg-zinc-800/90 border-amber-500/60 ${
        isOver ? 'ring-2 ring-amber-500/50 border-amber-500' : ''
      }`}
      title={isOver ? 'Drop to send to Boneyard' : undefined}
    >
      <div className="px-4 py-3 border-b border-amber-500/30">
        <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
          <Skull className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          Boneyard
        </h2>
      </div>
      {isOver && (
        <p className="text-center text-sm font-medium text-amber-600 dark:text-amber-400 px-2 py-2 bg-amber-500/10">
          Drop to send to Boneyard
        </p>
      )}
      <div className="flex flex-1 flex-col gap-2 overflow-auto p-2 min-h-0">
        {strips.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            No strips in Boneyard.
          </p>
        ) : (
          strips.map((strip) => (
            <DraggableBoneyardStrip key={strip.id} strip={strip}>
              <div className="rounded-md border border-amber-600/20 px-3 py-2 opacity-90">
                <StripItem
                  strip={strip}
                  scenes={scenes}
                  shots={shots}
                  estimatedMinutesDefault={
                    strip.strip_type === 'SHOT' && strip.shot_id
                      ? estimatedShootMinutesByShotId.get(strip.shot_id) ?? 0
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
