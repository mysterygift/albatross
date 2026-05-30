export type SetupWorkspaceHandoffPhase =
  | 'idle'
  | 'fadingWelcome'
  | 'brandWash'
  | 'revealingApp'
  | 'complete'

export type SetupWorkspaceHandoffSnapshot = {
  armed: boolean
  phase: SetupWorkspaceHandoffPhase
}

let snapshot: SetupWorkspaceHandoffSnapshot = { armed: false, phase: 'idle' }
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

export function getSetupWorkspaceHandoffSnapshot(): SetupWorkspaceHandoffSnapshot {
  return snapshot
}

export function subscribeSetupWorkspaceHandoff(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Call only after successful first-time setup commit. */
export function armSetupWorkspaceHandoff(): void {
  snapshot = { armed: true, phase: 'idle' }
  emit()
}

/** Begins the one-time transition; returns false if not armed or already started. */
export function startSetupWorkspaceTransition(): boolean {
  if (!snapshot.armed || snapshot.phase !== 'idle') {
    return false
  }
  snapshot = { ...snapshot, phase: 'fadingWelcome' }
  emit()
  return true
}

export function advanceSetupWorkspaceHandoffPhase(phase: SetupWorkspaceHandoffPhase): void {
  snapshot = { ...snapshot, phase }
  emit()
}

export function resetSetupWorkspaceHandoffTransition(): void {
  if (!snapshot.armed) {
    return
  }
  snapshot = { ...snapshot, phase: 'idle' }
  emit()
}

export function disarmSetupWorkspaceHandoff(): void {
  snapshot = { armed: false, phase: 'idle' }
  emit()
}

export function isSetupWorkspaceHandoffArmed(): boolean {
  return snapshot.armed
}

export function isSetupWorkspaceTransitionActive(): boolean {
  return snapshot.phase !== 'idle' && snapshot.phase !== 'complete'
}

/** @internal Vitest only */
export function resetSetupWorkspaceHandoffForTests(): void {
  snapshot = { armed: false, phase: 'idle' }
  emit()
}
