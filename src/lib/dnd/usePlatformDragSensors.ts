import { MouseSensor, PointerSensor, TouchSensor, useSensor } from '@dnd-kit/core'
import { isMobilePlatform } from '@/lib/platform'

/** Long-press before a touch drag starts, so a normal swipe still scrolls the page. */
const TOUCH_DRAG_DELAY_MS = 250
const TOUCH_DRAG_TOLERANCE_PX = 8

/**
 * Pointer drag sensors for dnd-kit. Desktop keeps a PointerSensor that starts after `distance`
 * pixels. On touch platforms a PointerSensor would fight the page's own scrolling, so touch drags
 * start on long-press instead (TouchSensor), with a MouseSensor for an iPad trackpad or mouse.
 *
 * Spread the result into `useSensors(...)` alongside any KeyboardSensor.
 */
export function usePlatformDragSensors(distance: number) {
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance } })
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance } })
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: TOUCH_DRAG_TOLERANCE_PX },
  })
  return isMobilePlatform() ? [mouse, touch] : [pointer]
}
