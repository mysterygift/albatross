import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { sceneScheduleLabel } from '@/lib/schedule/sceneDisplay'
import type { Scene } from '@/lib/db/types'

export function StripboardColumn({
  scenes,
  onRemove,
}: {
  scenes: Scene[]
  shootDayId: string
  onRemove: (sceneId: string) => void
}) {
  return (
    <ul className="space-y-2">
      {scenes.map((scene) => (
        <SortableStripItem
          key={scene.id}
          scene={scene}
          onRemove={() => onRemove(scene.id)}
        />
      ))}
      {scenes.length === 0 && (
        <li className="text-muted-foreground rounded border border-dashed p-4 text-center text-sm">
          Drag scenes here or add from the list.
        </li>
      )}
    </ul>
  )
}

function SortableStripItem({
  scene,
  onRemove,
}: {
  scene: Scene
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between rounded border bg-card px-3 py-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div
        className="flex flex-1 cursor-grab items-center gap-2 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <span className="font-medium">Scene {scene.scene_number}</span>
        <span className="text-muted-foreground text-sm">— {sceneScheduleLabel(scene, null)}</span>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove}>
        <X className="size-4" />
      </Button>
    </li>
  )
}
