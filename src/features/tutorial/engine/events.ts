/**
 * Tiny in-memory bus that domain writes use to tell the tutorial a user action has succeeded.
 * Repositories call `emitTutorialEvent` after a successful write; `emit` is a no-op with no listeners,
 * so ordinary app use pays almost nothing for it.
 */
export type TutorialEventName =
  | 'scene.created'
  | 'shot.created'
  | 'shootday.created'
  | 'stripboard.strip_added'
  | 'stripboard.scene_moved'
  | 'budget.item_created'
  | 'budget.expense_created'
  | 'person.created'
  | 'booking.created'
  | 'cast.assigned'
  | 'location.created'
  | 'task.created'
  | 'deliverable.created'
  | 'equipment.created'
  | 'callsheet.generated'

export type TutorialEvent = {
  name: TutorialEventName
  /** Every emitted event carries the production it wrote to, so demo or other-project edits never count. */
  productionId: string | null
  payload?: Record<string, unknown>
}

type Listener = (event: TutorialEvent) => void

const listeners = new Set<Listener>()

export function subscribeTutorialEvents(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitTutorialEvent(name: TutorialEventName, productionId: string | null | undefined, payload?: Record<string, unknown>): void {
  if (listeners.size === 0) return
  const event: TutorialEvent = { name, productionId: productionId ?? null, payload }
  for (const listener of [...listeners]) {
    try {
      listener(event)
    } catch {
      // A broken listener must never break a save.
    }
  }
}

/** True while a tutorial step is listening. Lets callers skip extra lookups during ordinary use. */
export function hasTutorialListeners(): boolean {
  return listeners.size > 0
}

/** Emits for a successful write and returns the result unchanged, so it can wrap a `return` expression. */
export function tutorialEmitted<T>(name: TutorialEventName, productionId: string | null | undefined, result: T): T {
  emitTutorialEvent(name, productionId)
  return result
}
